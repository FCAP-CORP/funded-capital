/**
 * Document requests — Luis's side. Create the list, add an item, and move an
 * item (accept / needs another copy / not needed / remove / put back).
 *
 * STAFF-ONLY: every export calls `assertCrmStaff()` first (guards.regress.ts
 * §3). The broker's side — seeing their deal's list and uploading against it —
 * is lib/broker/docRequests.server.ts, which is scoped by lib/broker/scope.ts
 * and cannot import this file.
 *
 * Reads for the record card live in lib/crm/record.server.ts, in its one
 * db.batch, so opening a card still costs one round trip.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertCrmStaff } from "@/lib/crm/access";
import { isUuid, parseCustomItem, parseNote, staffMove } from "./docRequests";
import { seedRequestsSql } from "./docRequestsSql";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);

export type DocResult = { ok: true } | { ok: false; error: string };

/**
 * "Create the list" for a deal that was already past term sheet before this
 * feature existed. Same INSERT as the automatic start; running it twice adds
 * nothing.
 */
export async function createDocList(applicationId: string, by: string): Promise<DocResult> {
  await assertCrmStaff();
  if (!isUuid(applicationId)) return { ok: false, error: "Deal not found." };
  const app = rowsOf(await db.execute(sql`
    SELECT product, loan_purpose FROM applications WHERE id = ${applicationId}::uuid
  `))[0];
  if (!app) return { ok: false, error: "Deal not found." };
  await db.execute(seedRequestsSql(applicationId, String(app.product ?? "unknown"), app.loan_purpose ? String(app.loan_purpose) : null, by, new Date()));
  return { ok: true };
}

/** An item that is not on the standard list: "HOA estoppel letter", "entity good standing". */
export async function addDocRequest(applicationId: string, label: unknown, note: unknown, by: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await assertCrmStaff();
  if (!isUuid(applicationId)) return { ok: false, error: "Deal not found." };
  const parsed = parseCustomItem(label, note);
  if (!parsed.ok) return parsed;
  const r = rowsOf(await db.execute(sql`
    INSERT INTO document_requests (application_id, item_key, label, note, sort, requested_by)
    SELECT a.id, ${`custom:${randomUUID()}`}, ${parsed.label}, ${parsed.note},
           COALESCE((SELECT max(sort) FROM document_requests WHERE application_id = a.id), 0) + 10, ${by}
    FROM applications a WHERE a.id = ${applicationId}::uuid
    RETURNING id
  `));
  return r.length ? { ok: true, id: String(r[0].id) } : { ok: false, error: "Deal not found." };
}

/**
 * Move one item. The UPDATE carries the status it was read in, so two clicks
 * (or Luis and a broker upload landing together) cannot both win: the loser
 * changes nothing and is told to refresh.
 */
export async function moveDocRequest(requestId: string, move: string, note: unknown, by: string): Promise<DocResult> {
  await assertCrmStaff();
  if (!isUuid(requestId)) return { ok: false, error: "Item not found." };
  const cur = rowsOf(await db.execute(sql`SELECT status FROM document_requests WHERE id = ${requestId}::uuid`))[0];
  if (!cur) return { ok: false, error: "Item not found." };
  const from = String(cur.status);
  const t = staffMove(from, move);
  if (!t.ok) return t;
  const review = move === "again" ? parseNote(note) : null;
  if (move === "again" && !review) return { ok: false, error: "Say what is wrong with it, so the broker knows what to send." };
  const now = new Date().toISOString();
  const r = rowsOf(await db.execute(sql`
    UPDATE document_requests SET
      status = ${t.to},
      review_note = CASE WHEN ${move} = 'again' THEN ${review} WHEN ${t.to} = 'accepted' THEN NULL ELSE review_note END,
      accepted_at = CASE WHEN ${t.to} = 'accepted' THEN ${now}::timestamptz ELSE accepted_at END,
      closed_at = CASE WHEN ${t.to} IN ('waived', 'removed') THEN ${now}::timestamptz WHEN ${t.to} = 'requested' THEN NULL ELSE closed_at END,
      requested_at = CASE WHEN ${t.to} = 'requested' THEN ${now}::timestamptz ELSE requested_at END,
      requested_by = CASE WHEN ${t.to} = 'requested' THEN ${by} ELSE requested_by END,
      updated_at = ${now}::timestamptz
    WHERE id = ${requestId}::uuid AND status = ${from}
    RETURNING id
  `));
  return r.length ? { ok: true } : { ok: false, error: "That item has already changed. Refresh and try again." };
}
