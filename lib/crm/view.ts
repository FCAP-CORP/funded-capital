/**
 * Presentation logic for the CRM grid.
 *
 * Pure functions only — no React, no database — so lib/crm/view.regress.ts can
 * cover the parts that quietly go wrong: money formatting, date maths across
 * month boundaries, sorting columns that hold nulls, and the search that has to
 * match a phone number however the person types it.
 */

export const STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualified",
  term_sheet_issued: "Term Sheet Issued",
  term_sheet_signed: "Term Sheet Signed",
  application_in: "Application In",
  underwriting: "Underwriting",
  conditional_approval: "Conditional Approval",
  conditions_clearing: "Conditions Clearing",
  clear_to_close: "Clear to Close",
  docs_out: "Docs Out",
  funded: "Funded",
  active: "Active",
  draw_cycle: "Draw Cycle",
  payoff: "Paid Off",
  extension: "Extended",
  closed_lost: "Closed — Lost",
};

/** Display order = pipeline order. Object key order is not a contract. */
export const STAGE_ORDER: string[] = [
  "lead", "qualified", "term_sheet_issued", "term_sheet_signed",
  "application_in", "underwriting", "conditional_approval", "conditions_clearing",
  "clear_to_close", "docs_out", "funded",
  "active", "draw_cycle", "payoff", "extension", "closed_lost",
];

/** Stages whose entry is a measurable conversion event. */
export const GATE_STAGES = new Set([
  "term_sheet_issued", "term_sheet_signed", "conditional_approval",
  "clear_to_close", "funded",
]);

/**
 * The colour family a status pill uses (components/ui/badge.tsx draws it).
 * A word, not a class, so this file stays free of styling and testable.
 */
export type Tone = "neutral" | "navy" | "gold" | "info" | "success" | "warning" | "danger" | "muted";

/**
 * One tone per stage, in five groups a glance can separate:
 *
 *   neutral  — not yet a deal (lead, qualified)
 *   gold     — the conversion gate: a term sheet is out or signed. Same gold
 *              the dashboard's stage chart uses for the same two stages.
 *   info     — in process: application through docs out
 *   success  — won: funded and every servicing stage while the loan performs
 *   muted    — finished without incident (paid off)
 *   danger   — closed, lost
 *
 * Every stage in STAGE_ORDER has an entry; view.regress.ts fails if one is
 * added without one, the same way schema-sync.regress.ts guards the labels.
 */
export const STAGE_TONE: Record<string, Tone> = {
  lead: "neutral",
  qualified: "neutral",
  term_sheet_issued: "gold",
  term_sheet_signed: "gold",
  application_in: "info",
  underwriting: "info",
  conditional_approval: "info",
  conditions_clearing: "info",
  clear_to_close: "info",
  docs_out: "info",
  funded: "success",
  active: "success",
  draw_cycle: "success",
  extension: "warning",
  payoff: "muted",
  closed_lost: "danger",
};

/** An unknown stage is shown, neutral, rather than hidden or coloured as something it is not. */
export function stageTone(stage: string | null | undefined): Tone {
  return (stage && STAGE_TONE[stage]) || "neutral";
}

export const PRODUCT_LABEL: Record<string, string> = {
  fix_and_flip: "Fix & Flip",
  ground_up: "Ground-Up",
  dscr: "DSCR",
  bridge: "Bridge",
  multifamily: "Multifamily",
  multiple: "Multiple",
  not_our_product: "Not our product",
  unknown: "—",
};

export const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  biggerpockets: "BiggerPockets",
  referral: "Referral",
  broker: "Broker",
  linkedin: "LinkedIn",
  cold_email: "Cold Email",
  reia: "REIA",
  wholesale: "Wholesale",
  other: "Other",
  unknown: "—",
};

/**
 * Broker portal roles, as Luis sees them in the firm management screen.
 *
 * The wording matters more than usual here, because this dropdown is where a
 * brokerage's principal is granted sight of their colleagues' borrowers. "Team
 * lead — sees the whole firm" has to say what it does at the moment of choosing,
 * not in a tooltip nobody opens.
 */
export const BROKER_ROLE_LABEL: Record<string, string> = {
  owner: "Firm owner — sees every deal at the firm",
  lead: "Team lead — sees every deal at the firm",
  member: "Broker — sees only their own deals",
};

/** Short form, for a table cell where the explanation does not fit. */
export const BROKER_ROLE_SHORT: Record<string, string> = {
  owner: "Owner",
  lead: "Team lead",
  member: "Broker",
};

export const BROKER_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
};

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key] ?? key;
}

/** Whole dollars, thousands-separated. Null and 0 are different things. */
export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** A ratio stored as 0.9000 reads as 90.0%. */
export function percent(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(1) + "%";
}

export function shortDate(v: Date | string | null | undefined): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Whole days elapsed, counted on UTC calendar days so a deal does not appear to
 * age by one when the clock crosses midnight in a different timezone.
 */
export function daysSince(v: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

export function ageLabel(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/** Digits only, so "(305) 555-0101", "305-555-0101" and "+13055550101" all match. */
export function phoneDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function fullName(first: string | null | undefined, last: string | null | undefined): string {
  const n = [first, last].filter(Boolean).join(" ").trim();
  return n || "(no name)";
}

/**
 * Free-text search across chosen fields.
 *
 * A query of digits also matches phone numbers with their formatting stripped,
 * because nobody searching for a caller types the number the way it is stored.
 */
export function matchesSearch<T extends Record<string, unknown>>(
  row: T, query: string, fields: (keyof T)[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, "");

  for (const f of fields) {
    const raw = row[f];
    if (raw === null || raw === undefined) continue;
    const s = String(raw).toLowerCase();
    if (s.includes(q)) return true;
    if (qDigits.length >= 3) {
      const d = s.replace(/\D/g, "");
      if (d && d.includes(qDigits)) return true;
    }
  }
  return false;
}

export type SortDir = "asc" | "desc";

/**
 * Sort that puts empty values LAST in both directions.
 *
 * Nulls sorting to the top of a descending column is the classic grid bug: you
 * sort by loan amount to find the biggest deal and get a screen of blanks.
 */
export function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const an = typeof a === "number" ? a : Number(a);
  const bn = typeof b === "number" ? b : Number(b);
  const numeric = Number.isFinite(an) && Number.isFinite(bn)
    && !(typeof a === "string" && a.trim() === "")
    && !(typeof b === "string" && b.trim() === "");

  let cmp: number;
  if (numeric) cmp = an - bn;
  else if (a instanceof Date && b instanceof Date) cmp = a.getTime() - b.getTime();
  else cmp = String(a).localeCompare(String(b), "en", { sensitivity: "base" });

  return dir === "asc" ? cmp : -cmp;
}

export function sortRows<T extends Record<string, unknown>>(
  rows: T[], key: keyof T | null, dir: SortDir,
): T[] {
  if (!key) return rows;
  // Copy first — sorting props in place makes React miss the change.
  return [...rows].sort((x, y) => compareValues(x[key], y[key], dir));
}

/** Counts per facet value, for filter chips that show how many they'd show. */
export function facetCounts<T extends Record<string, unknown>>(
  rows: T[], key: keyof T,
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r[key] === null || r[key] === undefined || r[key] === "" ? "unknown" : String(r[key]);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
