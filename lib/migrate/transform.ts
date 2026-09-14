/**
 * Pure transforms for the legacy CRM migration.
 *
 * Everything here is a plain function with no database and no file access, so it
 * can be tested exhaustively by lib/migrate/transform.regress.ts. The migration
 * script does the I/O; this module decides what the data MEANS.
 *
 * Guiding rule, inherited from the spam-filter work: never silently discard.
 * Anything unmappable returns a documented fallback plus a flag, so a wrong guess
 * is visible in the report rather than buried in the database.
 */

import { normalisePhone } from "../phone";

export type LeadSource =
  | "website" | "biggerpockets" | "referral" | "broker"
  | "linkedin" | "cold_email" | "reia" | "wholesale" | "other" | "unknown";

export type Product =
  | "fix_and_flip" | "ground_up" | "dscr" | "bridge"
  | "multifamily" | "multiple" | "not_our_product" | "unknown";

export type Stage =
  | "lead" | "qualified" | "term_sheet_issued" | "term_sheet_signed"
  | "application_in" | "underwriting" | "conditional_approval"
  | "conditions_clearing" | "clear_to_close" | "docs_out" | "funded"
  | "active" | "draw_cycle" | "payoff" | "extension" | "closed_lost";

/* ------------------------------------------------------------ primitives */

/** The legacy sheets use "N/A" as their empty convention, not blank. */
export function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === "N/A" || s === "-") return null;
  return s;
}

/** "$1,500,000" -> 1500000. Returns null rather than 0 for absent values, so a
 *  missing figure never masquerades as a real zero. */
export function parseMoney(v: unknown): number | null {
  const s = clean(v);
  if (s === null) return null;
  const digits = s.replace(/[^0-9.\-]/g, "");
  if (!digits || digits === "." || digits === "-") return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** Excel dates arrive as Date objects; CSV dates as "09/14/2026". */
export function parseDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = clean(v);
  if (s === null) return null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) return new Date(Date.UTC(+us[3], +us[1] - 1, +us[2]));
  const iso = new Date(s);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

/**
 * "Marcus Rivera" -> first/last. Surnames with particles stay together, and a
 * single token becomes a first name rather than a mystery last name.
 */
export function splitName(full: unknown): { firstName: string | null; lastName: string | null } {
  const s = clean(full);
  if (s === null) return { firstName: null, lastName: null };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** "Allentown, PA" -> market + two-letter state. */
export function parseMarket(v: unknown): { market: string | null; state: string | null } {
  const s = clean(v);
  if (s === null) return { market: null, state: null };
  const m = /^(.*),\s*([A-Za-z]{2})$/.exec(s);
  return m
    ? { market: m[1].trim(), state: m[2].toUpperCase() }
    : { market: s, state: null };
}

/** Comma-separated tag string -> deduplicated, lowercased array. */
export function parseTags(v: unknown): string[] {
  const s = clean(v);
  if (s === null) return [];
  const seen = new Set<string>();
  for (const raw of s.split(",")) {
    const t = raw.trim().toLowerCase();
    if (t) seen.add(t);
  }
  return [...seen];
}

export const normalisePhoneField = normalisePhone;

/* ---------------------------------------------------------------- enums */

const LEAD_SOURCE: Record<string, LeadSource> = {
  "biggerpockets": "biggerpockets",
  "bigger pockets": "biggerpockets",
  "bp": "biggerpockets",
  "website": "website",
  "web": "website",
  "referral": "referral",
  "broker": "broker",
  "linkedin": "linkedin",
  "cold email": "cold_email",
  "reia": "reia",
  "wholesale": "wholesale",
  "other": "other",
};

export function mapLeadSource(v: unknown): LeadSource {
  const s = clean(v);
  if (s === null) return "unknown";
  return LEAD_SOURCE[s.toLowerCase()] ?? "other";
}

/**
 * Product inference. The legacy data gives three overlapping hints — loan_type,
 * goal and strategy — and they disagree constantly, so precedence matters:
 * an explicit non-product (HELOC, conventional) beats everything, then the
 * strategy field, then loan_type.
 */
/**
 * The website forms submit SLUGS, not the labels a visitor sees. `<option
 * value="construction">New Construction</option>` posts "construction". Matching
 * on label text silently produced `unknown` for every New Construction lead.
 * These are the exact submitted values from components/ApplyForm.tsx.
 */
const WEB_LOAN_TYPE: Record<string, Product> = {
  "fix-flip": "fix_and_flip",
  "dscr": "dscr",
  "construction": "ground_up",
  "multifamily": "multifamily",
  "unsure": "unknown",
};

export function mapProduct(input: {
  loanType?: unknown; goal?: unknown; strategy?: unknown;
}): { product: Product; confident: boolean } {
  const loanType = (clean(input.loanType) ?? "").toLowerCase();

  // Exact web-form slug wins over any text heuristic below.
  if (loanType in WEB_LOAN_TYPE) {
    const product = WEB_LOAN_TYPE[loanType];
    return { product, confident: product !== "unknown" };
  }
  const goal = (clean(input.goal) ?? "").toLowerCase();
  const strategy = (clean(input.strategy) ?? "").toLowerCase();

  // Things Funded Capital does not lend on, whatever else the row says.
  if (goal === "heloc" || strategy.includes("home equity")) {
    return { product: "not_our_product", confident: true };
  }
  if (loanType.includes("conventional")) {
    return { product: "not_our_product", confident: true };
  }

  if (strategy.includes("fix and flip")) return { product: "fix_and_flip", confident: true };
  if (strategy.includes("rehab")) return { product: "fix_and_flip", confident: true };
  if (strategy.includes("long-term rental")) return { product: "dscr", confident: true };
  if (strategy.includes("refinance an investment")) return { product: "dscr", confident: true };
  if (strategy.includes("bridge loan")) return { product: "bridge", confident: true };

  if (loanType.includes("dscr")) return { product: "dscr", confident: true };
  if (loanType.includes("new construction") || loanType.includes("ground")) {
    return { product: "ground_up", confident: true };
  }
  if (loanType.includes("fix") && loanType.includes("bridge")) {
    // "Fix & flip or bridge loans" — the goal breaks the tie.
    if (goal.includes("flip")) return { product: "fix_and_flip", confident: true };
    if (goal.includes("purchase") || goal.includes("brrrr")) return { product: "fix_and_flip", confident: false };
    return { product: "bridge", confident: false };
  }
  if (loanType.includes("fix")) return { product: "fix_and_flip", confident: true };
  if (loanType.includes("rental")) return { product: "dscr", confident: true };
  if (loanType.includes("multifamily")) return { product: "multifamily", confident: true };
  if (loanType === "multiple") return { product: "multiple", confident: true };

  if (goal.includes("rental")) return { product: "dscr", confident: false };
  if (goal.includes("flip")) return { product: "fix_and_flip", confident: false };

  return { product: "unknown", confident: false };
}

/**
 * Legacy pipeline strings -> the real stage enum.
 *
 * The old sheet drifted into overlapping values: "Qualified" AND "Qualifying",
 * plus "New Lead" / "Contacted" / "Cold" which all mean "not yet qualified".
 * They collapse to `lead`; the original string is preserved on the
 * stage_transitions row so nothing about the history is lost.
 */
const STAGE: Record<string, Stage> = {
  "new lead": "lead",
  "lead": "lead",
  "contacted": "lead",
  "cold": "lead",
  "qualifying": "lead",
  "qualified": "qualified",
  "term sheet issued": "term_sheet_issued",
  "term sheet signed": "term_sheet_signed",
  "application sent": "application_in",
  "application in": "application_in",
  "underwriting": "underwriting",
  "conditional approval": "conditional_approval",
  "clear to close": "clear_to_close",
  "funded": "funded",
  "closed-lost": "closed_lost",
  "closed lost": "closed_lost",
  "lost": "closed_lost",
};

export function mapStage(v: unknown): { stage: Stage; original: string | null; mapped: boolean } {
  const s = clean(v);
  if (s === null) return { stage: "lead", original: null, mapped: false };
  const hit = STAGE[s.toLowerCase()];
  return { stage: hit ?? "lead", original: s, mapped: hit !== undefined };
}

/* ------------------------------------------------------- leverage ratios */

/**
 * All three ratios computed together, with the binding one named. The binding
 * constraint is whichever is most conservative — that is the number that decides
 * the deal, and storing only one of the three loses that.
 */
export function leverage(input: {
  loanAmount?: number | null; purchasePrice?: number | null;
  rehabBudget?: number | null; arv?: number | null; asIsValue?: number | null;
}): { ltc: number | null; ltarv: number | null; ltv: number | null; binding: string | null } {
  const loan = input.loanAmount ?? null;
  if (!loan || loan <= 0) return { ltc: null, ltarv: null, ltv: null, binding: null };

  const cost = (input.purchasePrice ?? 0) + (input.rehabBudget ?? 0);
  const ltc = cost > 0 ? loan / cost : null;
  const ltarv = input.arv && input.arv > 0 ? loan / input.arv : null;
  const ltv = input.asIsValue && input.asIsValue > 0 ? loan / input.asIsValue : null;

  const candidates: [string, number][] = [];
  if (ltc !== null) candidates.push(["ltc", ltc]);
  if (ltarv !== null) candidates.push(["ltarv", ltarv]);
  if (ltv !== null) candidates.push(["ltv", ltv]);
  if (candidates.length === 0) return { ltc, ltarv, ltv, binding: null };

  // Highest ratio is the tightest against its cap, so it is the one that binds.
  const binding = candidates.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  return { ltc, ltarv, ltv, binding };
}

/* ------------------------------------------------------------ row shapes */

export interface ContactRow {
  legacyContactId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  phoneRaw: string | null;
  leadSource: LeadSource;
  targetMarket: string | null;
  state: string | null;
  creditBand: string | null;
  ownerName: string | null;
  tags: string[];
  notes: string | null;
  createdAt: Date | null;
}

export interface RowIssue { row: number; field: string; value: string; note: string }

/** Master Contacts sheet -> a contacts row, collecting issues rather than throwing. */
export function buildContact(
  raw: Record<string, unknown>, rowNumber: number, issues: RowIssue[],
): ContactRow {
  const email = clean(raw["Email"])?.toLowerCase() ?? null;
  if (!email) issues.push({ row: rowNumber, field: "Email", value: "", note: "no email — contact kept, cannot sync to Klaviyo" });

  const phoneResult = normalisePhone(clean(raw["Phone"]) ?? "");
  if (!phoneResult.ok && phoneResult.raw) {
    issues.push({ row: rowNumber, field: "Phone", value: phoneResult.raw, note: phoneResult.reason });
  }

  const { market, state } = parseMarket(raw["Target State/Market"]);
  const leadSource = mapLeadSource(raw["Lead Source"]);

  return {
    legacyContactId: clean(raw["Contact ID"]),
    firstName: clean(raw["First Name"]),
    lastName: clean(raw["Last Name"]),
    email,
    phone: phoneResult.ok ? phoneResult.e164 : null,
    phoneRaw: phoneResult.ok ? null : (phoneResult.raw || null),
    leadSource,
    targetMarket: market,
    state,
    creditBand: null,
    ownerName: clean(raw["Assigned To"]),
    tags: parseTags(raw["Tags"]),
    notes: clean(raw["Notes"]),
    createdAt: parseDate(raw["Date Added"]),
  };
}
