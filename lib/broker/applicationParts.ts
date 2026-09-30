/**
 * A new broker application with more files than one request can carry.
 *
 * PURE. No database, no session. Pinned by applicationParts.regress.ts.
 *
 * WHY THIS EXISTS. Vercel refuses any function request body over 4.5 MB before
 * our code runs, so an application with a few scanned PDFs used to fail with a
 * 413 that the broker saw as a generic error. The files are now packed in the
 * browser with the same `packUploads` the document-request uploads use:
 *
 *   - Request 1 carries the application plus the first batch of files, exactly
 *     as before. A small application is still ONE request, ONE Drive folder,
 *     ONE email.
 *   - Every further batch is a follow-up post to the same route, sent one at a
 *     time after request 1 succeeded, naming the application it belongs to.
 *   - A single file too big for any request is held back BEFORE submitting,
 *     with a way round it (split, compress, or email it); the rest still go.
 *
 * THE PORTAL IS A PIPE. Nothing here stores a file. Each batch goes straight on
 * to the Drive intake and only the fact that it arrived is recorded.
 */

import { MAX_FILE_BYTES, MAX_UPLOAD_BASE64, isUuid, packUploads, parseUpload, type UploadFile } from "@/lib/crm/docRequests";

/** At most this many requests per application, the first included. */
export const MAX_PARTS = 20;

/** The form's own cap on attached files (ApplyClient keeps the first 25). */
export const MAX_APPLICATION_FILES = 25;

/** A follow-up is accepted only this long after the application was submitted. */
export const PART_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Tolerated clock skew for an application stamped a moment "in the future". */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * The largest request body the route accepts: one packed batch of files plus
 * room for the JSON around it (the application, summary and property schedule
 * on request 1). Still under Vercel's 4.5 MB, so the route's own clear
 * "files_too_large" answer is what a broker sees, not Vercel's bare 413.
 */
export const MAX_REQUEST_CHARS = MAX_UPLOAD_BASE64 + 64_000;

/** The email address a broker is sent to for anything the portal could not carry. */
export const FILES_EMAIL = "info@fundedcapital.com";

/** What the Drive summary and the CRM notes say on every follow-up. */
export const PART_NOTE = "More files for the application just submitted — not a new application";

/* ------------------------------------------------------ request 1 (server) */

/**
 * The file count recorded on the CRM application. Request 1 carries only the
 * first batch, so the browser also says how many files the whole application
 * is sending. Believed only when it is a whole number no smaller than what
 * actually arrived and no larger than the form allows; otherwise the count of
 * what arrived.
 */
export function applicationFileCount(totalFiles: unknown, arrivedNow: number): number {
  const n = typeof totalFiles === "number" ? totalFiles : NaN;
  return Number.isInteger(n) && n >= arrivedNow && n <= MAX_APPLICATION_FILES ? n : arrivedNow;
}

/* ------------------------------------------------------ follow-ups (server) */

export type ParsedPart = {
  applicationId: string;
  index: number;
  total: number;
  /** The Drive folder request 1 made, if the browser sent a plausible one. */
  firstFolder: string | null;
  files: UploadFile[];
};

const FOLDER_URL = /^https:\/\/(drive|docs)\.google\.com\/[^\s"'<>\\]{1,400}$/;

/**
 * Validate a follow-up body: `{ part: { applicationId, index, total, firstFolder }, files }`.
 *
 * The files are checked by lib/crm/docRequests.ts's own `parseUpload` — the
 * same name cleaning, base64-only data, file count and size cap as a
 * document-request upload — by handing it the application id in both id
 * slots. Reusing it rather than copying it means the two upload paths can
 * never drift apart.
 */
export function parsePart(raw: unknown): { ok: true; value: ParsedPart } | { ok: false; error: string } {
  const b = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const p = (b.part && typeof b.part === "object" && !Array.isArray(b.part) ? b.part : {}) as Record<string, unknown>;
  if (!isUuid(p.applicationId)) return { ok: false, error: "not_found" };
  const index = p.index, total = p.total;
  if (typeof index !== "number" || typeof total !== "number" || !Number.isInteger(index) || !Number.isInteger(total)) {
    return { ok: false, error: "bad_request" };
  }
  if (index < 2 || index > total || total > MAX_PARTS) return { ok: false, error: "bad_request" };
  const up = parseUpload({ applicationId: p.applicationId, requestId: p.applicationId, files: b.files });
  if (!up.ok) return { ok: false, error: up.error };
  const firstFolder = typeof p.firstFolder === "string" && FOLDER_URL.test(p.firstFolder) ? p.firstFolder : null;
  return { ok: true, value: { applicationId: p.applicationId, index, total, firstFolder, files: up.files } };
}

const safeName = (s: string) => s.replace(/[\u0000-\u001f\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();

/**
 * The Drive folder name for follow-up `index` of `total`: the application's
 * own name with "- files 2 of 3" after it, so the folders sort together and
 * the email subject says what it is. Under 120 characters; when the name is
 * long it is the name that is shortened, never the "files N of M".
 */
export function partFolderName(firstName: string | null | undefined, index: number, total: number): string {
  const suffix = ` - files ${index} of ${total}`;
  const base = safeName(String(firstName ?? "")).slice(0, 120 - suffix.length).trim() || "Broker application";
  return `${base}${suffix}`;
}

/** Is a follow-up still welcome? Within two hours of the application's submission. */
export function withinPartWindow(submittedAt: Date | string | null | undefined, now: Date): boolean {
  if (!submittedAt) return false;
  const at = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  if (Number.isNaN(at.getTime())) return false;
  const age = now.getTime() - at.getTime();
  return age >= -CLOCK_SKEW_MS && age <= PART_WINDOW_MS;
}

/** The body of the Drive summary (and the email) for a follow-up. */
export function partSummary(p: { firstName: string | null; index: number; total: number; names: string[]; applicationId: string }): string {
  return [
    PART_NOTE + ".",
    "",
    `Application: ${p.firstName || "(name not recorded)"}`,
    `Part ${p.index} of ${p.total}`,
    `Files: ${p.names.join(", ")}`,
    "",
    `Review it in Lending OS: https://www.fundedcapital.com/crm?open=${p.applicationId}`,
  ].join("\n");
}

/* --------------------------------------------------------- the browser plan */

export type UploadPlan<T> = {
  /** Requests to send, in order. batches[0] rides with the application. */
  batches: T[][];
  /** Files too big for any request on their own. Never sent. */
  heldBack: T[];
  /** Files beyond MAX_PARTS requests. Never sent. */
  overflow: T[];
  /** How many files will be sent. */
  sending: number;
};

/** Pack the attached files into requests (by `size`), holding back what cannot go. */
export function planUploads<T extends { size: number }>(files: T[]): UploadPlan<T> {
  const { batches, tooBig } = packUploads(files);
  const kept = batches.slice(0, MAX_PARTS);
  return {
    batches: kept,
    heldBack: tooBig,
    overflow: batches.slice(MAX_PARTS).flat(),
    sending: kept.reduce((n, b) => n + b.length, 0),
  };
}

/** One file too large for the portal, on its own. */
export const isTooLarge = (size: number): boolean => size > MAX_FILE_BYTES;

/** The per-file limit a broker is told, e.g. "3.1 MB". */
export const perFileLimit = `${(MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB`;

/** What the submit button says while request `index` of `total` is on its way. */
export function submitLabel(index: number, total: number): string {
  if (total <= 1) return "Submitting…";
  if (index <= 1) return `Submitting (files 1 of ${total})…`;
  return `Uploading files ${index} of ${total}…`;
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** The sentence shown before submitting when a file cannot go through the portal. */
export function heldBackNotice(names: string[]): string {
  if (names.length === 0) return "";
  const one = names.length === 1;
  return `${list(names)} ${one ? "is" : "are"} too large to upload here (the limit is ${perFileLimit} per file). ` +
    `Split or compress ${one ? "it" : "them"}, or email ${one ? "it" : "them"} to ${FILES_EMAIL} with the borrower's name in the subject. ` +
    `You can still submit the application and the other files now.`;
}

/** The sentence shown before submitting when there are more files than requests allowed. */
export function overflowNotice(names: string[]): string {
  if (names.length === 0) return "";
  return `That is more than the portal can send with one application, so ${names.length === 1 ? "1 file" : `${names.length} files`} ` +
    `(${list(names)}) will not be uploaded. Email ${names.length === 1 ? "it" : "them"} to ${FILES_EMAIL} with the borrower's name in the subject.`;
}

/**
 * The files that did not reach us, after the fact: everything held back, and
 * every batch not marked delivered. `delivered[i]` is batch i's outcome.
 */
export function missingFiles<T>(plan: UploadPlan<T>, delivered: boolean[]): T[] {
  return [
    ...plan.batches.flatMap((b, i) => (delivered[i] ? [] : b)),
    ...plan.heldBack,
    ...plan.overflow,
  ];
}

/** The "Documents attached" lines of request 1's summary, for Luis's email. */
export function documentsSummaryLines<T extends { name: string }>(plan: UploadPlan<T>): string[] {
  const lines = [
    `Documents attached: ${plan.sending}` +
      (plan.batches.length > 1 ? ` (arriving in ${plan.batches.length} parts; this folder holds part 1)` : ""),
  ];
  const notSent = [...plan.heldBack, ...plan.overflow].map((f) => f.name);
  if (notSent.length) lines.push(`Not uploaded (broker asked to email them): ${notSent.join(", ")}`);
  return lines;
}
