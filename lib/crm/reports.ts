/**
 * /crm/reports — every number on the page, computed here. Pure: no database,
 * no clock except the `now` passed in. Pinned by reports.regress.ts.
 *
 * TWO KINDS OF QUESTION, KEPT APART ON PURPOSE
 *
 *   COHORT questions follow the leads that ARRIVED in the period to wherever
 *   they got: how many were contacted, how fast, how many reached a term sheet.
 *   This is the honest way to judge lead quality and follow-up — a September
 *   lead that converts in November still counts for September.
 *
 *   ACTIVITY questions count what HAPPENED in the period, whenever the lead
 *   arrived: term sheets issued, deals funded, deals lost. This is the honest
 *   way to judge a month's output.
 *
 * Mixing the two (term sheets issued this month ÷ leads that arrived this
 * month) produces a conversion rate that can exceed 100% and means nothing.
 * Every figure below says which kind it is.
 *
 * DATES are New York calendar days, like the dashboard. A lead's arrival is
 * `submittedAt ?? createdAt` — the legacy import stamped created_at with the
 * day it ran, so created_at alone would put the whole historic book into the
 * last 30 days (the same rule as lib/crm/dashboardView.ts).
 *
 * FIRST CONTACT is the first email, text or call to the person on or after
 * the day the lead arrived (the SQL is in reports.server.ts). Calls carry no
 * direction yet, so a call the borrower placed counts too — noted on the page.
 */

import { nyToday } from "./tasks";
import { addDays, mondayOf, nyMidnight, percentages, sourceGroup, SOURCE_GROUPS, type SourceGroup } from "./dashboardView";
import { PRODUCT_LABEL, STAGE_ORDER } from "./view";

/* ------------------------------------------------------------------ input */

export type ReportRow = {
  id: string;
  stage: string;
  leadSource: string;
  product: string;
  submittedAt: string | null;
  createdAt: string | null;
  stageEnteredAt: string | null;
  requestedAmount: string | null;
  /** First outbound email/text/call on or after arrival. */
  firstTouchAt: string | null;
  firstTermSheetAt: string | null;
  firstSignedAt: string | null;
  fundedAt: string | null;
  /** First move into closed_lost (else stage_entered_at when the stage is closed_lost). */
  lostAt: string | null;
  lostReason: string | null;
};

const t = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const v = Date.parse(iso);
  return Number.isNaN(v) ? null : v;
};
export const arrival = (r: Pick<ReportRow, "submittedAt" | "createdAt">): number | null => t(r.submittedAt) ?? t(r.createdAt);
const amount = (v: string | null): number => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* ------------------------------------------------------------------ range */

export const RANGES = ["30d", "90d", "ytd", "12m", "all"] as const;
export type RangeKey = (typeof RANGES)[number];
export const DEFAULT_RANGE: RangeKey = "90d";

export const RANGE_LABEL: Record<RangeKey, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  "12m": "Last 12 months",
  all: "All time",
};

export function parseRange(v: unknown): RangeKey {
  const s = Array.isArray(v) ? v[0] : v;
  return (RANGES as readonly string[]).includes(s as string) ? (s as RangeKey) : DEFAULT_RANGE;
}

export type Window = {
  key: RangeKey;
  label: string;
  /** Inclusive start instant (New York midnight), or null for all time. */
  start: number | null;
  end: number;
  /** Bucket size for the trend chart. */
  grain: "week" | "month";
};

export function rangeWindow(key: RangeKey, now: Date): Window {
  const today = nyToday(now);
  const end = now.getTime();
  const days = (n: number) => nyMidnight(addDays(today, -(n - 1))).getTime();
  switch (key) {
    case "30d": return { key, label: RANGE_LABEL[key], start: days(30), end, grain: "week" };
    case "90d": return { key, label: RANGE_LABEL[key], start: days(90), end, grain: "week" };
    case "ytd": return { key, label: RANGE_LABEL[key], start: nyMidnight(`${today.slice(0, 4)}-01-01`).getTime(), end, grain: "month" };
    case "12m": {
      // The first of the month eleven months back, so twelve whole-or-current months show.
      const [y, m] = today.split("-").map(Number);
      const back = new Date(Date.UTC(y, m - 1 - 11, 1));
      const first = `${back.getUTCFullYear()}-${String(back.getUTCMonth() + 1).padStart(2, "0")}-01`;
      return { key, label: RANGE_LABEL[key], start: nyMidnight(first).getTime(), end, grain: "month" };
    }
    default: return { key: "all", label: RANGE_LABEL.all, start: null, end, grain: "month" };
  }
}

const inWindow = (v: number | null, w: Window) => v !== null && v <= w.end && (w.start === null || v >= w.start);

/* ------------------------------------------------------ reached a stage */

const IDX = new Map(STAGE_ORDER.map((s, i) => [s, i]));
const at = (s: string) => IDX.get(s) ?? -1;

/**
 * Did this lead ever reach a stage? Its history when there is one, else its
 * current position — except that a closed_lost deal's position says nothing
 * about how far it got, so only its dated history counts.
 */
export function reached(r: ReportRow, gate: "term_sheet" | "signed" | "funded"): boolean {
  const dated = gate === "term_sheet" ? r.firstTermSheetAt : gate === "signed" ? r.firstSignedAt : r.fundedAt;
  if (t(dated) !== null) return true;
  if (r.stage === "closed_lost") return false;
  const need = gate === "term_sheet" ? at("term_sheet_issued") : gate === "signed" ? at("term_sheet_signed") : at("funded");
  return at(r.stage) >= need;
}

/** Hours from arrival to first contact, or null if never contacted (or no arrival date). */
export function responseHours(r: ReportRow): number | null {
  const a = arrival(r);
  const f = t(r.firstTouchAt);
  if (a === null || f === null) return null;
  return Math.max(0, (f - a) / 3_600_000);
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** "18 min", "3.4 hrs", "2.5 days" — or "—". */
export function durationLabel(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)} hrs`;
  const d = hours / 24;
  return `${d < 10 ? d.toFixed(1).replace(/\.0$/, "") : Math.round(d)} days`;
}

export const pct = (n: number, of: number): number | null => (of > 0 ? Math.round((n / of) * 100) : null);
export const pctLabel = (p: number | null) => (p === null ? "—" : `${p}%`);

/* ------------------------------------------------------------------ KPIs */

export type Kpis = {
  /** COHORT: leads that arrived in the window. */
  leads: number;
  contacted: number;
  contactedPct: number | null;
  within24h: number;
  within24hPct: number | null;
  medianResponseHours: number | null;
  /** COHORT: arrived in the window and have since reached a term sheet. */
  cohortTermSheets: number;
  cohortConversionPct: number | null;
  /** ACTIVITY: first term sheet issued inside the window, whenever the lead arrived. */
  termSheetsIssued: number;
  /** ACTIVITY: funded inside the window. */
  funded: number;
  fundedVolume: number;
};

export function kpis(rows: ReportRow[], w: Window): Kpis {
  const cohort = rows.filter((r) => inWindow(arrival(r), w));
  const hours = cohort.map(responseHours);
  const contacted = hours.filter((h): h is number => h !== null);
  const within24h = contacted.filter((h) => h <= 24).length;
  const cohortTermSheets = cohort.filter((r) => reached(r, "term_sheet")).length;
  const fundedRows = rows.filter((r) => inWindow(t(r.fundedAt), w));
  return {
    leads: cohort.length,
    contacted: contacted.length,
    contactedPct: pct(contacted.length, cohort.length),
    within24h,
    within24hPct: pct(within24h, cohort.length),
    medianResponseHours: median(contacted),
    cohortTermSheets,
    cohortConversionPct: pct(cohortTermSheets, cohort.length),
    termSheetsIssued: rows.filter((r) => inWindow(t(r.firstTermSheetAt), w)).length,
    funded: fundedRows.length,
    fundedVolume: fundedRows.reduce((s, r) => s + amount(r.requestedAmount), 0),
  };
}

/* ----------------------------------------------------------------- trend */

export type TrendBucket = {
  key: string;
  /** Axis label: "Sep 21" or "Sep". */
  label: string;
  /** Full label for the table and tooltip: "Sep 21 – Sep 27" or "September 2026". */
  range: string;
  bySource: Record<SourceGroup, number>;
  total: number;
  partial: boolean;
};

const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const MON = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const dayDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const monthOf = (day: string) => `${day.slice(0, 7)}-01`;
const nextMonth = (first: string) => {
  const [y, m] = first.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 1));
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

/** How many months "all time" may show before older months fold into the first bar. */
export const MAX_MONTHS = 24;

/**
 * New leads per week (Monday–Sunday) or per month, split by source, over the
 * window. Bucketed by New York calendar day so a daylight-saving week is not
 * an hour short. "All time" starts at the earliest arrival, capped at
 * MAX_MONTHS; anything older is counted in the first bar and the page says so.
 */
export function trend(rows: ReportRow[], w: Window, now: Date): { buckets: TrendBucket[]; foldedBefore: string | null } {
  const today = nyToday(now);
  const empty = (): Record<SourceGroup, number> => Object.fromEntries(SOURCE_GROUPS.map((g) => [g, 0])) as Record<SourceGroup, number>;
  const buckets: TrendBucket[] = [];
  const index = new Map<string, TrendBucket>();
  let foldedBefore: string | null = null;

  if (w.grain === "week") {
    const first = mondayOf(nyToday(new Date(w.start ?? now.getTime())));
    for (let d = first; d <= today; d = addDays(d, 7)) {
      const b: TrendBucket = {
        key: d,
        label: SHORT.format(dayDate(d)),
        range: `${SHORT.format(dayDate(d))} – ${SHORT.format(dayDate(addDays(d, 6)))}`,
        bySource: empty(),
        total: 0,
        partial: addDays(d, 6) >= today,
      };
      buckets.push(b);
      index.set(d, b);
    }
  } else {
    let first: string;
    if (w.start !== null) first = monthOf(nyToday(new Date(w.start)));
    else {
      const earliest = rows.map(arrival).filter((v): v is number => v !== null && v <= w.end).sort((a, b) => a - b)[0];
      first = monthOf(earliest !== undefined ? nyToday(new Date(earliest)) : today);
    }
    const months: string[] = [];
    for (let m = first; m <= monthOf(today); m = nextMonth(m)) months.push(m);
    if (months.length > MAX_MONTHS) {
      foldedBefore = months[months.length - MAX_MONTHS];
      months.splice(0, months.length - MAX_MONTHS);
    }
    for (const m of months) {
      const d = dayDate(m);
      const b: TrendBucket = {
        key: m,
        label: MON.format(d) + (m.endsWith("-01-01") || m === months[0] ? ` '${m.slice(2, 4)}` : ""),
        range: MONTH_YEAR.format(d),
        bySource: empty(),
        total: 0,
        partial: m === monthOf(today),
      };
      buckets.push(b);
      index.set(m, b);
    }
  }

  for (const r of rows) {
    const a = arrival(r);
    if (!inWindow(a, w)) continue;
    const day = nyToday(new Date(a!));
    let key = w.grain === "week" ? mondayOf(day) : monthOf(day);
    if (w.grain === "month" && foldedBefore && key < foldedBefore) key = buckets[0].key;
    const b = index.get(key);
    if (!b) continue;
    const g = sourceGroup(r.leadSource);
    b.bySource[g]++;
    b.total++;
  }
  return { buckets, foldedBefore };
}

/** A clean axis maximum (1, 2, 5, 10, 20, 25, 50…) at or above the tallest bar. */
export function niceMax(v: number): number {
  if (v <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/* ---------------------------------------------------------------- funnel */

export type FunnelStep = { key: string; label: string; count: number; pctOfLeads: number | null; pctOfPrev: number | null };

/** COHORT funnel: of the leads that arrived in the window, how far did they get? */
export function funnel(rows: ReportRow[], w: Window): FunnelStep[] {
  const cohort = rows.filter((r) => inWindow(arrival(r), w));
  const counts: [string, string, number][] = [
    ["leads", "New leads", cohort.length],
    ["contacted", "Contacted", cohort.filter((r) => responseHours(r) !== null).length],
    ["term_sheet", "Term sheet issued", cohort.filter((r) => reached(r, "term_sheet")).length],
    ["signed", "Term sheet signed", cohort.filter((r) => reached(r, "signed")).length],
    ["funded", "Funded", cohort.filter((r) => reached(r, "funded")).length],
  ];
  return counts.map(([key, label, count], i) => ({
    key,
    label,
    count,
    pctOfLeads: pct(count, cohort.length),
    pctOfPrev: i === 0 ? null : pct(count, counts[i - 1][2]),
  }));
}

/* -------------------------------------------------------------- by source */

export type SourceRow = {
  key: SourceGroup;
  label: string;
  leads: number;
  contactedPct: number | null;
  medianResponseHours: number | null;
  termSheets: number;
  funded: number;
  conversionPct: number | null;
};

export const SOURCE_LABEL_SHORT: Record<SourceGroup, string> = {
  website: "Website",
  biggerpockets: "BiggerPockets",
  broker: "Brokers",
  other: "Other",
};

/** COHORT, split by where the lead came from. */
export function bySource(rows: ReportRow[], w: Window): SourceRow[] {
  const cohort = rows.filter((r) => inWindow(arrival(r), w));
  return SOURCE_GROUPS.map((g) => {
    const mine = cohort.filter((r) => sourceGroup(r.leadSource) === g);
    const hours = mine.map(responseHours).filter((h): h is number => h !== null);
    const ts = mine.filter((r) => reached(r, "term_sheet")).length;
    return {
      key: g,
      label: SOURCE_LABEL_SHORT[g],
      leads: mine.length,
      contactedPct: pct(hours.length, mine.length),
      medianResponseHours: median(hours),
      termSheets: ts,
      funded: mine.filter((r) => reached(r, "funded")).length,
      conversionPct: pct(ts, mine.length),
    };
  });
}

/* --------------------------------------------------------- speed to lead */

export const SPEED_BUCKETS = [
  { key: "1h", label: "Under 1 hour", max: 1 },
  { key: "24h", label: "1 to 24 hours", max: 24 },
  { key: "3d", label: "1 to 3 days", max: 72 },
  { key: "7d", label: "3 to 7 days", max: 168 },
  { key: "later", label: "Over 7 days", max: Infinity },
] as const;

export type SpeedRow = { key: string; label: string; count: number; pct: number; never: boolean };

/** COHORT: how long each lead waited for the first email, text or call. */
export function speedToLead(rows: ReportRow[], w: Window): SpeedRow[] {
  const cohort = rows.filter((r) => inWindow(arrival(r), w));
  const counts = SPEED_BUCKETS.map(() => 0);
  let never = 0;
  for (const r of cohort) {
    const h = responseHours(r);
    if (h === null) { never++; continue; }
    counts[SPEED_BUCKETS.findIndex((b) => h <= b.max)]++;
  }
  const all = [...counts, never];
  const pcts = percentages(all);
  return [
    ...SPEED_BUCKETS.map((b, i) => ({ key: b.key, label: b.label, count: counts[i], pct: pcts[i], never: false })),
    { key: "never", label: "Not contacted yet", count: never, pct: pcts[pcts.length - 1], never: true },
  ];
}

/* ------------------------------------------------------------ by product */

export type ProductRow = { key: string; label: string; leads: number; requested: number; termSheets: number };

/** COHORT by loan type, largest first; unknown and not-our-product last. */
export function byProduct(rows: ReportRow[], w: Window): ProductRow[] {
  const cohort = rows.filter((r) => inWindow(arrival(r), w));
  const map = new Map<string, ProductRow>();
  for (const r of cohort) {
    const k = r.product || "unknown";
    const row = map.get(k) ?? { key: k, label: k === "unknown" ? "Not stated" : PRODUCT_LABEL[k] ?? k, leads: 0, requested: 0, termSheets: 0 };
    row.leads++;
    row.requested += amount(r.requestedAmount);
    if (reached(r, "term_sheet")) row.termSheets++;
    map.set(k, row);
  }
  const tail = new Set(["unknown", "not_our_product"]);
  return [...map.values()].sort((a, b) => Number(tail.has(a.key)) - Number(tail.has(b.key)) || b.leads - a.leads || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------ lost deals */

export type LostRow = { reason: string; count: number };

/** How many distinct reasons to show before folding the rest into "Other reasons". */
export const LOST_REASONS_SHOWN = 6;

/**
 * ACTIVITY: deals closed as lost inside the window, by reason. A lost reason
 * is stored as "Choice" or "Choice: detail"; only the choice is grouped, so
 * "Went with another lender: Kiavi" and "…: Lima One" count together.
 */
export function lostReasons(rows: ReportRow[], w: Window): { total: number; rows: LostRow[] } {
  const lost = rows.filter((r) => r.stage === "closed_lost" && inWindow(t(r.lostAt), w));
  const map = new Map<string, number>();
  for (const r of lost) {
    const reason = (r.lostReason ?? "").split(":")[0].trim() || "No reason recorded";
    map.set(reason, (map.get(reason) ?? 0) + 1);
  }
  const sorted = [...map.entries()]
    .sort((a, b) => Number(a[0] === "No reason recorded") - Number(b[0] === "No reason recorded") || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, count }));
  if (sorted.length > LOST_REASONS_SHOWN) {
    const keep = sorted.slice(0, LOST_REASONS_SHOWN - 1);
    const rest = sorted.slice(LOST_REASONS_SHOWN - 1).reduce((s, r) => s + r.count, 0);
    return { total: lost.length, rows: [...keep, { reason: "Other reasons", count: rest }] };
  }
  return { total: lost.length, rows: sorted };
}

/* -------------------------------------------------------------- the page */

export type ReportsModel = {
  window: Window;
  kpis: Kpis;
  trend: { buckets: TrendBucket[]; foldedBefore: string | null };
  funnel: FunnelStep[];
  sources: SourceRow[];
  speed: SpeedRow[];
  products: ProductRow[];
  lost: { total: number; rows: LostRow[] };
};

export function buildReports(rows: ReportRow[], range: RangeKey, now: Date): ReportsModel {
  const w = rangeWindow(range, now);
  return {
    window: w,
    kpis: kpis(rows, w),
    trend: trend(rows, w, now),
    funnel: funnel(rows, w),
    sources: bySource(rows, w),
    speed: speedToLead(rows, w),
    products: byProduct(rows, w),
    lost: lostReasons(rows, w),
  };
}
