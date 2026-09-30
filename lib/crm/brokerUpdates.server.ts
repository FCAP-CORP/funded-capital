/**
 * Broker update emails: when Luis moves a broker's deal, or asks for
 * documents, the broker hears about it from Luis's own Gmail, straight away
 * (Luis's choice, 30 Sep 2026: automatic, not approve-each).
 *
 * STAFF-ONLY. Every export calls `assertCrmStaff()` (guards §3). It is called
 * from the CRM's own server actions, AFTER the change has been saved, inside
 * `after()` — so a slow or failed email never slows or undoes the stage move.
 *
 * WHO IT GOES TO is decided here, from the database, never from a browser:
 * the broker who submitted the deal (`applications.submitted_by_user_id` →
 * `broker_users`), only if that broker is ACTIVE and Luis has not switched
 * broker emails off for the deal (`applications.broker_updates_off`). A house
 * lead has no broker and never emails anyone.
 *
 * WHAT IT SAYS is lib/crm/brokerUpdates.ts (pure, tested): no rates, amounts,
 * guarantees, or lost reasons.
 *
 * HOW it sends is the one Gmail executor (lib/comms/emailOutbox.server.ts):
 * same outbox, idempotency, signature and mailbox rules as the record card.
 * The timeline records it as "Emailed the broker", never as contact with the
 * borrower.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertCrmStaff } from "@/lib/crm/access";
import { executeSendEmail } from "@/lib/comms/emailOutbox.server";
import { docsEmail, stageEmail, stageWorthEmail, type DocLine, type Email } from "./brokerUpdates";
import { isUuid } from "./tasks";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export type Sender = { userId: string; userEmail: string | null };
export type UpdateOutcome = { sent: boolean; why: string };

type Target = {
  brokerEmail: string;
  brokerName: string | null;
  deal: { borrower: string | null; property: string | null };
};

/** The broker to tell, or why nobody is told. */
async function targetFor(applicationId: string): Promise<{ ok: true; t: Target } | { ok: false; why: string }> {
  const r = rowsOf(await db.execute(sql`
    SELECT a.broker_updates_off, bu.email AS broker_email, bu.name AS broker_name, bu.status AS broker_status,
           p.address_line1, c.first_name, c.last_name
    FROM applications a
    LEFT JOIN broker_users bu ON bu.clerk_user_id = a.submitted_by_user_id
    LEFT JOIN properties p ON p.id = a.property_id
    LEFT JOIN LATERAL (
      SELECT pt.contact_id FROM participants pt
      WHERE pt.application_id = a.id
      ORDER BY (pt.role = 'borrower') DESC, pt.created_at ASC, pt.contact_id ASC
      LIMIT 1
    ) one ON true
    LEFT JOIN contacts c ON c.id = one.contact_id
    WHERE a.id = ${applicationId}::uuid
  `))[0];
  if (!r) return { ok: false, why: "no such deal" };
  if (r.broker_updates_off === true) return { ok: false, why: "broker emails are off for this deal" };
  const email = str(r.broker_email);
  if (!email) return { ok: false, why: "no broker on this deal" };
  if (str(r.broker_status) !== "active") return { ok: false, why: "the broker is suspended" };
  return {
    ok: true,
    t: {
      brokerEmail: email,
      brokerName: str(r.broker_name),
      deal: {
        borrower: [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim() || null,
        property: str(r.address_line1),
      },
    },
  };
}

async function docLines(applicationId: string, ids: readonly string[] | null): Promise<DocLine[]> {
  const only = ids && ids.length ? sql`AND id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})` : sql``;
  return rowsOf(await db.execute(sql`
    SELECT label, note FROM document_requests
    WHERE application_id = ${applicationId}::uuid AND status = 'requested' ${only}
    ORDER BY sort ASC, created_at ASC
  `)).map((r) => ({ label: String(r.label), note: str(r.note) }));
}

async function send(applicationId: string, t: Target, email: Email, by: Sender): Promise<UpdateOutcome> {
  const out = await executeSendEmail({
    applicationId,
    subject: email.subject,
    body: email.body,
    idempotencyKey: randomUUID(),
    userId: by.userId,
    userEmail: by.userEmail,
    to: { kind: "broker", email: t.brokerEmail },
  });
  if (!out.ok) console.warn(`[broker-updates] not sent (${out.status}) for ${applicationId}`);
  return { sent: out.ok, why: out.ok ? "sent" : out.status };
}

/** A stage move. Silent unless stageWorthEmail says the broker should hear. */
export async function sendBrokerStageUpdate(p: { applicationId: string; from: string | null; to: string; by: Sender }): Promise<UpdateOutcome> {
  await assertCrmStaff();
  if (!isUuid(p.applicationId)) return { sent: false, why: "bad id" };
  if (!stageWorthEmail(p.from, p.to)) return { sent: false, why: "not a stage the broker is told about" };
  const target = await targetFor(p.applicationId);
  if (!target.ok) return { sent: false, why: target.why };
  const email = stageEmail({
    to: p.to,
    brokerName: target.t.brokerName,
    deal: target.t.deal,
    applicationId: p.applicationId,
    openDocs: await docLines(p.applicationId, null),
  });
  return email ? send(p.applicationId, target.t, email, p.by) : { sent: false, why: "no copy for this stage" };
}

/**
 * Documents asked for outside a stage move: "Create the list now" (every
 * item still needed) or one item added (just that one).
 */
export async function sendBrokerDocsUpdate(p: { applicationId: string; requestIds: string[] | null; added: boolean; by: Sender }): Promise<UpdateOutcome> {
  await assertCrmStaff();
  if (!isUuid(p.applicationId) || (p.requestIds ?? []).some((i) => !isUuid(i))) return { sent: false, why: "bad id" };
  const target = await targetFor(p.applicationId);
  if (!target.ok) return { sent: false, why: target.why };
  const email = docsEmail({
    brokerName: target.t.brokerName,
    deal: target.t.deal,
    applicationId: p.applicationId,
    docs: await docLines(p.applicationId, p.requestIds),
    added: p.added,
  });
  return email ? send(p.applicationId, target.t, email, p.by) : { sent: false, why: "nothing still needed" };
}

/** Luis's per-deal switch on the record card. */
export async function setBrokerUpdatesOff(applicationId: string, off: boolean): Promise<boolean> {
  await assertCrmStaff();
  if (!isUuid(applicationId)) return false;
  const r = rowsOf(await db.execute(sql`
    UPDATE applications SET broker_updates_off = ${off}, updated_at = now() WHERE id = ${applicationId}::uuid RETURNING id
  `));
  return r.length > 0;
}
