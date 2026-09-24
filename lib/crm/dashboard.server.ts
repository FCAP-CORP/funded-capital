/**
 * Everything /crm/dashboard reads, in one database round trip.
 *
 * STAFF-ONLY, AND IT SAYS SO ITSELF. This reads the whole book — every
 * borrower's name and email, what they asked for, when they last wrote — so it
 * calls `assertCrmStaff()` before anything else rather than trusting the page.
 * It is listed in STAFF_ONLY_MODULES in guards.regress.ts, so removing that
 * line fails the build.
 *
 * ONE ROUND TRIP. The two reads go out as a single `db.batch`, which the
 * neon-http driver sends as one HTTP request (wrapped in a read-only
 * transaction, which costs nothing). Every section of the page — the queue,
 * the put-down list, the four numbers, the stage bars, the lead-source mix and
 * the weekly chart — is a reading of the first result; the second is the
 * handful of tasks due today. No chart runs its own query.
 *
 * RAW ROWS OUT, DECISIONS ELSEWHERE. This module returns dates as ISO strings
 * and nothing else. Which month, which week, what counts as overdue: all of
 * that is lib/crm/dashboardView.ts, pure and covered by its regress suite.
 * The only date this file computes is "today in New York", to bound the task
 * read, and it takes that from lib/crm/tasks.ts rather than deciding it here.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { CONTACT_KINDS } from "@/lib/db/contactKinds";
import { assertCrmStaff } from "@/lib/crm/access";
import { nyToday } from "./tasks";
import type { DashboardRow, DueTaskInput } from "./dashboardView";

/**
 * Reading raw rows back out of drizzle. The cast goes through `unknown`
 * deliberately — see lib/broker/admin.server.ts.
 */
type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const fullName = (first: unknown, last: unknown, fallback: string) =>
  [str(first), str(last)].filter(Boolean).join(" ").trim() || fallback;

/** How many due-or-late tasks to read. The card shows the first few and counts the rest. */
export const DUE_TASK_LIMIT = 200;

/**
 * Every application, one row each, plus today's open tasks.
 *
 * ONE ROW PER APPLICATION, by the same LEFT JOIN LATERAL … LIMIT 1 as
 * getPipeline: the borrower when there is one, else the earliest attachment.
 * A person holding two roles on their own deal produced two rows under a plain
 * join and inflated every total on the Pipeline page (23 Sep 2026).
 */
export async function getDashboardData(now: Date): Promise<{ apps: DashboardRow[]; tasks: DueTaskInput[] }> {
  await assertCrmStaff();

  const today = nyToday(now);

  const [appResult, taskResult] = await db.batch([
    db.execute(sql`
      SELECT
        a.id,
        a.stage,
        a.lead_source,
        a.stage_entered_at,
        a.submitted_at,
        a.created_at,
        a.requested_amount,
        a.decisioned_at,
        a.term_sheet_issued_at,
        a.term_sheet_signed_at,
        /*
         * Funded date from whichever source has it -- the legacy column or the
         * first move into 'funded'. Neither covers the whole book alone.
         */
        COALESCE(
          a.funded_at,
          (SELECT min(st.changed_at) FROM stage_transitions st
            WHERE st.application_id = a.id AND st.to_stage = 'funded')
        ) AS funded_at,
        /*
         * When a term sheet first went out: the first move into
         * 'term_sheet_issued', else the column, for rows with no history.
         */
        COALESCE(
          (SELECT min(st.changed_at) FROM stage_transitions st
            WHERE st.application_id = a.id AND st.to_stage = 'term_sheet_issued'),
          a.term_sheet_issued_at
        ) AS first_term_sheet_at,
        a.next_action_at,
        a.next_action_set_at,
        a.next_action_note,
        c.contact_id,
        c.first_name,
        c.last_name,
        c.email,
        (SELECT max(ac.occurred_at) FROM activities ac
          WHERE ac.contact_id = c.contact_id AND ac.kind IN ${CONTACT_KINDS}) AS last_contact_at,
        (SELECT ac.kind FROM activities ac
          WHERE ac.contact_id = c.contact_id AND ac.kind IN ${CONTACT_KINDS}
          ORDER BY ac.occurred_at DESC LIMIT 1) AS last_contact_direction
      FROM applications a
      LEFT JOIN LATERAL (
        SELECT ct.id AS contact_id, ct.first_name, ct.last_name, ct.email
        FROM participants p
        JOIN contacts ct ON ct.id = p.contact_id
        WHERE p.application_id = a.id
        ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, ct.id ASC
        LIMIT 1
      ) c ON true
    `),

    /*
     * Open tasks due today or earlier. `due_on::text` because the driver would
     * otherwise parse a DATE into a JS Date at local midnight — the wrong day
     * for anyone west of UTC. The day is a New York day and stays a string.
     * Uses crm_tasks_open_due_idx (partial: completed_at IS NULL AND
     * deleted_at IS NULL).
     */
    db.execute(sql`
      SELECT
        t.id,
        t.title,
        t.due_on::text AS due_on,
        t.application_id,
        c.first_name,
        c.last_name
      FROM crm_tasks t
      JOIN applications a ON a.id = t.application_id
      LEFT JOIN LATERAL (
        SELECT ct.first_name, ct.last_name
        FROM participants p
        JOIN contacts ct ON ct.id = p.contact_id
        WHERE p.application_id = a.id
        ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, ct.id ASC
        LIMIT 1
      ) c ON true
      WHERE t.deleted_at IS NULL
        AND t.completed_at IS NULL
        AND t.due_on IS NOT NULL
        AND t.due_on <= ${today}::date
      ORDER BY t.due_on ASC, t.created_at ASC, t.id ASC
      LIMIT ${DUE_TASK_LIMIT}
    `),
  ]);

  const apps = rowsOf(appResult).map((r): DashboardRow => ({
    id: String(r.id),
    stage: String(r.stage),
    leadSource: String(r.lead_source ?? "unknown"),
    stageEnteredAt: iso(r.stage_entered_at),
    submittedAt: iso(r.submitted_at),
    createdAt: iso(r.created_at),
    requestedAmount: str(r.requested_amount),
    contactId: str(r.contact_id),
    name: fullName(r.first_name, r.last_name, "(unlinked)"),
    email: str(r.email),
    fundedAt: iso(r.funded_at),
    decisionedAt: iso(r.decisioned_at),
    termSheetIssuedAt: iso(r.term_sheet_issued_at),
    termSheetSignedAt: iso(r.term_sheet_signed_at),
    firstTermSheetAt: iso(r.first_term_sheet_at),
    lastContactAt: iso(r.last_contact_at),
    lastContactDirection: str(r.last_contact_direction),
    nextActionAt: iso(r.next_action_at),
    nextActionSetAt: iso(r.next_action_set_at),
    nextActionNote: str(r.next_action_note),
  }));

  const tasks = rowsOf(taskResult).map((r): DueTaskInput => ({
    id: String(r.id),
    title: String(r.title),
    dueOn: str(r.due_on),
    applicationId: String(r.application_id),
    borrower: fullName(r.first_name, r.last_name, "(unlinked)"),
  }));

  return { apps, tasks };
}
