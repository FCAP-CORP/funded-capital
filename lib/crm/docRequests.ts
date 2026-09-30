/**
 * Document requests — what Funded Capital needs on a deal, and where each item
 * stands. Shared by Lending OS (Luis asks, reviews, accepts) and the broker
 * portal (the broker sees the list and uploads against each item).
 *
 * PURE. No database, no session. Pinned by docRequests.regress.ts.
 *
 * THE LIST STARTS ITSELF. When a deal first moves to term sheet (or any later
 * working stage), the standard list for its loan type and purpose is created —
 * Luis only adds, removes or waives. A deal already past that point gets the
 * same list from "Create the list" on its record card.
 *
 * FILES NEVER LIVE HERE. An upload goes to Drive intake like every other
 * broker file; the database keeps the item, its status, and each file's NAME.
 *
 * STATUSES
 *   requested  needed, waiting on the broker (or borrower)
 *   received   uploaded, waiting on Luis's review
 *   accepted   Luis is happy with it
 *   waived     not needed on this deal after all
 *   removed    taken off the list (kept, so the automatic list never re-adds it)
 */

export const DOC_STATUSES = ["requested", "received", "accepted", "waived", "removed"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export type DocItem = { key: string; label: string; hint: string };

const ITEM = {
  entity: { key: "entity", label: "Entity documents", hint: "Articles of organization, operating agreement and EIN letter for the borrowing company." },
  id: { key: "id", label: "Photo ID for each guarantor", hint: "Driver's licence or passport, front and back." },
  bank: { key: "bank", label: "Bank statements, last 2 months", hint: "All pages, showing funds for the down payment, closing costs and reserves." },
  track: { key: "track", label: "Track record", hint: "Completed projects: address, purchase price, and sale or refinance." },
  insurance: { key: "insurance", label: "Insurance quote or binder", hint: "From the borrower's agent, for the subject property." },
  contract: { key: "contract", label: "Purchase contract", hint: "Fully signed, with any addenda." },
  payoff: { key: "payoff", label: "Payoff statement", hint: "From the current lender." },
  settlement: { key: "settlement", label: "Settlement statement from the purchase", hint: "Shows what was paid when the property was bought." },
  scope: { key: "scope", label: "Scope of work and budget", hint: "Line by line, with the timeline." },
  plans: { key: "plans", label: "Plans and permits", hint: "Stamped plans and issued permits, or the expected permit timeline." },
  builder: { key: "builder", label: "Builder contract and licence", hint: "Signed contract with the general contractor and their licence." },
  budget: { key: "budget", label: "Construction budget and schedule", hint: "Hard and soft costs, with the draw schedule." },
  leases: { key: "leases", label: "Leases or rent roll", hint: "Signed leases for occupied units. Vacant units are underwritten at market rent." },
  operating: { key: "operating", label: "Rent roll and 12-month operating statement", hint: "Current rent roll and the last 12 months of income and expenses." },
  exit: { key: "exit", label: "Exit plan", hint: "How the loan is repaid (sale or refinance) and when." },
} as const satisfies Record<string, DocItem>;

export const STANDARD_ITEMS: readonly DocItem[] = Object.values(ITEM);

const REFI = new Set(["rate_term_refi", "cash_out_refi", "refinance", "refi"]);

/**
 * The standard list for a deal. `product` is the CRM's product value
 * (fix_and_flip, ground_up, dscr, bridge, multifamily, …); anything unknown
 * gets the common items only, which is still a sensible start.
 */
export function checklistFor(product: string | null | undefined, purpose: string | null | undefined): DocItem[] {
  const refi = REFI.has(String(purpose ?? ""));
  const items: DocItem[] = [ITEM.entity, ITEM.id, ITEM.bank];
  items.push(refi ? ITEM.payoff : ITEM.contract);
  if (refi) items.push(ITEM.settlement);
  switch (product) {
    case "fix_and_flip":
      items.push(ITEM.scope, ITEM.track);
      break;
    case "ground_up":
      items.push(ITEM.plans, ITEM.builder, ITEM.budget, ITEM.track);
      break;
    case "dscr":
      items.push(ITEM.leases);
      break;
    case "bridge":
    case "multifamily":
      items.push(ITEM.operating, ITEM.exit, ITEM.track);
      break;
    default:
      break;
  }
  items.push(ITEM.insurance);
  return items;
}

/** Stages at which the list starts itself: term sheet through closing docs. */
export const SEED_STAGES = [
  "term_sheet_issued", "term_sheet_signed", "application_in", "underwriting",
  "conditional_approval", "conditions_clearing", "clear_to_close", "docs_out",
] as const;

export const shouldSeed = (stage: string | null | undefined): boolean => (SEED_STAGES as readonly string[]).includes(String(stage ?? ""));

/* ------------------------------------------------------------ transitions */

export type StaffMove = "accept" | "again" | "waive" | "remove" | "reopen";

const MOVES: Record<StaffMove, { from: readonly DocStatus[]; to: DocStatus }> = {
  /** Luis is happy with what was uploaded. */
  accept: { from: ["received"], to: "accepted" },
  /** "Needs another copy" — back to the broker, with a note saying why. */
  again: { from: ["received", "accepted"], to: "requested" },
  /** Not needed on this deal. */
  waive: { from: ["requested", "received"], to: "waived" },
  /** Off the list entirely. */
  remove: { from: ["requested", "received", "accepted", "waived"], to: "removed" },
  /** Put a waived or removed item back on the list. */
  reopen: { from: ["waived", "removed"], to: "requested" },
};

export function staffMove(current: string, move: string): { ok: true; to: DocStatus } | { ok: false; error: string } {
  const m = MOVES[move as StaffMove];
  if (!m) return { ok: false, error: "Unknown action." };
  if (!(m.from as readonly string[]).includes(current)) return { ok: false, error: "That item has already changed. Refresh and try again." };
  return { ok: true, to: m.to };
}

/** A broker may upload against an item that is still needed, or add more to one under review. */
export const canUploadTo = (status: string): boolean => status === "requested" || status === "received";

/* ----------------------------------------------------------------- labels */

export const STAFF_STATUS_LABEL: Record<DocStatus, string> = {
  requested: "Needed",
  received: "To review",
  accepted: "Accepted",
  waived: "Not needed",
  removed: "Removed",
};

export const BROKER_STATUS_LABEL: Record<DocStatus, string> = {
  requested: "Needed",
  received: "Under review",
  accepted: "Accepted",
  waived: "Not needed",
  removed: "Removed",
};

export type DocRequestLite = { status: string };

/** Progress, ignoring removed items. */
export function docSummary(reqs: DocRequestLite[]): { total: number; needed: number; review: number; done: number } {
  const live = reqs.filter((r) => r.status !== "removed");
  return {
    total: live.length,
    needed: live.filter((r) => r.status === "requested").length,
    review: live.filter((r) => r.status === "received").length,
    done: live.filter((r) => r.status === "accepted" || r.status === "waived").length,
  };
}

/* ------------------------------------------------------------ custom items */

export const MAX_LABEL = 120;
export const MAX_NOTE = 500;

export function parseCustomItem(label: unknown, note: unknown): { ok: true; label: string; note: string | null } | { ok: false; error: string } {
  const l = typeof label === "string" ? label.replace(/\s+/g, " ").trim() : "";
  if (l.length < 2) return { ok: false, error: "Name the document." };
  if (l.length > MAX_LABEL) return { ok: false, error: `Keep the name under ${MAX_LABEL} characters.` };
  const n = typeof note === "string" ? note.trim() : "";
  if (n.length > MAX_NOTE) return { ok: false, error: `Keep the note under ${MAX_NOTE} characters.` };
  return { ok: true, label: l, note: n || null };
}

export function parseNote(note: unknown): string | null {
  const n = typeof note === "string" ? note.trim().slice(0, MAX_NOTE) : "";
  return n || null;
}

/* ---------------------------------------------------------------- uploads */

export const MAX_UPLOAD_FILES = 10;
/**
 * Base64 characters per upload request — about 3 MB of files.
 *
 * NOT an Apps Script limit: Vercel refuses any function request body over
 * 4.5 MB before our code runs. The page packs a broker's files into as many
 * requests as it takes (each lands as its own Drive folder); one file too big
 * for a request on its own is refused in the browser with a way round it.
 */
export const MAX_UPLOAD_BASE64 = 4_200_000;
/** The raw size of one file that fits in a request with room for the JSON around it. */
export const MAX_FILE_BYTES = Math.floor((MAX_UPLOAD_BASE64 * 3) / 4) - 16_000;

export type UploadFile = { name: string; mimeType: string; data: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const safeName = (s: string) => s.replace(/[\u0000-\u001f\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();

/** Validate an upload body. Names are cleaned; nothing else from the browser is trusted. */
export function parseUpload(raw: unknown): { ok: true; applicationId: string; requestId: string; files: UploadFile[] } | { ok: false; error: string } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isUuid(b.applicationId) || !isUuid(b.requestId)) return { ok: false, error: "not_found" };
  const files = (Array.isArray(b.files) ? b.files : [])
    .map((f) => (f && typeof f === "object" ? f : {}) as Record<string, unknown>)
    .filter((f) => typeof f.data === "string" && (f.data as string).length > 0 && typeof f.name === "string")
    .map((f) => ({
      name: (safeName(String(f.name)) || "document").slice(0, 150),
      mimeType: typeof f.mimeType === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(f.mimeType) ? f.mimeType : "application/octet-stream",
      data: String(f.data),
    }));
  if (files.length === 0) return { ok: false, error: "no_files" };
  if (files.length > MAX_UPLOAD_FILES) return { ok: false, error: "too_many_files" };
  if (files.reduce((n, f) => n + f.data.length, 0) > MAX_UPLOAD_BASE64) return { ok: false, error: "files_too_large" };
  if (files.some((f) => !/^[A-Za-z0-9+/=\r\n]+$/.test(f.data))) return { ok: false, error: "bad_file" };
  return { ok: true, applicationId: b.applicationId, requestId: b.requestId, files };
}

/**
 * The Drive folder name for an upload. The intake script files every broker
 * post as a "submission", so the name says plainly that this is more documents
 * for an existing deal, not a new application.
 */
export function uploadFolderName(p: { borrower: string | null; property: string | null; item: string; day: string }): string {
  return safeName(`Documents for ${p.borrower || "a borrower"} - ${p.property || "existing deal"} - ${p.item} - ${p.day}`).slice(0, 120);
}

/**
 * Pack files (by base64 length) into upload requests that each fit under
 * MAX_UPLOAD_BASE64 and MAX_UPLOAD_FILES, in the order given. A file too big
 * for any request comes back in `tooBig` and is never sent.
 */
export function packUploads<T extends { size: number }>(files: T[]): { batches: T[][]; tooBig: T[] } {
  const b64 = (n: number) => Math.ceil(n / 3) * 4;
  const batches: T[][] = [];
  const tooBig: T[] = [];
  let cur: T[] = [];
  let used = 0;
  for (const f of files) {
    const len = b64(f.size);
    if (f.size > MAX_FILE_BYTES || len > MAX_UPLOAD_BASE64) { tooBig.push(f); continue; }
    if (cur.length > 0 && (used + len > MAX_UPLOAD_BASE64 || cur.length >= MAX_UPLOAD_FILES)) {
      batches.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(f);
    used += len;
  }
  if (cur.length) batches.push(cur);
  return { batches, tooBig };
}
