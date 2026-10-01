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
import { programWords } from "./view";
import { CHECKIN_STEP, TS_SERIES, UNSURE_AFTER_MINUTES, followupFor, sortDue, type DueFollowup, type TsDeal } from "./termSheetFollowups";

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
      -- 'sent' counts as done. 'sending' is a send whose outcome is not known
      -- yet: in flight (young) or Gmail never answered (old). Both come back
      -- with their status; the code below decides (1 Oct 2026).
      (SELECT json_agg(json_build_object('k', oe.template_key, 'at', COALESCE(oe.sent_at, oe.created_at),
                                         's', oe.status, 'key', oe.idempotency_key, 'subj', oe.subject, 'body', oe.body)
                       ORDER BY oe.created_at)
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
    const attempts = (Array.isArray(sentRaw) ? sentRaw : [])
      .map((x) => x as { k?: unknown; at?: unknown; s?: unknown; key?: unknown; subj?: unknown; body?: unknown })
      .map((x) => ({
        templateKey: String(x.k ?? ""), at: iso(x.at) ?? "", status: String(x.s ?? ""),
        key: str(x.key), subject: str(x.subj), body: str(x.body),
      }))
      .filter((x) => x.templateKey && x.at);
    // A send still in flight counts as done, so two tabs cannot both send it.
    // One that Gmail never answered (older than UNSURE_AFTER_MINUTES) does
    // NOT: it is shown again, flagged, for Luis to settle from his Sent folder.
    const unsureCutoff = now.getTime() - UNSURE_AFTER_MINUTES * 60_000;
    const isUnsure = (x: { status: string; at: string }) => x.status === "sending" && Date.parse(x.at) < unsureCutoff;
    const sent = attempts.filter((x) => !isUnsure(x)).map((x) => ({ templateKey: x.templateKey, at: x.at }));
    const unsure = attempts.filter(isUnsure).pop() ?? null;
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
    const termSheetMs = d.termSheetAt ? Date.parse(d.termSheetAt) : NaN;
    const stuck = unsure && decision.state !== "off" && Date.parse(unsure.at) >= termSheetMs ? unsure : null;
    if (decision.state === "upcoming" && !stuck) upcoming++;
    if (decision.state !== "due" && !stuck) continue;
    if (decision.state === "off") continue;

    // An unsure send is shown as the step it tried, with the words it tried.
    const step = stuck ? [...TS_SERIES, CHECKIN_STEP].find((x) => x.templateKey === stuck.templateKey) ?? decision.step : decision.step;
    const t = templateByKey(step.templateKey);
    if (!t) continue;
    const street = str(r.address_line1)?.trim() || null;
    const cityState = [str(r.city), str(r.prop_state)].filter(Boolean).join(" ");
    const program = programWords(r.product == null ? null : String(r.product));
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
      step,
      dueAt: stuck ? stuck.at : decision.dueAt,
      daysSinceTermSheet: decision.daysSinceTermSheet,
      subject: stuck?.subject ?? filled.subject,
      body: stuck?.body ?? filled.body,
      unsureKey: stuck?.key ?? null,
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
