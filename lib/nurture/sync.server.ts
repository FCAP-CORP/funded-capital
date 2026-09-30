/**
 * Keeps Klaviyo in step with Lending OS's nurture decisions. Run by the cron
 * (app/api/cron/nurture, every 15 minutes) and, for the drain alone, right
 * after Luis enrols someone (app/crm/nurture/actions.ts, via `after()`).
 *
 * NOT STAFF-GUARDED, deliberately: Vercel Cron has no Clerk session, so
 * `assertCrmStaff()` could never pass. Its one door from outside is the cron
 * route, which checks CRON_SECRET first (guards.regress.ts §14). Its reach is
 * narrow and asserted: it reads people, deals and activities, and writes only
 * `nurture_enrollments`, `activities` (automation rows, keyed), its own three
 * cockpit tables (`nurture_programs`, `nurture_control`, `nurture_events`)
 * and the single column `contacts.email_subscribed` — and only ever to FALSE.
 * The two staff buttons that reach Klaviyo (`switchFlow`,
 * `refreshFromKlaviyo`) are called only from app/crm/nurture/actions.ts,
 * after its staff check (guard §14).
 *
 * EACH RUN, IN THIS ORDER:
 *
 *   1. AUTO-STOP. Anyone who wrote back, started a deal, had a deal move, was
 *      contacted by Luis, or unsubscribed stops — before anything else runs,
 *      so no step below can add a person who should have stopped.
 *   2. FLOWS. Read each programme's Klaviyo flow: live or not, its emails,
 *      and (once a day) rendered previews. Stored so the page never waits on
 *      Klaviyo. Nobody is released to a flow that is not confirmed live.
 *   3. MIRROR. Read each list back from Klaviyo with consent. Unsubscribes and
 *      spam complaints are written into Lending OS (email_subscribed = false,
 *      one-way); bounces and removals made by hand in Klaviyo stop the row.
 *   4. EVENTS. Sent, opened, clicked, bounced, spam, unsubscribed — for the
 *      five nurture flows only — into nurture_events. Never into activities:
 *      a marketing email is not Luis getting in touch.
 *   5. GUARD. Bounces or spam complaints over the line pause every release.
 *   6. AUTO-ENROL. Weekday mornings, once per programme per day, programmes
 *      set to Automatic queue everyone who qualifies on a fresh read.
 *   7. RELEASE. The warm-up moves queued people to "add to Klaviyo", within
 *      today's cap, weekday mornings only, never while paused.
 *   8. DRAIN. Make the Klaviyo calls the rows ask for — add or remove — with
 *      a claim lease so two runs cannot make the same call, and backoff on
 *      failure. A row that fails MAX_SYNC_ATTEMPTS times stops retrying and
 *      shows on the page with a "Try again" button.
 *
 * Without KLAVIYO_PRIVATE_KEY, step 1 still runs (it only touches Lending OS)
 * and the rest is skipped; the page says Klaviyo is not connected.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  addToList, getFlow, isScopeError, klaviyoKey, listEvents, listMembers, removeFromList, renderTemplate,
  setFlowStatus, upsertProfile, LIST_BATCH,
} from "@/lib/comms/klaviyo.server";
import {
  ENROLL_MAX, MAX_SYNC_ATTEMPTS, PROGRAMS, STOP_LABEL, classify, cleanEmail, klaviyoVerdict, profilePayload, programByKey,
  retryDelayMinutes, stopReason, type ProgramKey, type StopReason,
} from "./nurture";
import {
  EVENT_METRICS, HEALTH_DAYS, OPT_OUT_METRICS, PREVIEW_CONTEXT, optOutEmails, optOutsFrom, carryPreviews, deliverability, eventsFrom, flowIsLive, flowProblems,
  inReleaseWindow, nyClock, parseFlow, parseMode, planRelease, previewsStale, snapshotOf, toNurtureEvent,
  type FlowSnapshot, type ReleaseBlock,
} from "./cockpit";
import {
  activeSignalsSql, enrolQueuedSql, healthCountsSql, isoOf, nurtureContactsSql, releaseCountsSql, strOf,
  toNurtureContact, uuidArray,
} from "./rows";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);

/** Whether the Klaviyo half is configured. For the page's banner; the key never leaves this module. */
export function nurtureSyncConfigured(): boolean {
  return klaviyoKey() !== null;
}

export type SyncSummary = {
  configured: boolean;
  stopped: number;
  unsubscribedMirrored: number;
  flowsRead: number;
  events: number;
  paused: boolean;
  autoEnrolled: number;
  released: number;
  releaseBlocked: ReleaseBlock | null;
  added: number;
  removed: number;
  failed: number;
  timedOut: boolean;
};

/* ------------------------------------------------------------- stopping */

/**
 * Stop one active enrolment and log it on the person's timeline, in one
 * statement: the WHERE status = 'active' makes a second stop a no-op, and the
 * activity is keyed by the enrolment id so it is written once.
 */
function stopStatement(id: string, reason: StopReason, by: string, syncState: "pending_remove" | "removed" = "pending_remove") {
  return sql`
    WITH s AS (
      UPDATE nurture_enrollments
      SET status = 'stopped', stop_reason = ${reason}, stopped_at = now(), stopped_by = ${by},
          sync_state = CASE WHEN sync_state IN ('removed', 'queued') THEN 'removed' ELSE ${syncState} END,
          sync_attempts = 0, sync_error = NULL, next_sync_at = now(), updated_at = now()
      WHERE id = ${id}::uuid AND status = 'active'
      RETURNING id, contact_id, program
    )
    INSERT INTO activities (contact_id, kind, source, subject, dedup_key)
    SELECT contact_id, 'automation', 'nurture',
           'Nurture stopped (' || CASE program ${sql.raw(PROGRAMS.map((p) => `WHEN '${p.key}' THEN '${p.name.replace(/'/g, "''")}'`).join(" "))} ELSE program END || '): ' || ${STOP_LABEL[reason]},
           'nurture:out:' || id::text
    FROM s
    ON CONFLICT (dedup_key) DO NOTHING
  `;
}

async function runBatch(statements: ReturnType<typeof sql>[]): Promise<void> {
  // db.batch sends them as one request inside one transaction (neon-http has no db.transaction).
  for (let i = 0; i < statements.length; i += 50) {
    const chunk = statements.slice(i, i + 50);
    if (chunk.length === 0) continue;
    await db.batch(chunk.map((s) => db.execute(s)) as unknown as Parameters<typeof db.batch>[0]);
  }
}

async function applyAutoStops(): Promise<number> {
  const rows = rowsOf(await db.execute(activeSignalsSql()));
  const stops: ReturnType<typeof sql>[] = [];
  for (const r of rows) {
    const reason = stopReason({
      enrolledAt: isoOf(r.enrolled_at) ?? new Date().toISOString(),
      email: strOf(r.email),
      emailSubscribed: r.email_subscribed === null || r.email_subscribed === undefined ? null : r.email_subscribed === true,
      lastInboundAt: isoOf(r.last_inbound_at),
      lastOutboundAt: isoOf(r.last_outbound_at),
      lastArrivalAt: isoOf(r.last_arrival_at),
      lastForwardMoveAt: isoOf(r.last_forward_move_at),
    });
    if (reason) stops.push(stopStatement(String(r.id), reason, "nurture-sync"));
  }
  await runBatch(stops);
  return stops.length;
}

/* ------------------------------------------------------------- mirroring */

async function mirrorKlaviyo(key: string, deadline: number): Promise<{ stopped: number; unsubscribed: number }> {
  let stopped = 0, unsubscribed = 0;
  const rows = rowsOf(await db.execute(sql`
    SELECT id, contact_id, program, klaviyo_list_id, klaviyo_profile_id, synced_at
    FROM nurture_enrollments
    WHERE status = 'active' AND sync_state = 'added' AND klaviyo_profile_id IS NOT NULL
  `));
  const lists = [...new Set(rows.map((r) => String(r.klaviyo_list_id)))];
  for (const listId of lists) {
    if (Date.now() > deadline) break;
    const read = await listMembers(key, listId);
    if (!read.ok) continue; // the drain will surface a broken key; a missed mirror is caught next run
    const byProfile = new Map(read.members.map((m) => [m.profileId, m]));
    const statements: ReturnType<typeof sql>[] = [];
    for (const r of rows.filter((x) => String(x.klaviyo_list_id) === listId)) {
      const id = String(r.id);
      const member = byProfile.get(String(r.klaviyo_profile_id));
      if (!member) {
        // Only conclude "removed by hand" from a COMPLETE read, and not for someone
        // added in the last 15 minutes (Klaviyo's list reads can lag an add).
        const synced = Date.parse(String(isoOf(r.synced_at) ?? ""));
        if (read.complete && Number.isFinite(synced) && Date.now() - synced > 15 * 60_000) {
          statements.push(stopStatement(id, "removed_in_klaviyo", "klaviyo", "removed"));
          stopped++;
        }
        continue;
      }
      const verdict = klaviyoVerdict(member.marketing, listId);
      if (verdict === "unsubscribed") {
        // THE ONE CONSENT WRITE IN THIS MODULE, and it can only ever say no.
        statements.push(sql`UPDATE contacts SET email_subscribed = false, updated_at = now()
          WHERE id = ${String(r.contact_id)}::uuid AND email_subscribed IS DISTINCT FROM false`);
        statements.push(stopStatement(id, "unsubscribed", "klaviyo"));
        unsubscribed++; stopped++;
      } else if (verdict === "list_unsubscribed") {
        statements.push(stopStatement(id, "unsubscribed", "klaviyo"));
        stopped++;
      } else if (verdict === "bounced") {
        statements.push(stopStatement(id, "bounced", "klaviyo"));
        stopped++;
      }
    }
    await runBatch(statements);
  }
  return { stopped, unsubscribed };
}

/* --------------------------------------------------------------- draining */

type Claimed = { id: string; contactId: string; program: string; state: "pending_add" | "pending_remove"; listId: string; profileId: string | null; attempts: number };

async function claim(limit: number): Promise<Claimed[]> {
  const rows = rowsOf(await db.execute(sql`
    UPDATE nurture_enrollments e SET sync_claimed_at = now()
    WHERE e.id IN (
      SELECT id FROM nurture_enrollments
      WHERE sync_state IN ('pending_add', 'pending_remove')
        AND next_sync_at <= now()
        AND sync_attempts < ${MAX_SYNC_ATTEMPTS}
        AND (sync_claimed_at IS NULL OR sync_claimed_at < now() - interval '5 minutes')
      ORDER BY next_sync_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING e.id, e.contact_id, e.program, e.sync_state, e.klaviyo_list_id, e.klaviyo_profile_id, e.sync_attempts
  `));
  return rows.map((r) => ({
    id: String(r.id),
    contactId: String(r.contact_id),
    program: String(r.program),
    state: r.sync_state === "pending_remove" ? "pending_remove" : "pending_add",
    listId: String(r.klaviyo_list_id),
    profileId: strOf(r.klaviyo_profile_id),
    attempts: Number(r.sync_attempts ?? 0),
  }));
}

/** Success: the CASE keeps a stop that arrived mid-call (pending_remove) from being overwritten. */
const doneAdd = (id: string, profileId: string) => sql`
  UPDATE nurture_enrollments
  SET sync_state = CASE WHEN sync_state = 'pending_add' THEN 'added' ELSE sync_state END,
      klaviyo_profile_id = ${profileId}, synced_at = now(), sync_claimed_at = NULL,
      sync_attempts = 0, sync_error = NULL, next_sync_at = now(), updated_at = now()
  WHERE id = ${id}::uuid`;
const doneRemove = (id: string) => sql`
  UPDATE nurture_enrollments
  SET sync_state = CASE WHEN sync_state = 'pending_remove' THEN 'removed' ELSE sync_state END,
      synced_at = now(), sync_claimed_at = NULL, sync_attempts = 0, sync_error = NULL, updated_at = now()
  WHERE id = ${id}::uuid`;
const failed = (c: Claimed, error: string) => sql`
  UPDATE nurture_enrollments
  SET sync_attempts = sync_attempts + 1, sync_error = ${error.slice(0, 300)},
      next_sync_at = now() + make_interval(mins => ${retryDelayMinutes(c.attempts + 1)}),
      sync_claimed_at = NULL, updated_at = now()
  WHERE id = ${c.id}::uuid`;

async function drain(key: string, deadline: number): Promise<{ added: number; removed: number; failed: number }> {
  let added = 0, removed = 0, fails = 0;
  for (let round = 0; round < 10 && Date.now() < deadline; round++) {
    const batch = await claim(100);
    if (batch.length === 0) break;
    const writes: ReturnType<typeof sql>[] = [];

    /* ---- adds: upsert each profile, then one list call per list ---- */
    const adds = batch.filter((c) => c.state === "pending_add");
    if (adds.length) {
      const people = new Map(
        rowsOf(await db.execute(nurtureContactsSql([...new Set(adds.map((a) => a.contactId))])))
          .map(toNurtureContact).map((p) => [p.id, p]),
      );
      const ready = new Map<string, { c: Claimed; profileId: string }[]>();
      for (const c of adds) {
        if (Date.now() > deadline) { writes.push(sql`UPDATE nurture_enrollments SET sync_claimed_at = NULL WHERE id = ${c.id}::uuid`); continue; }
        const person = people.get(c.contactId);
        const program = programByKey(c.program);
        // Re-checked at the last moment: consent can change between Enrol and now.
        if (!person || person.emailSubscribed === false || !cleanEmail(person.email) || !program) {
          // Never reached Klaviyo → nothing to remove. Reached it on an earlier try → remove.
          writes.push(stopStatement(c.id, person?.emailSubscribed === false ? "unsubscribed" : "no_email", "nurture-sync", c.profileId ? "pending_remove" : "removed"));
          writes.push(sql`UPDATE nurture_enrollments SET sync_claimed_at = NULL WHERE id = ${c.id}::uuid`);
          continue;
        }
        let up = await upsertProfile(key, profilePayload(person, program)!);
        if (!up.ok && !up.retryable) {
          // One retry without the external id, for a profile Klaviyo keys differently.
          const second = await upsertProfile(key, profilePayload(person, program, { withExternalId: false })!);
          if (second.ok) up = second;
        }
        if (!up.ok) { writes.push(failed(c, up.error)); fails++; continue; }
        const list = ready.get(c.listId) ?? [];
        list.push({ c, profileId: up.profileId });
        ready.set(c.listId, list);
      }
      for (const [listId, items] of ready) {
        for (let i = 0; i < items.length; i += LIST_BATCH) {
          const chunk = items.slice(i, i + LIST_BATCH);
          const res = await addToList(key, listId, chunk.map((x) => x.profileId));
          for (const x of chunk) {
            if (res.ok) { writes.push(doneAdd(x.c.id, x.profileId)); added++; }
            else {
              // Keep the profile id so the retry skips straight to the list call's outcome.
              writes.push(sql`UPDATE nurture_enrollments SET klaviyo_profile_id = ${x.profileId} WHERE id = ${x.c.id}::uuid`);
              writes.push(failed(x.c, res.error)); fails++;
            }
          }
        }
      }
    }

    /* ---- removes: one list call per list ---- */
    const removes = batch.filter((c) => c.state === "pending_remove");
    const byList = new Map<string, Claimed[]>();
    for (const c of removes) {
      if (!c.profileId) { writes.push(doneRemove(c.id)); removed++; continue; } // never reached Klaviyo
      const l = byList.get(c.listId) ?? [];
      l.push(c);
      byList.set(c.listId, l);
    }
    for (const [listId, items] of byList) {
      for (let i = 0; i < items.length; i += LIST_BATCH) {
        const chunk = items.slice(i, i + LIST_BATCH);
        const res = await removeFromList(key, listId, chunk.map((x) => x.profileId!));
        for (const x of chunk) {
          if (res.ok) { writes.push(doneRemove(x.id)); removed++; }
          else { writes.push(failed(x, res.error)); fails++; }
        }
      }
    }
    await runBatch(writes);
    if (batch.length < 100) break;
  }
  return { added, removed, failed: fails };
}

/* ------------------------------------------------------------- settings */

type ProgramRow = {
  program: ProgramKey;
  mode: "review" | "auto";
  flowStatus: string | null;
  flowCheckedAt: string | null;
  snapshot: FlowSnapshot | null;
  previewsRenderedAt: string | null;
  lastAutoEnrollOn: string | null;
};

async function readPrograms(): Promise<Map<ProgramKey, ProgramRow>> {
  const rows = rowsOf(await db.execute(sql`
    SELECT program, mode, flow_status, flow_checked_at, flow_snapshot, previews_rendered_at, last_auto_enroll_on::text AS last_auto_enroll_on
    FROM nurture_programs
  `));
  const out = new Map<ProgramKey, ProgramRow>();
  for (const r of rows) {
    const p = programByKey(r.program);
    if (!p) continue;
    out.set(p.key, {
      program: p.key,
      mode: parseMode(r.mode) ?? "review",
      flowStatus: strOf(r.flow_status),
      flowCheckedAt: isoOf(r.flow_checked_at),
      snapshot: snapshotOf(r.flow_snapshot),
      previewsRenderedAt: isoOf(r.previews_rendered_at),
      lastAutoEnrollOn: strOf(r.last_auto_enroll_on),
    });
  }
  return out;
}

async function isPaused(): Promise<boolean> {
  const r = rowsOf(await db.execute(sql`SELECT paused FROM nurture_control WHERE id = 1`));
  // No control row means migration 0016 has not run: behave as paused rather than release blind.
  return r.length === 0 || r[0].paused === true || r[0].paused === "t";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- flows */

/**
 * Read each programme's flow and store what the page shows. A failed read
 * records the error and leaves `flow_checked_at` alone, so the cached "live"
 * goes stale within the hour and releases stop — the safe direction.
 * Previews are rendered at most once a day (Klaviyo allows 60 renders a
 * minute), or on demand from the page's "Refresh from Klaviyo".
 */
async function refreshFlows(key: string, deadline: number, now: Date, forcePreviews = false): Promise<{ read: number; error: string | null }> {
  const programs = await readPrograms();
  let read = 0;
  let lastError: string | null = null;
  for (const p of PROGRAMS) {
    if (Date.now() > deadline) break;
    const row = programs.get(p.key);
    const got = await getFlow(key, p.klaviyoFlowId);
    if (!got.ok) {
      lastError = got.error;
      await db.execute(sql`UPDATE nurture_programs SET flow_error = ${got.error.slice(0, 300)}, updated_at = now() WHERE program = ${p.key}`);
      continue;
    }
    const parsed = parseFlow(got.json, { flowId: p.klaviyoFlowId, listId: p.klaviyoListId });
    if (!parsed) {
      await db.execute(sql`UPDATE nurture_programs SET flow_error = 'Klaviyo answered with something that is not this flow', updated_at = now() WHERE program = ${p.key}`);
      continue;
    }
    let snap = carryPreviews(row?.snapshot ?? null, parsed);
    let rendered = false;
    if ((forcePreviews || previewsStale(snap, forcePreviews ? null : row?.previewsRenderedAt ?? null, now)) && Date.now() < deadline - 30_000) {
      const emails = [];
      let allOk = true;
      for (const e of snap.emails) {
        if (!e.templateId) { emails.push(e); continue; }
        const r = await renderTemplate(key, e.templateId, PREVIEW_CONTEXT);
        emails.push({ ...e, html: r.ok ? r.html.slice(0, 200_000) : e.html ?? null });
        if (!r.ok) { allOk = false; if (isScopeError(r.error)) break; }
        await sleep(1_100); // Klaviyo: 3 renders a second burst, 60 a minute steady
      }
      snap = { ...snap, emails: [...emails, ...snap.emails.slice(emails.length)] };
      rendered = allOk;
    }
    await db.execute(sql`
      UPDATE nurture_programs
      SET flow_status = ${parsed.status || null}, flow_checked_at = ${now.toISOString()}::timestamptz, flow_error = NULL,
          flow_snapshot = ${JSON.stringify(snap)}::jsonb,
          previews_rendered_at = CASE WHEN ${rendered} THEN ${now.toISOString()}::timestamptz ELSE previews_rendered_at END,
          updated_at = now()
      WHERE program = ${p.key}
    `);
    read++;
  }
  return { read, error: lastError };
}

/* ---------------------------------------------------------------- events */

/**
 * Klaviyo's email events for the five nurture flows, matched to the
 * enrolment by Klaviyo profile and programme. An event for someone Lending OS
 * did not enrol (a test send, a profile added by hand) matches nothing and is
 * not kept. Deduplicated on Klaviyo's event id, so the overlap between runs
 * is harmless. The cursor only moves when every metric was read to the end.
 */
async function pullEvents(key: string, deadline: number, now: Date): Promise<number> {
  const c = rowsOf(await db.execute(sql`SELECT events_synced_until FROM nurture_control WHERE id = 1`));
  if (c.length === 0) return 0;
  const from = eventsFrom(isoOf(c[0].events_synced_until), now);
  let complete = true;
  let kept = 0;
  for (const m of EVENT_METRICS) {
    if (Date.now() > deadline) { complete = false; break; }
    const got = await listEvents(key, m.metricId, from);
    if (!got.ok) { complete = false; if (isScopeError(got.error)) break; continue; }
    if (!got.complete) complete = false;
    const inserts: ReturnType<typeof sql>[] = [];
    for (const raw of got.events) {
      const e = toNurtureEvent(m.kind, raw);
      if (!e) continue;
      inserts.push(sql`
        INSERT INTO nurture_events (klaviyo_event_id, enrollment_id, contact_id, program, kind, flow_message_id, subject, url, occurred_at)
        SELECT ${e.klaviyoEventId}, en.id, en.contact_id, en.program, ${e.kind}, ${e.flowMessageId}, ${e.subject}, ${e.url}, ${e.occurredAt}::timestamptz
        FROM nurture_enrollments en
        WHERE en.klaviyo_profile_id = ${e.profileId} AND en.program = ${e.program}
        ORDER BY en.enrolled_at DESC
        LIMIT 1
        ON CONFLICT (klaviyo_event_id) DO NOTHING
      `);
    }
    await runBatch(inserts);
    kept += inserts.length;
  }
  if (complete) {
    await db.execute(sql`UPDATE nurture_control SET events_synced_until = ${now.toISOString()}::timestamptz, updated_at = now() WHERE id = 1`);
  }
  return kept;
}

/* ------------------------------------------- unsubscribes from anyone */

/**
 * Mirror every Klaviyo unsubscribe and spam complaint into Lending OS, for
 * people who were never in a programme too (lib/nurture/cockpit.ts,
 * OPT_OUT_METRICS). Matched on the email address; `email_subscribed` only ever
 * goes to FALSE (guard §14). The cursor moves only after a complete read.
 */
async function mirrorAllOptOuts(key: string, deadline: number, now: Date): Promise<number> {
  const c = rowsOf(await db.execute(sql`SELECT unsubs_synced_until FROM nurture_control WHERE id = 1`));
  if (c.length === 0) return 0;
  const from = optOutsFrom(isoOf(c[0].unsubs_synced_until), now);
  let complete = true;
  let changed = 0;
  for (const m of OPT_OUT_METRICS) {
    if (Date.now() > deadline) { complete = false; break; }
    const got = await listEvents(key, m.metricId, from, 10, { withEmail: true });
    if (!got.ok) { complete = false; if (isScopeError(got.error)) break; continue; }
    if (!got.complete) complete = false;
    const emails = optOutEmails(got.events);
    for (let i = 0; i < emails.length; i += 200) {
      const chunk = emails.slice(i, i + 200);
      const r = rowsOf(await db.execute(sql`
        UPDATE contacts SET email_subscribed = false, updated_at = now()
        WHERE lower(email) IN (${sql.join(chunk.map((e) => sql`${e}`), sql`, `)})
          AND email_subscribed IS DISTINCT FROM false
        RETURNING id
      `));
      changed += r.length;
    }
  }
  if (complete) {
    await db.execute(sql`UPDATE nurture_control SET unsubs_synced_until = ${now.toISOString()}::timestamptz, updated_at = now() WHERE id = 1`);
  }
  return changed;
}

/* ----------------------------------------------------------------- guard */

/** Pause every release when bounces or complaints cross the line. Never un-pauses: that is Luis's call. */
async function applyDeliverabilityGuard(now: Date): Promise<boolean> {
  const r = rowsOf(await db.execute(healthCountsSql(HEALTH_DAYS, now)))[0] ?? {};
  const h = deliverability({ sent: Number(r.sent ?? 0), bounce: Number(r.bounce ?? 0), spam: Number(r.spam ?? 0), unsub: Number(r.unsub ?? 0) });
  if (h.level === "stop") {
    await db.execute(sql`
      UPDATE nurture_control
      SET paused = true, paused_reason = ${h.reason}, paused_at = now(), paused_by = 'deliverability-guard', updated_at = now()
      WHERE id = 1 AND paused = false
    `);
  }
  return isPaused();
}

/* ---------------------------------------------------------- auto-enrol */

/**
 * Programmes set to Automatic, whose flow is live, get everyone who qualifies
 * queued — once per programme per New York weekday, in the release window,
 * never while paused. The same fresh `classify()` the Enrol button runs; the
 * warm-up then decides when each person actually reaches Klaviyo.
 */
async function autoEnroll(now: Date, programs: Map<ProgramKey, ProgramRow>): Promise<number> {
  if (!inReleaseWindow(now)) return 0;
  const today = nyClock(now).day;
  const due = PROGRAMS.filter((p) => {
    const row = programs.get(p.key);
    return row && row.mode === "auto" && row.lastAutoEnrollOn !== today && flowIsLive(row.flowStatus, row.flowCheckedAt, now);
  });
  if (due.length === 0) return 0;

  const book = rowsOf(await db.execute(nurtureContactsSql())).map(toNurtureContact);
  const byProgram = new Map<ProgramKey, string[]>();
  for (const c of book) {
    const v = classify(c, now);
    if (v.program) byProgram.set(v.program, [...(byProgram.get(v.program) ?? []), c.id]);
  }
  let total = 0;
  for (const p of due) {
    const ids = (byProgram.get(p.key) ?? []).slice(0, ENROLL_MAX);
    const statements = [];
    if (ids.length) {
      statements.push(enrolQueuedSql({ program: p.key, listId: p.klaviyoListId, ids, by: "auto", subject: `Added to nurture automatically: ${p.name} (Klaviyo)` }));
    }
    statements.push(sql`UPDATE nurture_programs SET last_auto_enroll_on = ${today}::date, updated_at = now() WHERE program = ${p.key}`);
    const results = await db.batch(statements.map((st) => db.execute(st)) as unknown as Parameters<typeof db.batch>[0]);
    if (ids.length) total += Number(rowsOf((results as unknown as unknown[])[0])[0]?.n ?? 0);
  }
  return total;
}

/* --------------------------------------------------------------- release */

/** Move queued people to "add to Klaviyo", within the warm-up. */
async function releaseQueued(now: Date, programs?: Map<ProgramKey, ProgramRow>): Promise<{ released: number; blocked: ReleaseBlock | null }> {
  const progs = programs ?? await readPrograms();
  const live = new Set<string>(PROGRAMS.filter((p) => {
    const row = progs.get(p.key);
    return row ? flowIsLive(row.flowStatus, row.flowCheckedAt, now) : false;
  }).map((p) => p.key));
  const [counts, queued, paused] = await Promise.all([
    db.execute(releaseCountsSql(nyClock(now).day, now)),
    db.execute(sql`
      SELECT id, program, enrolled_at FROM nurture_enrollments
      WHERE status = 'active' AND sync_state = 'queued'
      ORDER BY enrolled_at
      LIMIT 3000
    `),
    isPaused(),
  ]);
  const c = rowsOf(counts)[0] ?? {};
  const plan = planRelease({
    queued: rowsOf(queued).map((r) => ({ id: String(r.id), program: String(r.program), enrolledAt: isoOf(r.enrolled_at) })),
    now,
    paused,
    livePrograms: live,
    releasedToday: Number(c.released_today ?? 0),
    priorReleaseDays: Number(c.prior_release_days ?? 0),
  });
  if (plan.ids.length === 0) return { released: 0, blocked: plan.blocked };
  const r = rowsOf(await db.execute(sql`
    UPDATE nurture_enrollments
    SET sync_state = 'pending_add', released_at = ${now.toISOString()}::timestamptz, next_sync_at = now(), updated_at = now()
    WHERE id = ANY(${uuidArray(plan.ids)}) AND status = 'active' AND sync_state = 'queued'
    RETURNING id
  `));
  return { released: r.length, blocked: null };
}

/* ------------------------------------------------------------ entry points */

/** The whole cycle. `budgetMs` is how long it may run before it stops starting new work. */
export async function runNurtureSync(budgetMs: number): Promise<SyncSummary> {
  const deadline = Date.now() + budgetMs;
  const now = new Date();
  const key = klaviyoKey();
  const stopped = await applyAutoStops();
  const empty = { flowsRead: 0, events: 0, autoEnrolled: 0, released: 0, releaseBlocked: null, added: 0, removed: 0, failed: 0, timedOut: false };
  if (!key) return { configured: false, stopped, unsubscribedMirrored: 0, paused: await isPaused(), ...empty };
  const f = await refreshFlows(key, deadline, now);
  const m = await mirrorKlaviyo(key, deadline);
  const events = await pullEvents(key, deadline, now);
  const optedOut = await mirrorAllOptOuts(key, deadline, now);
  const paused = await applyDeliverabilityGuard(now);
  const programs = await readPrograms();
  const autoEnrolled = paused ? 0 : await autoEnroll(now, programs);
  const rel = await releaseQueued(now, programs);
  const d = await drain(key, deadline);
  return {
    configured: true,
    stopped: stopped + m.stopped,
    unsubscribedMirrored: m.unsubscribed + optedOut,
    flowsRead: f.read,
    events,
    paused,
    autoEnrolled,
    released: rel.released,
    releaseBlocked: rel.blocked,
    added: d.added,
    removed: d.removed,
    failed: d.failed,
    timedOut: Date.now() > deadline,
  };
}

/**
 * Right after Luis enrols, stops or switches something on: release whoever
 * the warm-up allows now, then make the Klaviyo calls — so it happens in
 * seconds, not at the next cron run.
 */
export async function drainNurtureSoon(budgetMs = 45_000): Promise<void> {
  const key = klaviyoKey();
  if (!key) return;
  try {
    await releaseQueued(new Date());
    await drain(key, Date.now() + budgetMs);
  } catch {
    // The cron picks up anything left; a failure here must never surface as an error to the page.
  }
}

/* ----------------------------------------- staff buttons that reach Klaviyo */

export type KlaviyoButtonResult = { ok: true; message: string } | { ok: false; error: string };

const SCOPE_HELP = "Klaviyo refused: the API key needs the Flows permission. Replace KLAVIYO_PRIVATE_KEY with a key that has it (see the note on this page).";

/**
 * Switch one programme's emails on (Klaviyo flow → live) or off (→ draft).
 * CALLED ONLY FROM app/crm/nurture/actions.ts, after its staff check (guard
 * §14). Refuses to switch on a flow whose shape is unsafe — one that would
 * not stop emailing someone taken off the list — and confirms the result by
 * reading the flow back rather than trusting the PATCH.
 */
export async function switchFlow(program: ProgramKey, on: boolean): Promise<KlaviyoButtonResult> {
  const key = klaviyoKey();
  const p = programByKey(program);
  if (!key) return { ok: false, error: "Klaviyo isn't connected yet." };
  if (!p) return { ok: false, error: "Pick a programme." };
  const now = new Date();
  const before = await getFlow(key, p.klaviyoFlowId);
  if (!before.ok) return { ok: false, error: isScopeError(before.error) ? SCOPE_HELP : before.error };
  const snap = parseFlow(before.json, { flowId: p.klaviyoFlowId, listId: p.klaviyoListId });
  if (on) {
    const problems = flowProblems(snap);
    if (problems.length) return { ok: false, error: `Not switched on. ${problems[0]}` };
  }
  const set = await setFlowStatus(key, p.klaviyoFlowId, on ? "live" : "draft");
  if (!set.ok) return { ok: false, error: isScopeError(set.error) ? SCOPE_HELP : set.error };
  await refreshFlows(key, Date.now() + 20_000, now);
  const after = (await readPrograms()).get(p.key);
  const confirmed = on ? after?.flowStatus === "live" : after?.flowStatus === "draft";
  if (!confirmed) return { ok: false, error: `Klaviyo accepted the change but still reports the flow as "${after?.flowStatus ?? "unknown"}". Try Refresh in a minute.` };
  return { ok: true, message: on ? `${p.name}: emails are on.` : `${p.name}: emails are off. Nobody new will be sent to it.` };
}

/**
 * Re-read every flow and re-render every preview now.
 * CALLED ONLY FROM app/crm/nurture/actions.ts, after its staff check.
 */
export async function refreshFromKlaviyo(): Promise<KlaviyoButtonResult> {
  const key = klaviyoKey();
  if (!key) return { ok: false, error: "Klaviyo isn't connected yet." };
  const r = await refreshFlows(key, Date.now() + 50_000, new Date(), true);
  if (r.read === 0 && r.error) return { ok: false, error: isScopeError(r.error) ? SCOPE_HELP : r.error };
  return { ok: true, message: `Read ${r.read} of ${PROGRAMS.length} programmes from Klaviyo.` };
}
