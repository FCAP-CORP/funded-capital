/**
 * The term-sheet follow-ups the dashboard shows: which are due, already
 * written, and stopping a deal's series.
 *
 * STAFF-ONLY, AND IT SAYS SO ITSELF: every export calls `assertCrmStaff()`
 * first (STAFF_ONLY_MODULES, guards.regress.ts §3). It reads every deal at
 * term sheet with the borrower's name and address.
 *
 * NOTHING HERE SENDS. Send goes through app/crm/emailActions.ts → the Gmail
 * executor, which re-reads the contact and runs the email gate itself. The
 * rules for WHEN are lib/crm/termSheetFollowups.ts; the words are the ts-1…4
 * templates in lib/crm/emailTemplates.ts.
 *
 * ONE QUERY. Every deal currently at term_sheet_issued (a handful at any
 * time), each with its borrower (the same LATERAL borrower-first pick as the
 * pipeline), the latest touch each way, and the series emails already sent.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertCrmStaff } from "@/lib/crm/access";
import { fillTemplate, greetingName, templateByKey } from "./emailTemplates";
import { PRODUCT_LABEL, label } from "./view";
import { followupFor, sortDue, type DueFollowup, type TsDeal } from "./termSheetFollowups";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const jsonOf = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};

export type { DueFollowup };

export type FollowupsView = { due: DueFollowup[]; upcoming: number };

export async function getTermSheetFollowups(now: Date, senderFirstName: string | null): Promise<FollowupsView> {
  await assertCrmStaff();
  const rows = rowsOf(await db.execute(sql`
    SELECT
      a.id, a.stage, a.product, a.next_action_at, a.followup_stopped_at,
      COALESCE(
        (SELECT max(st.changed_at) FROM stage_transitions st
          WHERE st.application_id = a.id AND st.to_stage = 'term_sheet_issued'),
        a.stage_entered_at,
        a.term_sheet_issued_at
      ) AS term_sheet_at,
      ct.first_name, ct.last_name, ct.email, ct.email_subscribed,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = c.contact_id AND ac.kind IN ('email_in', 'sms_in')) AS last_inbound_at,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = c.contact_id AND ac.kind IN ('email_out', 'sms_out', 'call')) AS last_outbound_at,
      -- 'sending' counts as done (audit 30 Sep 2026): Gmail may have accepted
      -- it even though the row was never marked sent, and nudging a borrower
      -- twice is worse than skipping one nudge. Its time is when it was tried.
      (SELECT json_agg(json_build_object('k', oe.template_key, 'at', COALESCE(oe.sent_at, oe.created_at)))
        FROM outbound_emails oe
        WHERE oe.application_id = a.id AND oe.status IN ('sent', 'sending') AND oe.template_key LIKE 'ts-%') AS sent,
      pr.address_line1, pr.city, pr.state AS prop_state
    FROM applications a
    LEFT JOIN LATERAL (
      SELECT p.contact_id FROM participants p
      WHERE p.application_id = a.id
      ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, p.contact_id ASC
      LIMIT 1
    ) c ON true
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN properties pr ON pr.id = a.property_id
    WHERE a.stage = 'term_sheet_issued'
  `));

  const due: DueFollowup[] = [];
  let upcoming = 0;
  for (const r of rows) {
    const sentRaw = jsonOf(r.sent);
    const sent = (Array.isArray(sentRaw) ? sentRaw : [])
      .map((x) => x as { k?: unknown; at?: unknown })
      .map((x) => ({ templateKey: String(x.k ?? ""), at: iso(x.at) ?? "" }))
      .filter((x) => x.templateKey && x.at);
    const d: TsDeal = {
      applicationId: String(r.id),
      stage: String(r.stage),
      termSheetAt: iso(r.term_sheet_at),
      followupStoppedAt: iso(r.followup_stopped_at),
      snoozedUntil: iso(r.next_action_at),
      email: str(r.email),
      emailSubscribed: r.email_subscribed === null || r.email_subscribed === undefined ? null : r.email_subscribed === true || r.email_subscribed === "t",
      lastInboundAt: iso(r.last_inbound_at),
      lastOutboundAt: iso(r.last_outbound_at),
      sent,
    };
    const decision = followupFor(d, now);
    if (decision.state === "upcoming") upcoming++;
    if (decision.state !== "due") continue;

    const t = templateByKey(decision.step.templateKey);
    if (!t) continue;
    const street = str(r.address_line1)?.trim() || null;
    const cityState = [str(r.city), str(r.prop_state)].filter(Boolean).join(" ");
    const program = r.product ? label(PRODUCT_LABEL, String(r.product)) : null;
    const filled = fillTemplate(t, {
      firstName: greetingName(str(r.first_name)),
      street,
      address: street ? [street, cityState].filter(Boolean).join(", ") : null,
      program,
      senderFirstName,
    });
    const name = [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim() || str(r.email) || "(no name)";
    due.push({
      applicationId: d.applicationId,
      name,
      email: d.email ?? "",
      deal: [street, program].filter(Boolean).join(" · ") || "Deal",
      step: decision.step,
      dueAt: decision.dueAt,
      daysSinceTermSheet: decision.daysSinceTermSheet,
      subject: filled.subject,
      body: filled.body,
    });
  }
  return { due: sortDue(due), upcoming };
}

/**
 * "Stop follow-ups" for this term sheet. Stamped now, so a later re-issued
 * term sheet (which moves `term_sheet_at` past it) starts a fresh series.
 * Logs a note so the timeline shows the decision.
 */
export async function stopTermSheetFollowups(p: { applicationId: string; contactId: string | null; by: string }): Promise<boolean> {
  await assertCrmStaff();
  const now = new Date();
  const [upd] = await db.batch([
    db.execute(sql`
      UPDATE applications SET followup_stopped_at = ${now.toISOString()}::timestamptz, updated_at = now()
      WHERE id = ${p.applicationId}::uuid AND stage = 'term_sheet_issued'
      RETURNING id
    `),
    db.execute(sql`
      INSERT INTO activities (application_id, contact_id, kind, occurred_at, source, subject, metadata)
      SELECT ${p.applicationId}::uuid, ${p.contactId}::uuid, 'note', ${now.toISOString()}::timestamptz, 'crm',
             'Term sheet follow-ups stopped', ${JSON.stringify({ by: p.by })}::jsonb
      WHERE EXISTS (SELECT 1 FROM applications WHERE id = ${p.applicationId}::uuid AND stage = 'term_sheet_issued')
    `),
  ]);
  return rowsOf(upd).length > 0;
}
