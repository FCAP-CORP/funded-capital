/**
 * Pure logic for the CRM tables (Pipeline and Contacts): CSV export, saved
 * views, bulk stage moves and column sizing.
 *
 * No React, no database, no browser APIs — every rule here is pinned by
 * lib/crm/tableView.regress.ts. The table components (app/crm/DataTable.tsx)
 * only render what this module decides.
 */

import { STAGE_LABEL } from "./view";
import { dropIntent } from "./board";

/* ====================================================================== CSV */

/**
 * A cell that a spreadsheet would treat as a formula.
 *
 * CSV INJECTION IS REAL HERE: every field in these tables can be typed by a
 * stranger — a borrower's name and message come straight from the website
 * form. A "name" of `=HYPERLINK("http://evil","Click")` or `=cmd|' /C calc'!A0`
 * exported to CSV and opened in Excel is a live formula on Luis's machine.
 * OWASP's rule: a cell starting with = + - @ (or a tab / carriage return, which
 * Excel skips before looking) is prefixed with a single quote, which makes the
 * spreadsheet show it as text.
 *
 * Only STRINGS are guarded. A real number (typeof "number") is written as-is,
 * so a negative amount stays a number; the tables export amounts as numbers
 * and phone numbers in "(305) 555-0101" form for exactly this reason.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = "'" + s;
  // RFC 4180: quote when the cell holds a quote, a comma or a line break, and
  // double any quote inside it.
  if (/[",\r\n]/.test(s) || s !== s.trim()) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * A whole CSV document. CRLF line endings (RFC 4180, and what Excel expects).
 * The UTF-8 byte-order mark is added by the caller at download time, not here,
 * so this function's output stays plain text for the tests.
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** "pipeline-2026-09-24.csv", dated on the New York calendar like the rest of the CRM. */
export function csvFileName(base: string, now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${safe}-${day}.csv`;
}

/* ============================================================ saved views */

export type SortState = { key: string; dir: "asc" | "desc" } | null;

/** Everything about how a table is being looked at — and nothing about its data. */
export type TableViewState = {
  query: string;
  facet: string | null;
  sort: SortState;
  hidden: string[];
  sizes: Record<string, number>;
  pageSize: number;
};

export type SavedView = { name: string; state: TableViewState };

/** What the table knows about itself, so a stored view can be checked against it. */
export type TableShape = {
  columns: string[];
  sortable: string[];
  /** Columns that may never be hidden (the name — the row would be unidentifiable). */
  locked?: string[];
  defaultSort: SortState;
  defaultPageSize?: number;
};

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;
export const VIEW_NAME_MAX = 40;
export const MAX_SAVED_VIEWS = 20;
export const QUERY_MAX = 200;
export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 640;

export function defaultViewState(shape: TableShape): TableViewState {
  return {
    query: "",
    facet: null,
    sort: shape.defaultSort,
    hidden: [],
    sizes: {},
    pageSize: shape.defaultPageSize ?? DEFAULT_PAGE_SIZE,
  };
}

export function clampWidth(px: unknown): number | null {
  const n = typeof px === "number" ? px : Number(px);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, n)));
}

/**
 * Turn whatever came out of localStorage into a state the table can use.
 *
 * NEVER THROWS, AND NEVER TRUSTS IT. localStorage is written by an older build
 * of this page, by a browser extension, or by hand in the console. A column
 * that has since been renamed or removed is dropped rather than breaking the
 * table; a page size of 10,000 falls back to the default; a locked column
 * cannot be hidden; a sort on a column that no longer sorts is ignored.
 */
export function normaliseViewState(raw: unknown, shape: TableShape): TableViewState {
  const base = defaultViewState(shape);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const known = new Set(shape.columns);
  const locked = new Set(shape.locked ?? []);

  const query = typeof r.query === "string" ? r.query.slice(0, QUERY_MAX) : base.query;
  const facet = typeof r.facet === "string" && r.facet.length <= 64 ? r.facet : null;

  let sort: SortState = base.sort;
  if (r.sort === null) sort = null;
  else if (r.sort && typeof r.sort === "object") {
    const s = r.sort as Record<string, unknown>;
    if (typeof s.key === "string" && shape.sortable.includes(s.key) && (s.dir === "asc" || s.dir === "desc")) {
      sort = { key: s.key, dir: s.dir };
    }
  }

  const hidden = Array.isArray(r.hidden)
    ? [...new Set(r.hidden.filter((c): c is string => typeof c === "string" && known.has(c) && !locked.has(c)))]
    : base.hidden;

  const sizes: Record<string, number> = {};
  if (r.sizes && typeof r.sizes === "object" && !Array.isArray(r.sizes)) {
    for (const [k, v] of Object.entries(r.sizes as Record<string, unknown>)) {
      const w = clampWidth(v);
      if (known.has(k) && w !== null) sizes[k] = w;
    }
  }

  const pageSize = (PAGE_SIZES as readonly number[]).includes(Number(r.pageSize)) ? Number(r.pageSize) : base.pageSize;

  return { query, facet, sort, hidden, sizes, pageSize };
}

export type ParsedName = { ok: true; value: string } | { ok: false; error: string };

/** A view's name: 1–40 characters after trimming, inner whitespace collapsed. */
export function parseViewName(raw: unknown): ParsedName {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!s) return { ok: false, error: "Give the view a name." };
  if (s.length > VIEW_NAME_MAX) return { ok: false, error: `Keep the name under ${VIEW_NAME_MAX} characters.` };
  return { ok: true, value: s };
}

/** Versioned, so a future shape change can be recognised instead of misread. */
export function serialiseViews(views: SavedView[]): string {
  return JSON.stringify({ v: 1, views });
}

/** Read stored views. Junk in, an empty list out — never an exception. */
export function parseViews(raw: string | null | undefined, shape: TableShape): SavedView[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object" || (data as { v?: unknown }).v !== 1) return [];
  const list = (data as { views?: unknown }).views;
  if (!Array.isArray(list)) return [];
  const out: SavedView[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const name = parseViewName((item as { name?: unknown }).name);
    if (!name.ok || seen.has(name.value.toLowerCase())) continue;
    seen.add(name.value.toLowerCase());
    out.push({ name: name.value, state: normaliseViewState((item as { state?: unknown }).state, shape) });
    if (out.length >= MAX_SAVED_VIEWS) break;
  }
  return out;
}

/** Add a view, replacing one of the same name (case-insensitive), newest first, capped. */
export function upsertView(views: SavedView[], view: SavedView): SavedView[] {
  const key = view.name.toLowerCase();
  return [view, ...views.filter((v) => v.name.toLowerCase() !== key)].slice(0, MAX_SAVED_VIEWS);
}

export function removeView(views: SavedView[], name: string): SavedView[] {
  const key = name.toLowerCase();
  return views.filter((v) => v.name.toLowerCase() !== key);
}

/** Does the table currently look exactly like this saved view? (Lights it in the menu.) */
export function sameViewState(a: TableViewState, b: TableViewState): boolean {
  const sortEq = a.sort === b.sort || (!!a.sort && !!b.sort && a.sort.key === b.sort.key && a.sort.dir === b.sort.dir);
  const hidA = [...a.hidden].sort().join("|");
  const hidB = [...b.hidden].sort().join("|");
  return a.query === b.query && a.facet === b.facet && sortEq && hidA === hidB && a.pageSize === b.pageSize;
}

/* ============================================================== bulk move */

/**
 * The most deals one bulk move will touch.
 *
 * Each move goes through the same `setStage` (or `markLost`) server action as a
 * single edit — one stage_transitions row per deal, written the one way stage
 * changes are ever written — and each action re-renders the Pipeline page in
 * its response. Fifty is a few seconds of that; five hundred would be a
 * minute of a spinner and five hundred page renders. A genuine batch action
 * belongs in app/crm/actions.ts when the bulk move proves itself.
 */
export const BULK_MOVE_MAX = 50;

export type BulkRow = { id: string; stage: string; name?: string };

export type BulkPlan =
  | { kind: "invalid"; error: string }
  | { kind: "nothing"; skipped: number }
  | {
      kind: "ready";
      to: string;
      ids: string[];
      /** Already in the target stage — no phantom history rows for them. */
      skipped: number;
      /** The same questions the board asks, asked once for the whole batch. */
      ask: "none" | "confirm_funded" | "needs_reason";
    };

/**
 * What moving these deals to `to` means.
 *
 * THE BOARD'S RULES, NOT NEW ONES. Each row is classified by `dropIntent` from
 * lib/crm/board.ts: a deal already there is a no-op and is skipped; a move to
 * Funded must be confirmed; a move to Closed – Lost needs a reason (and goes
 * through `markLost`, which records it). One difference from the board, and
 * it is the table's existing behaviour: the board has no column for the
 * servicing stages (Active, Draw Cycle, Extended, Paid Off) so dropIntent
 * calls them "invalid" — the table's stage dropdown has always offered every
 * stage, so any stage with a label is a valid target here.
 */
export function planBulkMove(rows: BulkRow[], to: string): BulkPlan {
  if (!(to in STAGE_LABEL)) return { kind: "invalid", error: "Pick a stage to move them to." };
  if (rows.length === 0) return { kind: "invalid", error: "Select at least one deal." };

  const ids: string[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    if (dropIntent(r.stage, to).kind === "noop") skipped++;
    else ids.push(r.id);
  }
  if (ids.length === 0) return { kind: "nothing", skipped };
  if (ids.length > BULK_MOVE_MAX) {
    return {
      kind: "invalid",
      error: `That is ${ids.length} deals. Move at most ${BULK_MOVE_MAX} at a time — each one writes its own history row.`,
    };
  }
  const intent = dropIntent("__bulk__", to).kind;
  const ask = intent === "confirm_funded" ? "confirm_funded" : intent === "needs_reason" ? "needs_reason" : "none";
  return { kind: "ready", to, ids, skipped, ask };
}

export type BulkFailure = { name: string; error: string };

/** The one line of feedback after a bulk move, and its detail. */
export function bulkMoveSummary(
  to: string, moved: number, skipped: number, failures: BulkFailure[],
): { tone: "success" | "error"; title: string; description?: string } {
  const stage = STAGE_LABEL[to] ?? to;
  const deals = (n: number) => `${n} ${n === 1 ? "deal" : "deals"}`;
  const skippedLine = skipped > 0 ? `${deals(skipped)} already in ${stage}, left as they were.` : "";
  if (failures.length === 0) {
    return {
      tone: "success",
      title: `Moved ${deals(moved)} to ${stage}`,
      description: skippedLine || undefined,
    };
  }
  const shown = failures.slice(0, 5).map((f) => `${f.name}: ${f.error}`);
  if (failures.length > 5) shown.push(`…and ${failures.length - 5} more`);
  return {
    tone: "error",
    title: moved > 0
      ? `Moved ${deals(moved)} to ${stage}; ${failures.length} not moved`
      : `${deals(failures.length)} not moved to ${stage}`,
    description: [shown.join("\n"), skippedLine].filter(Boolean).join("\n"),
  };
}

/* ============================================================== paging */

/** "1–50 of 712", "0 of 0". */
export function pageRangeLabel(pageIndex: number, pageSize: number, total: number): string {
  if (total <= 0) return "0 of 0";
  const first = pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);
  return `${first.toLocaleString("en-US")}–${last.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
}
