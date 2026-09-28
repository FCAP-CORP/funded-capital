/**
 * Saved applications — the rules for what a broker's unfinished application
 * may hold, what it is called, and when it is worth saving.
 *
 * PURE. No database, no session. Pinned by drafts.regress.ts. The reads and
 * writes are lib/broker/drafts.server.ts (the broker's own drafts only) and
 * listOpenDrafts in lib/broker/admin.server.ts (staff).
 *
 * WHAT A DRAFT HOLDS: the form fields and the property schedule, exactly the
 * strings the inputs produced, and the step reached. NEVER FILES: an uploaded
 * document is not in the shape at all, so there is nothing for a stray client
 * to smuggle one into — the portal is a pipe for files, and the broker
 * re-attaches them before submitting.
 *
 * WHAT IS REFUSED OR TRIMMED: unknown keys are dropped, every string is capped,
 * the schedule is capped at the portfolio maximum, and a product or purpose
 * the pricing engine does not know falls back to the form's own default. A
 * draft is a convenience; nothing in it is trusted — submission re-reads and
 * re-validates everything as it always has.
 */

import { LOAN_PURPOSE_OPTIONS, MAX_PORTFOLIO_PROPERTIES, RATE_CONFIG, type LoanPurpose, type ProductKey } from "@/lib/pricing";

export const FORM_FIELDS = ["product", "purpose", "borrower", "entity", "email", "phone", "fico", "loanAmount", "notes"] as const;
export type FormField = (typeof FORM_FIELDS)[number];

export const ROW_FIELDS = [
  "address", "value", "rehabBudget", "arv", "sunkCosts", "estimatedPayoff",
  "monthlyRent", "annualTaxes", "annualInsurance", "annualHoa",
] as const;
export type RowField = (typeof ROW_FIELDS)[number];

export type DraftForm = { product: ProductKey; purpose: LoanPurpose } & Record<Exclude<FormField, "product" | "purpose">, string>;
export type DraftRow = Record<RowField, string>;

export type DraftData = {
  form: DraftForm;
  isPortfolio: boolean;
  schedule: DraftRow[];
  /** The step the broker was on, 1–5. */
  step: number;
};

export const MAX_FIELD = 300;
export const MAX_NOTES = 4000;
/** More open drafts than this and the oldest stops being offered. */
export const MAX_OPEN_DRAFTS = 20;
/** Untouched this long → expired and wiped. */
export const DRAFT_TTL_DAYS = 90;
/** How long the browser waits after the last keystroke before saving. */
export const AUTOSAVE_MS = 1500;

export const DEFAULT_PRODUCT: ProductKey = "dscr";
export const DEFAULT_PURPOSE: LoanPurpose = "purchase";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v).slice(0, max) : "");

export const blankRow = (): DraftRow => Object.fromEntries(ROW_FIELDS.map((k) => [k, ""])) as DraftRow;

export function blankDraft(): DraftData {
  return {
    form: { product: DEFAULT_PRODUCT, purpose: DEFAULT_PURPOSE, borrower: "", entity: "", email: "", phone: "", fico: "", loanAmount: "", notes: "" },
    isPortfolio: false,
    schedule: [blankRow()],
    step: 1,
  };
}

const PRODUCTS = new Set(Object.keys(RATE_CONFIG.products));
const PURPOSES = new Set(LOAN_PURPOSE_OPTIONS.map((o) => o.key));

/**
 * Anything → a clean draft. Never throws; junk becomes blanks. `ok: false`
 * only when the input is not even an object, so the caller can say "that
 * could not be saved" rather than saving an empty form over a real one.
 */
export function parseDraft(raw: unknown): { ok: true; value: DraftData } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Nothing to save." };
  const r = obj(raw);
  const f = obj(r.form);
  const product = PRODUCTS.has(String(f.product)) ? (String(f.product) as ProductKey) : DEFAULT_PRODUCT;
  const purpose = PURPOSES.has(String(f.purpose) as LoanPurpose) ? (String(f.purpose) as LoanPurpose) : DEFAULT_PURPOSE;
  const form: DraftForm = {
    product,
    purpose,
    borrower: text(f.borrower, MAX_FIELD),
    entity: text(f.entity, MAX_FIELD),
    email: text(f.email, MAX_FIELD),
    phone: text(f.phone, MAX_FIELD),
    fico: text(f.fico, MAX_FIELD),
    loanAmount: text(f.loanAmount, MAX_FIELD),
    notes: text(f.notes, MAX_NOTES),
  };
  const rows = (Array.isArray(r.schedule) ? r.schedule : [])
    .slice(0, MAX_PORTFOLIO_PROPERTIES)
    .map((x) => {
      const o = obj(x);
      return Object.fromEntries(ROW_FIELDS.map((k) => [k, text(o[k], MAX_FIELD)])) as DraftRow;
    });
  const stepN = Math.floor(Number(r.step));
  return {
    ok: true,
    value: {
      form,
      isPortfolio: r.isPortfolio === true,
      schedule: rows.length ? rows : [blankRow()],
      step: Number.isFinite(stepN) ? Math.min(5, Math.max(1, stepN)) : 1,
    },
  };
}

/** Worth saving: something a broker would be annoyed to type again. Picking a program alone is not. */
export function draftHasContent(d: DraftData): boolean {
  const f = d.form;
  if ([f.borrower, f.entity, f.email, f.phone, f.fico, f.loanAmount, f.notes].some((v) => v.trim() !== "")) return true;
  return d.schedule.some((row) => ROW_FIELDS.some((k) => row[k].trim() !== ""));
}

/** "Tony Esposito · 358 Cozart Ave SW" — what the dashboards list it as. */
export function draftLabel(d: DraftData): string {
  const who = d.form.borrower.trim() || d.form.entity.trim() || "Unnamed borrower";
  const where = d.schedule.find((r) => r.address.trim())?.address.trim() || "no property yet";
  return `${who} · ${where}`.slice(0, 160);
}

export const STEP_LABEL = ["Program", "Borrower", "Property", "Documents", "Review"] as const;

export function stepLabel(step: number): string {
  const n = Math.min(5, Math.max(1, Math.floor(step) || 1));
  return `Step ${n} of 5 · ${STEP_LABEL[n - 1]}`;
}

/** "just now", "12 minutes ago", "3 hours ago", "2 days ago". */
export function savedAgo(iso: string | null, now: Date): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** One of the broker's own unfinished applications, as the dashboard lists it. */
export type MyDraft = { id: string; label: string; step: number; savedAt: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isDraftId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
