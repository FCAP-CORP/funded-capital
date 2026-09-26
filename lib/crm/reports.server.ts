/**
 * Everything /crm/reports reads, in one query.
 *
 * STAFF-ONLY, AND IT SAYS SO ITSELF (listed in STAFF_ONLY_MODULES in
 * guards.regress.ts). It reads the whole book.
 *
 * ONE ROW PER APPLICATION, by the same LEFT JOIN LATERAL … LIMIT 1 as the
 * pipeline and the dashboard: the borrower when there is one, else the
 * earliest attachment. A plain join double-counted deals where one person
 * holds two roles (23 Sep 2026).
 *
 * NO NAMES, NO EMAILS. The reports are counts and durations, so nothing that
 * identifies a borrower is selected — the page cannot leak what it never had.
 *
 * Every date comes back as an ISO string; which window, which week, what
 * counts as "contacted" is lib/crm/reports.ts, pure and tested.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertCrmStaff } from "@/lib/crm/access";
import type { ReportRow } from "./reports";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * What counts as reaching out: an email, a text or a call. Notes, stage moves
 * and form submissions do not. (Calls have no direction yet, so a call the
 * borrower placed counts as contact too.)
 */
const OUTBOUND = sql.raw(`('email_out', 'sms_out', 'call')`);

export async function getReportRows(): Promise<ReportRow[]> {
  await assertCrmStaff();

  const result = await db.execute(sql`
    SELECT
      a.id,
      a.stage,
      a.lead_source,
      a.product,
      a.submitted_at,
      a.created_at,
      a.stage_entered_at,
      a.requested_amount,
      a.lost_reason,
      /*
       * First reach-out on or after arrival. A few minutes' grace, because a
       * reply sent from the phone can be stamped a moment before the form's
       * own submission time.
       */
      (SELECT min(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = c.contact_id
          AND ac.kind IN ${OUTBOUND}
          AND ac.occurred_at >= COALESCE(a.submitted_at, a.created_at) - interval '5 minutes') AS first_touch_at,
      COALESCE(
        (SELECT min(st.changed_at) FROM stage_transitions st
          WHERE st.application_id = a.id AND st.to_stage = 'term_sheet_issued'),
        a.term_sheet_issued_at
      ) AS first_term_sheet_at,
      COALESCE(
        (SELECT min(st.changed_at) FROM stage_transitions st
          WHERE st.application_id = a.id AND st.to_stage = 'term_sheet_signed'),
        a.term_sheet_signed_at
      ) AS first_signed_at,
      COALESCE(
        a.funded_at,
        (SELECT min(st.changed_at) FROM stage_transitions st
          WHERE st.application_id = a.id AND st.to_stage = 'funded')
      ) AS funded_at,
      CASE WHEN a.stage = 'closed_lost' THEN COALESCE(
        (SELECT max(st.changed_at) FROM stage_transitions st
          WHERE st.application_id = a.id AND st.to_stage = 'closed_lost'),
        a.stage_entered_at
      ) END AS lost_at
    FROM applications a
    LEFT JOIN LATERAL (
      SELECT p.contact_id
      FROM participants p
      WHERE p.application_id = a.id
      ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, p.contact_id ASC
      LIMIT 1
    ) c ON true
  `);

  return rowsOf(result).map((r): ReportRow => ({
    id: String(r.id),
    stage: String(r.stage),
    leadSource: String(r.lead_source ?? "unknown"),
    product: String(r.product ?? "unknown"),
    submittedAt: iso(r.submitted_at),
    createdAt: iso(r.created_at),
    stageEnteredAt: iso(r.stage_entered_at),
    requestedAmount: str(r.requested_amount),
    firstTouchAt: iso(r.first_touch_at),
    firstTermSheetAt: iso(r.first_term_sheet_at),
    firstSignedAt: iso(r.first_signed_at),
    fundedAt: iso(r.funded_at),
    lostAt: iso(r.lost_at),
    lostReason: str(r.lost_reason),
  }));
}
