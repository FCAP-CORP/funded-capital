/**
 * Document requests — the broker's side. See a deal's list, upload against an
 * item.
 *
 * BROKER-REACHABLE, so it asserts nothing about staff (an `assertCrmStaff()`
 * here would throw for every broker) and may not import the staff modules —
 * guards.regress.ts §5 checks both. What it asserts instead is SCOPE:
 *
 *   - The viewer comes from the session (`resolveBrokerViewer`), never from the
 *     request, and every read goes through `canViewApplication` /
 *     `canActOnApplication` in scope.ts — the only place that decides what a
 *     broker may see. An application id alone opens nothing.
 *   - The request must belong to THAT application and still take uploads.
 *   - Staff may LOOK (to see what the broker sees) but not upload: Luis has
 *     Drive.
 *
 * FILES NEVER LAND HERE. `uploadToRequest` hands the files to a forwarder (the
 * Drive intake, supplied by the route) and records only their NAMES, after
 * Drive has accepted them. Guard §17 pins that order.
 */

import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { isCrmStaff } from "@/lib/crm/access";
import { canUploadTo, isUuid, uploadFolderName, type UploadFile } from "@/lib/crm/docRequests";
import { canActOnApplication, canViewApplication } from "./scope";
import { resolveBrokerViewer } from "./viewer";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export type BrokerDocRequest = {
  id: string;
  label: string;
  hint: string | null;
  note: string | null;
  status: string;
  /** "Needs another copy" — why, in Luis's words. Shown only while the item is needed again. */
  reviewNote: string | null;
  receivedAt: string | null;
  /** File names only. */
  files: string[];
};

export type BrokerDealView = {
  applicationId: string;
  borrower: string | null;
  property: string | null;
  product: string;
  stage: string;
  loanAmount: number | null;
  requests: BrokerDocRequest[];
  /** False for staff looking at the broker's view, and for a suspended broker. */
  canUpload: boolean;
  staffPreview: boolean;
};

/** The deal row plus the three ownership fields scope.ts decides on. */
async function readDeal(applicationId: string): Promise<Row | null> {
  return rowsOf(await db.execute(sql`
    SELECT a.id, a.stage, a.product, a.requested_amount, a.submitted_by_user_id, a.broker_firm_id,
           p.address_line1, c.first_name, c.last_name, c.id AS contact_id
    FROM applications a
    LEFT JOIN properties p ON p.id = a.property_id
    LEFT JOIN LATERAL (
      SELECT pt.contact_id FROM participants pt
      WHERE pt.application_id = a.id
      ORDER BY (pt.role = 'borrower') DESC, pt.created_at ASC, pt.contact_id ASC
      LIMIT 1
    ) one ON true
    LEFT JOIN contacts c ON c.id = one.contact_id
    WHERE a.id = ${applicationId}::uuid
  `))[0] ?? null;
}

const ownership = (r: Row) => ({
  applicationId: String(r.id),
  submittedByUserId: str(r.submitted_by_user_id),
  brokerFirmId: str(r.broker_firm_id),
});

const borrowerOf = (r: Row) => [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim() || null;

/**
 * One deal and its document list, for the broker deal page. Null — rendered as
 * "not found" — when there is no such deal OR this person may not see it; the
 * two are deliberately indistinguishable.
 */
export async function getBrokerDeal(applicationId: string): Promise<BrokerDealView | null> {
  if (!isUuid(applicationId)) return null;
  const viewer = await resolveBrokerViewer();
  const staff = viewer ? false : await isCrmStaff();
  if (!viewer && !staff) return null;

  const r = await readDeal(applicationId);
  if (!r) return null;
  const own = ownership(r);
  if (!staff && !canViewApplication(viewer, own)) return null;

  const [reqRows, fileRows] = await db.batch([
    db.execute(sql`
      SELECT id, label, hint, note, status, review_note, received_at
      FROM document_requests
      WHERE application_id = ${applicationId}::uuid AND status <> 'removed'
      ORDER BY sort ASC, created_at ASC
    `),
    db.execute(sql`
      SELECT d.request_id, d.name FROM documents d
      JOIN document_requests dr ON dr.id = d.request_id AND dr.application_id = ${applicationId}::uuid
      WHERE d.application_id = ${applicationId}::uuid
      ORDER BY d.name ASC
    `),
  ] as unknown as Parameters<typeof db.batch>[0]);

  const files = new Map<string, string[]>();
  for (const f of rowsOf(fileRows)) {
    const k = String(f.request_id);
    files.set(k, [...(files.get(k) ?? []), String(f.name)]);
  }

  return {
    applicationId: own.applicationId,
    borrower: borrowerOf(r),
    property: str(r.address_line1),
    product: str(r.product) ?? "unknown",
    stage: str(r.stage) ?? "lead",
    loanAmount: r.requested_amount === null || r.requested_amount === undefined ? null : Number(r.requested_amount),
    requests: rowsOf(reqRows).map((q) => ({
      id: String(q.id),
      label: String(q.label),
      hint: str(q.hint),
      note: str(q.note),
      status: String(q.status),
      reviewNote: String(q.status) === "requested" ? str(q.review_note) : null,
      receivedAt: iso(q.received_at),
      files: files.get(String(q.id)) ?? [],
    })),
    canUpload: !staff && canActOnApplication(viewer, own),
    staffPreview: staff,
  };
}

/** What the forwarder is given: everything Drive needs, nothing it does not. */
export type ForwardInput = {
  folderName: string;
  summary: string;
  brokerEmail: string;
  application: { borrower: string; program: string; propertyAddress: string; loanAmount: string; notes: string };
  files: UploadFile[];
};
export type ForwardResult = { ok: true; folder: string | null } | { ok: false; error: string };

export type UploadResult =
  | { ok: true; received: number }
  | { ok: false; error: "not_found" | "closed" | "intake_failed"; status: number };

/**
 * Upload files against one item. Order is the safety (guard §17):
 * session viewer → deal → canActOnApplication → request belongs to the deal
 * and takes uploads → FORWARD TO DRIVE → only then record names.
 */
export async function uploadToRequest(
  applicationId: string,
  requestId: string,
  files: UploadFile[],
  forward: (input: ForwardInput) => Promise<ForwardResult>,
  now: Date = new Date(),
): Promise<UploadResult> {
  const viewer = await resolveBrokerViewer();
  if (!viewer) return { ok: false, error: "not_found", status: 404 };
  if (!isUuid(applicationId) || !isUuid(requestId)) return { ok: false, error: "not_found", status: 404 };

  const r = await readDeal(applicationId);
  if (!r || !canActOnApplication(viewer, ownership(r))) return { ok: false, error: "not_found", status: 404 };

  const q = rowsOf(await db.execute(sql`
    SELECT id, label, status FROM document_requests
    WHERE id = ${requestId}::uuid AND application_id = ${applicationId}::uuid
  `))[0];
  if (!q) return { ok: false, error: "not_found", status: 404 };
  if (!canUploadTo(String(q.status))) return { ok: false, error: "closed", status: 409 };

  let brokerEmail = "";
  let brokerName = "";
  try {
    const u = await currentUser();
    brokerEmail = u?.primaryEmailAddress?.emailAddress ?? "";
    brokerName = u?.fullName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "";
  } catch {
    // The upload still goes through; the email just names the broker less well.
  }

  const borrower = borrowerOf(r);
  const property = str(r.address_line1);
  const item = String(q.label);
  const day = now.toISOString().slice(0, 10);
  const names = files.map((f) => f.name);

  const sent = await forward({
    folderName: uploadFolderName({ borrower, property, item, day }),
    summary: [
      "More documents for an existing deal — NOT a new application.",
      "",
      `Deal: ${borrower ?? "(no borrower name)"}${property ? ` — ${property}` : ""}`,
      `Document: ${item}`,
      `From: ${brokerName || brokerEmail || "a broker"}${brokerName && brokerEmail ? ` (${brokerEmail})` : ""}`,
      `Files: ${names.join(", ")}`,
      "",
      `Review it in Lending OS: https://www.fundedcapital.com/crm?open=${applicationId}`,
    ].join("\n"),
    brokerEmail,
    application: {
      borrower: borrower ?? "",
      program: "Additional documents",
      propertyAddress: property ?? "",
      loanAmount: "",
      notes: `Additional documents for an existing deal, not a new application: ${item}`,
    },
    files,
  });
  if (!sent.ok) return { ok: false, error: "intake_failed", status: 502 };

  const at = now.toISOString();
  const contactId = str(r.contact_id);
  await db.batch([
    ...names.map((name) => db.execute(sql`
      INSERT INTO documents (application_id, contact_id, name, doc_type, requested_at, received_at, request_id)
      SELECT ${applicationId}::uuid, ${contactId}::uuid, ${name}, ${item}, dr.requested_at, ${at}::timestamptz, dr.id
      FROM document_requests dr WHERE dr.id = ${requestId}::uuid
    `)),
    // Still needed or under review → under review. If Luis waived or removed it
    // while the upload was travelling, the item stays as he left it; the files
    // are in Drive and listed on the card either way.
    db.execute(sql`
      UPDATE document_requests SET
        status = 'received', received_at = ${at}::timestamptz,
        received_file_count = received_file_count + ${names.length}, updated_at = ${at}::timestamptz
      WHERE id = ${requestId}::uuid AND status IN ('requested', 'received')
    `),
    db.execute(sql`
      INSERT INTO activities (contact_id, application_id, kind, occurred_at, source, subject, body, metadata)
      VALUES (${contactId}::uuid, ${applicationId}::uuid, 'automation', ${at}::timestamptz, 'broker_portal',
              ${`Broker uploaded: ${item} (${names.length} ${names.length === 1 ? "file" : "files"})`},
              ${names.join("\n")},
              ${JSON.stringify({ requestId, driveFolder: sent.folder, uploadedBy: viewer.userId })}::jsonb)
    `),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return { ok: true, received: names.length };
}
