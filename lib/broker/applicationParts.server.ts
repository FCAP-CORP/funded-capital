/**
 * Follow-up file batches for an application the broker has JUST submitted.
 *
 * A new application with more files than one request can carry arrives as
 * request 1 (the application and the first batch) plus follow-ups, each naming
 * the application it belongs to (see applicationParts.ts for why). This module
 * decides whether a follow-up may be forwarded, forwards it, and records one
 * line on the deal's timeline.
 *
 * BROKER-REACHABLE, so it asserts nothing about staff (an `assertCrmStaff()`
 * here would throw for every broker) and may not import the staff modules —
 * guards.regress.ts §5 checks both. What it asserts instead is OWNERSHIP:
 *
 *   - The owner is the Clerk user of THIS request, from `auth()` inside this
 *     module — never an id from the browser or a parameter.
 *   - The application must exist, have been submitted by that same user, and
 *     have been submitted within the last two hours. Anything else — someone
 *     else's application, an old one, an id that does not exist — is the same
 *     plain 404, and the Drive intake is never called.
 *
 * FILES NEVER LAND HERE. The files are handed to a forwarder (the Drive intake,
 * supplied by the route) and only after Drive says ok is anything written: one
 * `automation` activity. Never `form_submission` — that kind drives the broker
 * dashboard's Documents link and counts as a new enquiry elsewhere.
 */

import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { UploadFile } from "@/lib/crm/docRequests";
import { PART_NOTE, partFolderName, partSummary, withinPartWindow, type ParsedPart } from "./applicationParts";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

/** What the forwarder is given: everything Drive needs, nothing it does not. */
export type PartForwardInput = {
  submissionName: string;
  summary: string;
  brokerEmail: string;
  /** The folder request 1 made. Today's intake script ignores it (see the route). */
  folderUrl: string | null;
  application: { borrower: string; program: string; propertyAddress: string; loanAmount: string; notes: string };
  files: UploadFile[];
};
export type PartForwardResult = { ok: true; folder: string | null } | { ok: false; error: string };

export type PartResult =
  | { ok: true; folder: string | null }
  | { ok: false; error: "not_found" | "intake_failed"; status: number };

/**
 * Forward one follow-up batch. Order is the safety:
 * session user → the application is theirs and fresh → FORWARD TO DRIVE →
 * only after Drive says ok, one activity row.
 */
export async function forwardMyApplicationPart(
  part: ParsedPart,
  forward: (input: PartForwardInput) => Promise<PartForwardResult>,
  now: Date = new Date(),
): Promise<PartResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_found", status: 404 };

  // Pinned to the owner in SQL: someone else's application matches no row.
  const r = rowsOf(await db.execute(sql`
    SELECT a.id, a.submitted_at, p.address_line1, c.id AS contact_id, c.first_name, c.last_name,
           sub.subject AS first_name_sent, sub.metadata->>'driveFolder' AS drive_folder
    FROM applications a
    LEFT JOIN properties p ON p.id = a.property_id
    LEFT JOIN LATERAL (
      SELECT pt.contact_id FROM participants pt
      WHERE pt.application_id = a.id
      ORDER BY (pt.role = 'borrower') DESC, pt.created_at ASC, pt.contact_id ASC
      LIMIT 1
    ) one ON true
    LEFT JOIN contacts c ON c.id = one.contact_id
    LEFT JOIN LATERAL (
      SELECT x.subject, x.metadata FROM activities x
      WHERE x.application_id = a.id AND x.kind = 'form_submission'
      ORDER BY x.occurred_at ASC
      LIMIT 1
    ) sub ON true
    WHERE a.id = ${part.applicationId}::uuid AND a.submitted_by_user_id = ${userId}
  `))[0];
  if (!r) return { ok: false, error: "not_found", status: 404 };
  const submittedAt = r.submitted_at instanceof Date ? r.submitted_at : str(r.submitted_at);
  if (!withinPartWindow(submittedAt, now)) return { ok: false, error: "not_found", status: 404 };

  let brokerEmail = "";
  try {
    const u = await currentUser();
    brokerEmail = u?.primaryEmailAddress?.emailAddress ?? "";
  } catch {
    // The files still go through; the email just names the broker less well.
  }

  const firstName = str(r.first_name_sent);
  const borrower = [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim();
  const names = part.files.map((f) => f.name);

  const sent = await forward({
    submissionName: partFolderName(firstName, part.index, part.total),
    summary: partSummary({ firstName, index: part.index, total: part.total, names, applicationId: part.applicationId }),
    brokerEmail,
    // The folder the server recorded for request 1 wins over the browser's copy.
    folderUrl: str(r.drive_folder) ?? part.firstFolder,
    application: {
      borrower,
      program: "Additional files",
      propertyAddress: str(r.address_line1) ?? "",
      loanAmount: "",
      notes: PART_NOTE,
    },
    files: part.files,
  });
  if (!sent.ok) return { ok: false, error: "intake_failed", status: 502 };

  // Drive has the files. Record that they arrived — names in the body, never
  // contents — as an automation line, so it neither resets a quiet clock nor
  // looks like a new enquiry. A repeat of the same part adds no second row.
  try {
    await db.execute(sql`
      INSERT INTO activities (contact_id, application_id, kind, occurred_at, source, subject, body, metadata, dedup_key)
      VALUES (${str(r.contact_id)}::uuid, ${part.applicationId}::uuid, 'automation', ${now.toISOString()}::timestamptz, 'broker_portal',
              ${`More files for this application (part ${part.index} of ${part.total})`},
              ${names.join("\n")},
              ${JSON.stringify({ driveFolder: sent.folder, part: { index: part.index, total: part.total } })}::jsonb,
              ${`broker-portal-part:${part.applicationId}:${part.index}`})
      ON CONFLICT DO NOTHING
    `);
  } catch (e) {
    // The files are safely in Drive; a missing timeline line is not worth
    // telling the broker their upload failed.
    console.error("[applicationParts] activity write failed:", e instanceof Error ? e.message : e);
  }

  return { ok: true, folder: sent.folder };
}
