/**
 * Everything /crm/nurture reads and writes.
 *
 * STAFF-ONLY, AND IT SAYS SO ITSELF: every export calls `assertCrmStaff()`
 * first (listed in STAFF_ONLY_MODULES, guards.regress.ts §3). It reads the
 * whole book — names, emails, every deal — to decide who qualifies.
 *
 * Enrolling re-reads the chosen people and re-runs `classify()` on that fresh
 * read. The page's list can be minutes old; a person who replied, started a
 * deal or unsubscribed since then is skipped, not enrolled. What the browser
 * sends is a list of ids and a programme, and nothing else is trusted from it.
 *
 * Nothing here calls Klaviyo. Enrolling writes the intent (sync_state
 * queued — the warm-up releases it); lib/nurture/sync.server.ts makes the
 * calls. The mode and pause switches are plain database writes; the two
 * buttons that do reach Klaviyo (flow on/off, refresh) live in sync.server.ts
 * and are called only from the staff actions.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertCrmStaff } from "@/lib/crm/access";
import { PROGRAMS, classify, nurtureStatus, programByKey, summarize, type Candidate, type EnrollmentLite, type NurtureStatus, type ProgramKey, type ProgramSummary } from "./nurture";
import {
  HEALTH_DAYS, deliverability, flowIsLive, flowProblems, isPermissionError, nextReleaseLabel, nyClock, parseMode,
  planRelease, snapshotOf, warmupStatus,
  type EventKind, type FlowSnapshot, type Health, type Mode, type ReleaseBlock,
} from "./cockpit";
import { enrolQueuedSql, healthCountsSql, isoOf, nurtureContactsSql, releaseCountsSql, strOf, toNurtureContact } from "./rows";
import { nurtureSyncConfigured } from "./sync.server";
import { closableAsNotOurProduct } from "@/lib/crm/board";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);

export type EnrolledPerson = {
  id: string;
  contactId: string;
  program: string;
  name: string;
  email: string;
  status: "active" | "stopped";
  enrolledAt: string | null;
  stoppedAt: string | null;
  stopReason: string | null;
  syncState: string;
  syncAttempts: number;
  syncError: string | null;
  /** Opens this person's record card: their newest deal. */
  applicationId: string | null;
  releasedAt: string | null;
  emailsSent: number;
  lastEvent: { kind: EventKind; at: string } | null;
};

export type ProgramState = {
  mode: Mode;
  flowStatus: string | null;
  /** Confirmed live by a read in the last hour — the only state that releases anyone. */
  flowLive: boolean;
  flowCheckedAt: string | null;
  flowError: string | null;
  snapshot: FlowSnapshot | null;
  problems: string[];
};

export type ClickFollowUp = {
  enrollmentId: string;
  program: string;
  name: string;
  email: string;
  at: string;
  subject: string | null;
  applicationId: string | null;
};

export type Cockpit = {
  programs: Record<ProgramKey, ProgramState>;
  paused: boolean;
  pausedReason: string | null;
  pausedAt: string | null;
  pausedByGuard: boolean;
  health: Health;
  warmup: { day: number; of: number; cap: number; warming: boolean };
  releasedToday: number;
  queuedTotal: number;
  nextRelease: string;
  /** Why nobody would be released if the cron ran right now, or null. */
  blocked: ReleaseBlock | null;
  /** The Klaviyo key predates the cockpit permissions. */
  keyNeedsPermissions: boolean;
  clicks: ClickFollowUp[];
};

export type NurturePageData = {
  configured: boolean;
  byProgram: ProgramSummary[];
  candidates: Record<ProgramKey, Candidate[]>;
  excluded: Record<string, number>;
  enrolled: EnrolledPerson[];
  cockpit: Cockpit;
};

/** One round trip: the book, classified, and every enrolment. */
export async function getNurturePage(now: Date): Promise<NurturePageData> {
  await assertCrmStaff();
  const [people, enrolments, programRows, control, counts, health, clickRows] = await db.batch([
    db.execute(nurtureContactsSql()),
    db.execute(sql`
      SELECT e.id, e.contact_id, e.program, e.status, e.enrolled_at, e.stopped_at, e.stop_reason,
             e.sync_state, e.sync_attempts, e.sync_error, e.released_at,
             c.first_name, c.last_name, c.email,
             (SELECT a.id FROM applications a
               WHERE a.id IN (SELECT p.application_id FROM participants p WHERE p.contact_id = e.contact_id)
               ORDER BY COALESCE(a.submitted_at, a.created_at) DESC NULLS LAST LIMIT 1) AS application_id,
             (SELECT count(*) FROM nurture_events ne WHERE ne.enrollment_id = e.id AND ne.kind = 'sent')::int AS emails_sent,
             last.kind AS last_event_kind, last.occurred_at AS last_event_at
      FROM nurture_enrollments e
      JOIN contacts c ON c.id = e.contact_id
      LEFT JOIN LATERAL (
        SELECT ne.kind, ne.occurred_at FROM nurture_events ne
        WHERE ne.enrollment_id = e.id
        ORDER BY ne.occurred_at DESC LIMIT 1
      ) last ON true
      ORDER BY e.status ASC, COALESCE(e.stopped_at, e.enrolled_at) DESC
      LIMIT 2000
    `),
    db.execute(sql`SELECT program, mode, flow_status, flow_checked_at, flow_error, flow_snapshot FROM nurture_programs`),
    db.execute(sql`SELECT paused, paused_reason, paused_at, paused_by FROM nurture_control WHERE id = 1`),
    db.execute(releaseCountsSql(nyClock(now).day, now)),
    db.execute(healthCountsSql(HEALTH_DAYS, now)),
    // People who clicked a nurture email in the last 14 days and are still in the programme:
    // interest, and the reason to write to them yourself (which also stops the programme).
    db.execute(sql`
      SELECT * FROM (
        SELECT DISTINCT ON (e.id) e.id, e.program, ne.occurred_at, ne.subject,
               c.first_name, c.last_name, c.email,
               (SELECT a.id FROM applications a
                 WHERE a.id IN (SELECT p.application_id FROM participants p WHERE p.contact_id = e.contact_id)
                 ORDER BY COALESCE(a.submitted_at, a.created_at) DESC NULLS LAST LIMIT 1) AS application_id
        FROM nurture_events ne
        JOIN nurture_enrollments e ON e.id = ne.enrollment_id
        JOIN contacts c ON c.id = e.contact_id
        WHERE ne.kind = 'click' AND ne.occurred_at >= now() - interval '14 days' AND e.status = 'active'
        ORDER BY e.id, ne.occurred_at DESC
      ) x
      ORDER BY occurred_at DESC
      LIMIT 25
    `),
  ]);
  const contacts = rowsOf(people).map(toNurtureContact);
  const enrolled: EnrolledPerson[] = rowsOf(enrolments).map((r) => ({
    id: String(r.id),
    contactId: String(r.contact_id),
    program: String(r.program),
    name: [strOf(r.first_name), strOf(r.last_name)].filter(Boolean).join(" ").trim() || strOf(r.email) || "(no name)",
    email: strOf(r.email) ?? "",
    status: r.status === "stopped" ? "stopped" : "active",
    enrolledAt: isoOf(r.enrolled_at),
    stoppedAt: isoOf(r.stopped_at),
    stopReason: strOf(r.stop_reason),
    syncState: String(r.sync_state),
    syncAttempts: Number(r.sync_attempts ?? 0),
    syncError: strOf(r.sync_error),
    applicationId: strOf(r.application_id),
    releasedAt: isoOf(r.released_at),
    emailsSent: Number(r.emails_sent ?? 0),
    lastEvent: r.last_event_kind && isoOf(r.last_event_at)
      ? { kind: String(r.last_event_kind) as EventKind, at: isoOf(r.last_event_at)! }
      : null,
  }));
  const lite: EnrollmentLite[] = enrolled.map((e) => ({
    program: e.program, status: e.status, stopReason: e.stopReason, syncState: e.syncState, syncAttempts: e.syncAttempts,
  }));
  const s = summarize(contacts, lite, now);
  return {
    configured: nurtureSyncConfigured(),
    byProgram: s.byProgram,
    candidates: s.candidates,
    excluded: s.excluded as Record<string, number>,
    enrolled,
    cockpit: buildCockpit({ now, enrolled, programRows: rowsOf(programRows), control: rowsOf(control)[0], counts: rowsOf(counts)[0], health: rowsOf(health)[0], clickRows: rowsOf(clickRows) }),
  };
}

function buildCockpit(i: {
  now: Date;
  enrolled: EnrolledPerson[];
  programRows: Row[];
  control: Row | undefined;
  counts: Row | undefined;
  health: Row | undefined;
  clickRows: Row[];
}): Cockpit {
  const byKey = new Map(i.programRows.map((r) => [String(r.program), r]));
  const programs = Object.fromEntries(PROGRAMS.map((p) => {
    const r = byKey.get(p.key);
    const snapshot = snapshotOf(r?.flow_snapshot);
    const state: ProgramState = {
      mode: parseMode(r?.mode) ?? "review",
      flowStatus: strOf(r?.flow_status),
      flowLive: flowIsLive(strOf(r?.flow_status), isoOf(r?.flow_checked_at), i.now),
      flowCheckedAt: isoOf(r?.flow_checked_at),
      flowError: strOf(r?.flow_error),
      snapshot,
      problems: snapshot ? flowProblems(snapshot) : [],
    };
    return [p.key, state];
  })) as Record<ProgramKey, ProgramState>;

  // No control row means migration 0016 has not run: show paused rather than pretend.
  const paused = !i.control || i.control.paused === true || i.control.paused === "t";
  const releasedToday = Number(i.counts?.released_today ?? 0);
  const prior = Number(i.counts?.prior_release_days ?? 0);
  const queued = i.enrolled.filter((e) => e.status === "active" && e.syncState === "queued");
  const plan = planRelease({
    queued: queued.map((e) => ({ id: e.id, program: e.program, enrolledAt: e.enrolledAt })),
    now: i.now,
    paused,
    livePrograms: new Set(PROGRAMS.filter((p) => programs[p.key].flowLive).map((p) => p.key)),
    releasedToday,
    priorReleaseDays: prior,
  });
  return {
    programs,
    paused,
    pausedReason: strOf(i.control?.paused_reason),
    pausedAt: isoOf(i.control?.paused_at),
    pausedByGuard: strOf(i.control?.paused_by) === "deliverability-guard",
    health: deliverability({
      sent: Number(i.health?.sent ?? 0), bounce: Number(i.health?.bounce ?? 0),
      spam: Number(i.health?.spam ?? 0), unsub: Number(i.health?.unsub ?? 0),
    }),
    warmup: warmupStatus(prior),
    releasedToday,
    queuedTotal: queued.length,
    nextRelease: nextReleaseLabel(i.now),
    blocked: plan.blocked,
    keyNeedsPermissions: PROGRAMS.some((p) => isPermissionError(programs[p.key].flowError)),
    clicks: i.clickRows.map((r) => ({
      enrollmentId: String(r.id),
      program: String(r.program),
      name: [strOf(r.first_name), strOf(r.last_name)].filter(Boolean).join(" ").trim() || strOf(r.email) || "(no name)",
      email: strOf(r.email) ?? "",
      at: isoOf(r.occurred_at) ?? "",
      subject: strOf(r.subject),
      applicationId: strOf(r.application_id),
    })),
  };
}

/** Automatic (queued every weekday morning) or You choose (only who Luis ticks). */
export async function setProgramMode(p: { program: ProgramKey; mode: Mode; by: string }): Promise<boolean> {
  await assertCrmStaff();
  const r = rowsOf(await db.execute(sql`
    UPDATE nurture_programs SET mode = ${p.mode}, updated_at = now(), updated_by = ${p.by}
    WHERE program = ${p.program}
    RETURNING program
  `));
  return r.length > 0;
}

/**
 * Pause or resume every release to Klaviyo. Pausing stops new people being
 * sent to the flows; people already in a flow carry on (switch the flow off
 * to stop those). Resuming is always a person's decision, and restarts the
 * guard's count from that moment.
 */
export async function setPaused(p: { paused: boolean; by: string; now: Date }): Promise<boolean> {
  await assertCrmStaff();
  const r = rowsOf(await db.execute(p.paused
    ? sql`UPDATE nurture_control SET paused = true, paused_reason = 'Paused by you', paused_at = now(), paused_by = ${p.by}, updated_at = now() WHERE id = 1 RETURNING id`
    : sql`UPDATE nurture_control SET paused = false, paused_reason = NULL, paused_at = NULL, paused_by = ${p.by},
            health_since = ${p.now.toISOString()}::timestamptz, updated_at = now() WHERE id = 1 RETURNING id`));
  return r.length > 0;
}

/**
 * Enrol people into one programme. Returns how many went in and how many were
 * skipped because they no longer qualify.
 *
 * One statement: the enrolment rows and their timeline entries are written
 * together. ON CONFLICT DO NOTHING covers both unique rules at once — never
 * the same programme twice, never two active programmes — so two clicks, or
 * two people clicking, cannot double-enrol anyone.
 */
export async function enrollInProgram(p: {
  program: ProgramKey;
  contactIds: string[];
  by: string;
  now: Date;
}): Promise<{ enrolled: number; skipped: number }> {
  await assertCrmStaff();
  const program = programByKey(p.program);
  if (!program || p.contactIds.length === 0) return { enrolled: 0, skipped: p.contactIds.length };

  const fresh = rowsOf(await db.execute(nurtureContactsSql(p.contactIds))).map(toNurtureContact);
  const eligible = fresh.filter((c) => classify(c, p.now).program === program.key).map((c) => c.id);
  if (eligible.length === 0) return { enrolled: 0, skipped: p.contactIds.length };

  const result = rowsOf(await db.execute(enrolQueuedSql({
    program: program.key, listId: program.klaviyoListId, ids: eligible, by: p.by,
    subject: `Added to nurture: ${program.name} (Klaviyo)`,
  })));
  const enrolled = Number(result[0]?.n ?? 0);
  return { enrolled, skipped: p.contactIds.length - enrolled };
}

/** Luis stops one person. They are never offered this or any programme again automatically. */
export async function stopEnrollment(p: { enrollmentId: string; by: string }): Promise<boolean> {
  await assertCrmStaff();
  const r = rowsOf(await db.execute(sql`
    WITH s AS (
      UPDATE nurture_enrollments
      SET status = 'stopped', stop_reason = 'stopped_by_staff', stopped_at = now(), stopped_by = ${p.by},
          sync_state = CASE WHEN sync_state IN ('removed', 'queued') THEN 'removed' ELSE 'pending_remove' END,
          sync_attempts = 0, sync_error = NULL, next_sync_at = now(), updated_at = now()
      WHERE id = ${p.enrollmentId}::uuid AND status = 'active'
      RETURNING id, contact_id
    ), act AS (
      INSERT INTO activities (contact_id, kind, source, subject, dedup_key)
      SELECT contact_id, 'automation', 'nurture', 'Nurture stopped: you stopped it', 'nurture:out:' || id::text
      FROM s
      ON CONFLICT (dedup_key) DO NOTHING
    )
    SELECT count(*)::int AS n FROM s
  `));
  return Number(r[0]?.n ?? 0) > 0;
}

/** "Try again" on a row that gave up syncing. Resets the counter; the next drain retries it. */
export async function retryEnrollmentSync(p: { enrollmentId: string }): Promise<boolean> {
  await assertCrmStaff();
  const r = rowsOf(await db.execute(sql`
    UPDATE nurture_enrollments
    SET sync_attempts = 0, sync_error = NULL, next_sync_at = now(), sync_claimed_at = NULL, updated_at = now()
    WHERE id = ${p.enrollmentId}::uuid AND sync_state IN ('pending_add', 'pending_remove')
    RETURNING id
  `));
  return r.length > 0;
}

/* ------------------------------------------- the dashboard's "No movement" */

export type QueueNurture = {
  /** Contact id → where they stand with nurture, in words. */
  byContact: Record<string, NurtureStatus>;
  /** Per programme: its emails are on in Klaviyo, and how people join. */
  programs: Record<ProgramKey, { name: string; emailsOn: boolean; mode: Mode }>;
  /** Deals of these people that "Close as lost" may take: marked Not our product, before term sheet. */
  closableNotOurProduct: string[];
};

/**
 * Nurture status for the people on the dashboard's "No movement" list. Same
 * read and the same `classify()` as /crm/nurture, for these contacts only —
 * so the dashboard and the Nurture page can never disagree about a person.
 */
export async function nurtureStatusForContacts(contactIds: string[], now: Date): Promise<QueueNurture> {
  await assertCrmStaff();
  const ids = [...new Set(contactIds)].slice(0, 1000);
  // An empty id list would read the WHOLE book (nurtureContactsSql with no
  // ids), so it is replaced by an id that matches nobody.
  const [people, programRows] = await db.batch([
    db.execute(nurtureContactsSql(ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])),
    db.execute(sql`SELECT program, mode, flow_status FROM nurture_programs`),
  ]);
  const byContact: Record<string, NurtureStatus> = {};
  const closableNotOurProduct: string[] = [];
  for (const c of rowsOf(people).map(toNurtureContact)) {
    byContact[c.id] = nurtureStatus(c, now);
    for (const a of c.apps) if (closableAsNotOurProduct(a)) closableNotOurProduct.push(a.id);
  }
  const byKey = new Map(rowsOf(programRows).map((r) => [String(r.program), r]));
  const programs = Object.fromEntries(PROGRAMS.map((p) => {
    const r = byKey.get(p.key);
    return [p.key, { name: p.name, emailsOn: strOf(r?.flow_status) === "live", mode: parseMode(r?.mode) ?? "review" }];
  })) as QueueNurture["programs"];
  return { byContact, programs, closableNotOurProduct };
}

/**
 * "Add to nurture" from the dashboard: each chosen person goes into the ONE
 * programme `classify()` picks for them, on a fresh read — the browser sends
 * ids only, never a programme, so a stale page cannot put anyone in the wrong
 * one. Everyone is QUEUED, exactly like the Enrol button on /crm/nurture; the
 * warm-up releases them on weekday mornings while that programme's emails are
 * on. All programmes are written in one db.batch (one transaction).
 */
export async function enrollBestFit(p: { contactIds: string[]; by: string; now: Date }): Promise<{
  added: { program: ProgramKey; name: string; count: number }[];
  skipped: number;
}> {
  await assertCrmStaff();
  if (p.contactIds.length === 0) return { added: [], skipped: 0 };
  const fresh = rowsOf(await db.execute(nurtureContactsSql(p.contactIds))).map(toNurtureContact);
  const groups = new Map<ProgramKey, string[]>();
  for (const c of fresh) {
    const k = classify(c, p.now);
    if (k.program) groups.set(k.program, [...(groups.get(k.program) ?? []), c.id]);
  }
  const plan = PROGRAMS.filter((prog) => (groups.get(prog.key)?.length ?? 0) > 0);
  if (plan.length === 0) return { added: [], skipped: p.contactIds.length };

  const statements = plan.map((prog) => db.execute(enrolQueuedSql({
    program: prog.key, listId: prog.klaviyoListId, ids: groups.get(prog.key)!, by: p.by,
    subject: `Added to nurture: ${prog.name} (Klaviyo)`,
  })));
  const results = await db.batch(statements as [typeof statements[number], ...typeof statements]);
  const added = plan.map((prog, i) => ({ program: prog.key, name: prog.name, count: Number(rowsOf(results[i])[0]?.n ?? 0) }))
    .filter((a) => a.count > 0);
  const total = added.reduce((n, a) => n + a.count, 0);
  return { added, skipped: p.contactIds.length - total };
}
