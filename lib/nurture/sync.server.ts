/**
 * Keeps Klaviyo in step with Lending OS's nurture decisions. Run by the cron
 * (app/api/cron/nurture, every 15 minutes) and, for the drain alone, right
 * after Luis enrols someone (app/crm/nurture/actions.ts, via `after()`).
 *
 * NOT STAFF-GUARDED, deliberately: Vercel Cron has no Clerk session, so
 * `assertCrmStaff()` could never pass. Its one door from outside is the cron
 * route, which checks CRON_SECRET first (guards.regress.ts §14). Its reach is
 * narrow and asserted: it reads people, deals and activities, and writes only
 * `nurture_enrollments`, `activities` (automation rows, keyed) and the single
 * column `contacts.email_subscribed` — and only ever to FALSE.
 *
 * THREE STEPS, IN THIS ORDER:
 *
 *   1. AUTO-STOP. Anyone who wrote back, started a deal, had a deal move, was
 *      contacted by Luis, or unsubscribed stops — before anything else runs,
 *      so no step below can add a person who should have stopped.
 *   2. MIRROR. Read each list back from Klaviyo with consent. Unsubscribes and
 *      spam complaints are written into Lending OS (email_subscribed = false,
 *      one-way); bounces and removals made by hand in Klaviyo stop the row.
 *   3. DRAIN. Make the Klaviyo calls the rows ask for — add or remove — with
 *      a claim lease so two runs cannot make the same call, and backoff on
 *      failure. A row that fails MAX_SYNC_ATTEMPTS times stops retrying and
 *      shows on the page with a "Try again" button.
 *
 * Without KLAVIYO_PRIVATE_KEY, step 1 still runs (it only touches Lending OS)
 * and steps 2–3 are skipped; the page says Klaviyo is not connected.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { addToList, klaviyoKey, listMembers, removeFromList, upsertProfile, LIST_BATCH } from "@/lib/comms/klaviyo.server";
import {
  MAX_SYNC_ATTEMPTS, PROGRAMS, STOP_LABEL, cleanEmail, klaviyoVerdict, profilePayload, programByKey,
  retryDelayMinutes, stopReason, type StopReason,
} from "./nurture";
import { activeSignalsSql, isoOf, nurtureContactsSql, strOf, toNurtureContact } from "./rows";

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
          sync_state = CASE WHEN sync_state = 'removed' THEN 'removed' ELSE ${syncState} END,
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

/* ------------------------------------------------------------ entry points */

/** The whole cycle. `budgetMs` is how long it may run before it stops starting new work. */
export async function runNurtureSync(budgetMs: number): Promise<SyncSummary> {
  const deadline = Date.now() + budgetMs;
  const key = klaviyoKey();
  const stopped = await applyAutoStops();
  if (!key) return { configured: false, stopped, unsubscribedMirrored: 0, added: 0, removed: 0, failed: 0, timedOut: false };
  const m = await mirrorKlaviyo(key, deadline);
  const d = await drain(key, deadline);
  return {
    configured: true,
    stopped: stopped + m.stopped,
    unsubscribedMirrored: m.unsubscribed,
    added: d.added,
    removed: d.removed,
    failed: d.failed,
    timedOut: Date.now() > deadline,
  };
}

/** Just the Klaviyo calls — run right after Luis enrols or stops someone, so it happens in seconds. */
export async function drainNurtureSoon(budgetMs = 45_000): Promise<void> {
  const key = klaviyoKey();
  if (!key) return;
  try {
    await drain(key, Date.now() + budgetMs);
  } catch {
    // The cron picks up anything left; a failure here must never surface as an error to the page.
  }
}
