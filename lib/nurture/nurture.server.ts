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
 * pending_add); lib/nurture/sync.server.ts makes the call.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertCrmStaff } from "@/lib/crm/access";
import { classify, programByKey, summarize, type Candidate, type EnrollmentLite, type ProgramKey, type ProgramSummary } from "./nurture";
import { isoOf, nurtureContactsSql, strOf, toNurtureContact, uuidArray } from "./rows";
import { nurtureSyncConfigured } from "./sync.server";

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
};

export type NurturePageData = {
  configured: boolean;
  byProgram: ProgramSummary[];
  candidates: Record<ProgramKey, Candidate[]>;
  excluded: Record<string, number>;
  enrolled: EnrolledPerson[];
};

/** One round trip: the book, classified, and every enrolment. */
export async function getNurturePage(now: Date): Promise<NurturePageData> {
  await assertCrmStaff();
  const [people, enrolments] = await db.batch([
    db.execute(nurtureContactsSql()),
    db.execute(sql`
      SELECT e.id, e.contact_id, e.program, e.status, e.enrolled_at, e.stopped_at, e.stop_reason,
             e.sync_state, e.sync_attempts, e.sync_error,
             c.first_name, c.last_name, c.email,
             (SELECT a.id FROM applications a
               WHERE a.id IN (SELECT p.application_id FROM participants p WHERE p.contact_id = e.contact_id)
               ORDER BY COALESCE(a.submitted_at, a.created_at) DESC NULLS LAST LIMIT 1) AS application_id
      FROM nurture_enrollments e
      JOIN contacts c ON c.id = e.contact_id
      ORDER BY e.status ASC, COALESCE(e.stopped_at, e.enrolled_at) DESC
      LIMIT 2000
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
  };
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

  const result = rowsOf(await db.execute(sql`
    WITH ins AS (
      INSERT INTO nurture_enrollments (contact_id, program, enrolled_by, klaviyo_list_id)
      SELECT x, ${program.key}, ${p.by}, ${program.klaviyoListId}
      FROM unnest(${uuidArray(eligible)}) AS x
      ON CONFLICT DO NOTHING
      RETURNING id, contact_id
    ), act AS (
      INSERT INTO activities (contact_id, kind, source, subject, dedup_key)
      SELECT contact_id, 'automation', 'nurture', ${`Added to nurture: ${program.name} (Klaviyo)`}, 'nurture:in:' || id::text
      FROM ins
      ON CONFLICT (dedup_key) DO NOTHING
    )
    SELECT count(*)::int AS n FROM ins
  `));
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
          sync_state = CASE WHEN sync_state = 'removed' THEN 'removed' ELSE 'pending_remove' END,
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
