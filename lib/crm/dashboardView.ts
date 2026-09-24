/**
 * Everything the dashboard computes before it draws: the greeting, the date
 * line, the four numbers, the queue tabs, the task list, the stage bars, the
 * lead-source mix and the twelve-week trend.
 *
 * PURE. No database, no React, no clock of its own — `now` is always a
 * parameter — so lib/crm/dashboardView.regress.ts can pin every decision here,
 * including the ones that only go wrong twice a year (a daylight-saving week)
 * or once a month (the 31st, when last month had 30 days).
 *
 * ONE CALENDAR: NEW YORK. The server renders in UTC and the laptop can be
 * anywhere; Luis works on Eastern time. "This month", "this week", "today" and
 * "good morning" are all decided on the America/New_York calendar by name, the
 * same business timezone lib/crm/followup.ts counts snoozes in and
 * lib/crm/tasks.ts counts due dates in. A month boundary taken in UTC puts
 * every application filed after 8pm on the 31st into the wrong month.
 *
 * NOTHING IS INVENTED. Where a number cannot be computed honestly — a
 * month-on-month comparison when the book does not reach back that far, a
 * funded total when no funded date has ever been recorded — the function
 * returns null or says so, and the page shows the sentence instead of a zero
 * that reads like a bad month.
 */

import { BUSINESS_TIMEZONE } from "./followup";
import { dayDiff, isIsoDay, nyToday } from "./tasks";
import { BOARD_STAGES } from "./board";
import { STAGE_LABEL, ageLabel, label as labelOf, money } from "./view";
import {
  QUEUE_DEFAULTS,
  REASON_LABEL,
  buildWorkQueue,
  isOpen,
  needsWork,
  snoozedItems,
  snoozesBrokenByInbound,
  type DashboardApplication,
  type QueueReason,
  type SnoozedItem,
} from "./dashboard";
import { putDownHeading, queueRows, type QueueRowView } from "./queueView";

/* ------------------------------------------------------------------ input */

/**
 * One application as the dashboard page reads it: the work-queue fields, plus
 * the two things only the charts need.
 *
 * Kept as an extension rather than widening DashboardApplication, whose
 * narrowness is deliberate (see its comment in dashboard.ts).
 */
export type DashboardRow = DashboardApplication & {
  leadSource: string;
  /**
   * When a term sheet first went out: COALESCE(the first stage_transitions row
   * into 'term_sheet_issued', applications.term_sheet_issued_at). Same
   * reasoning as fundedAt — moves made in the CRM write a transition, legacy
   * rows may carry only the column, and preferring one silently undercounts the
   * other half.
   */
  firstTermSheetAt: string | null;
};

/** An open task due today or earlier, as the server reads it. */
export type DueTaskInput = {
  id: string;
  title: string;
  /** "YYYY-MM-DD", a New York calendar day. */
  dueOn: string | null;
  applicationId: string;
  borrower: string;
};

const time = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

const amount = (v: string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** When it arrived: submitted, or created when no submission date exists. Same rule as computeKpis. */
const arrivedAt = (a: Pick<DashboardApplication, "submittedAt" | "createdAt">): number | null =>
  time(a.submittedAt) ?? time(a.createdAt);

const plural = (n: number, one: string, many: string = one + "s") => (n === 1 ? one : many);

/* ------------------------------------------------------ New York calendar */

const NY_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

export type NyClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The New York wall clock at an instant. */
export function nyClock(d: Date): NyClock {
  const out: Record<string, number> = {};
  for (const p of NY_CLOCK.formatToParts(d)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    // Some engines print midnight as 24 even under h23.
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Calendar arithmetic on "YYYY-MM-DD" — no clock, no timezone. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The Monday of the Monday-to-Sunday week that contains `day`. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/** New York's offset from UTC at an instant, in ms (negative: -4h or -5h). */
function nyOffsetMs(instant: number): number {
  const c = nyClock(new Date(instant));
  const wall = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  return wall - (instant - (((instant % 1000) + 1000) % 1000));
}

/**
 * The instant a New York wall-clock time happens.
 *
 * Two passes, because the offset depends on the answer: the first guess uses
 * the offset at the same wall time read as UTC, which on a changeover day can
 * be the other side of 2am; the second uses the offset at the first guess,
 * which is on the correct side. Midnight is never inside the skipped or
 * repeated hour in the US, so midnights are exact.
 */
export function nyInstant(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  const base = Date.UTC(y, m - 1, d, h, mi, s);
  const first = base - nyOffsetMs(base);
  return new Date(base - nyOffsetMs(first));
}

/** Midnight at the start of a New York calendar day, as an instant. */
export function nyMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return nyInstant(y, m, d);
}

/* --------------------------------------------------------------- header */

/**
 * "Good morning, Luis" — by the New York hour.
 *
 * 5am to noon is morning, noon to 5pm afternoon, the rest evening (including
 * the small hours: "good morning" at 1am reads as a bug). With no first name
 * on the account it is just "Good morning" rather than "Good morning, ".
 */
export function greeting(now: Date, firstName?: string | null): string {
  const h = nyClock(now).hour;
  const part = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : "evening";
  const name = firstName?.trim();
  return name ? `Good ${part}, ${name}` : `Good ${part}`;
}

const NY_DATE_LINE = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** "Thursday, September 24", in New York. */
export function dateLine(now: Date): string {
  const p: Record<string, string> = {};
  for (const part of NY_DATE_LINE.formatToParts(now)) p[part.type] = part.value;
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/* ----------------------------------------------------------------- money */

/**
 * A dollar amount that fits in a KPI card: $14.76M, $950K, $12.5K, $640, $0.
 *
 * Millions and billions keep two decimals (trailing zeros dropped), thousands
 * keep one below $100K. A value that rounds up to the next unit is promoted —
 * $999,999 is "$1M", never "$1000K".
 */
export function compactMoney(v: number | string | null | undefined): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return "$0";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const units = [
    { s: "B", v: 1e9 },
    { s: "M", v: 1e6 },
    { s: "K", v: 1e3 },
  ];
  const fixed = (x: number, digits: number) => Number(x.toFixed(digits));
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (a < u.v) continue;
    const digits = u.s === "K" ? (a < 1e5 ? 1 : 0) : 2;
    const x = fixed(a / u.v, digits);
    if (x >= 1000 && i > 0) {
      const up = units[i - 1];
      return `${sign}$${fixed(a / up.v, 2)}${up.s}`;
    }
    return `${sign}$${x}${u.s}`;
  }
  const whole = Math.round(a);
  return whole >= 1000 ? `${sign}$1K` : `${sign}$${whole}`;
}

/* ------------------------------------------------------------------ KPIs */

export type Kpi = { value: string; sub: string; tone: "default" | "warn" };

/** Open files and what they asked for. "Open" is the Pipeline page's definition, via isOpen. */
export function openPipelineKpi(apps: DashboardApplication[]): Kpi {
  const open = apps.filter((a) => isOpen(a.stage));
  const requested = open.reduce((s, a) => s + amount(a.requestedAmount), 0);
  return {
    value: compactMoney(requested),
    sub: `requested across ${open.length} open ${plural(open.length, "file")}`,
    tone: "default",
  };
}

export type MonthToDate = {
  /** Submitted since midnight on the 1st, New York. */
  count: number;
  /**
   * Submitted in the same slice of last month — from its 1st to the same day
   * and time — or null when the book does not reach back to the start of last
   * month, because then the comparison would undercount and look like growth.
   */
  lastMonthSamePoint: number | null;
};

/**
 * This month so far against last month by the same point.
 *
 * "By the same point" means the same day of the month at the same New York
 * time. When last month is shorter (today is the 31st, last month had 30
 * days) the whole of last month is the comparison — it had no 31st to stop at.
 */
export function submittedMonthToDate(apps: DashboardApplication[], now: Date): MonthToDate {
  const c = nyClock(now);
  const thisStart = nyInstant(c.year, c.month, 1).getTime();
  const py = c.month === 1 ? c.year - 1 : c.year;
  const pm = c.month === 1 ? 12 : c.month - 1;
  const prevStart = nyInstant(py, pm, 1).getTime();
  const daysInPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const cutoff =
    c.day > daysInPrev
      ? thisStart - 1
      : nyInstant(py, pm, c.day, c.hour, c.minute, c.second).getTime();

  const end = now.getTime();
  let count = 0, last = 0, earliest = Infinity;
  for (const a of apps) {
    const t = arrivedAt(a);
    if (t === null) continue;
    if (t < earliest) earliest = t;
    // A date in the future is a typo, not a forecast.
    if (t >= thisStart && t <= end) count++;
    else if (t >= prevStart && t <= cutoff) last++;
  }
  return { count, lastMonthSamePoint: earliest <= prevStart ? last : null };
}

export function submittedKpi(m: MonthToDate): Kpi {
  return {
    value: String(m.count),
    sub:
      m.lastMonthSamePoint === null
        ? `new ${plural(m.count, "application")}`
        : `vs ${m.lastMonthSamePoint} by this point last month`,
    tone: "default",
  };
}

/** Term sheets sitting in "issued" (not signed yet), with the signed count beside it. */
export function termSheetKpi(apps: DashboardApplication[]): Kpi {
  let out = 0, signed = 0;
  for (const a of apps) {
    if (a.stage === "term_sheet_issued") out++;
    else if (a.stage === "term_sheet_signed") signed++;
  }
  return { value: String(out), sub: `issued, not yet signed · ${signed} signed`, tone: "default" };
}

export type FundedYtd = { count: number; amount: number; anyRecorded: boolean };

/**
 * Funded since 1 January, New York. `fundedAt` is already the COALESCE of the
 * column and the first transition into 'funded' (see DashboardApplication).
 */
export function fundedYearToDate(apps: DashboardApplication[], now: Date): FundedYtd {
  const start = nyInstant(nyClock(now).year, 1, 1).getTime();
  const end = now.getTime();
  let count = 0, total = 0, anyRecorded = false;
  for (const a of apps) {
    const t = time(a.fundedAt);
    if (t === null) continue;
    anyRecorded = true;
    if (t < start || t > end) continue;
    count++;
    total += amount(a.requestedAmount);
  }
  return { count, amount: total, anyRecorded };
}

/**
 * When nothing has ever been given a funded date, "$0" is not a result — it is
 * a missing field. The card says that in amber rather than reporting a year
 * with no loans in it.
 */
export function fundedKpi(f: FundedYtd): Kpi {
  if (!f.anyRecorded) return { value: "$0", sub: "No funded dates recorded yet", tone: "warn" };
  if (f.count === 0) return { value: "$0", sub: "none funded yet this year", tone: "default" };
  return { value: compactMoney(f.amount), sub: `${f.count} ${plural(f.count, "loan")} funded`, tone: "default" };
}

/* ------------------------------------------------------------ work queue */

/**
 * Tab order: the queue's own priority. A deal carries one reason, so the tabs
 * partition the queue and nobody appears under two.
 */
export const TAB_ORDER: readonly QueueReason[] = [
  "awaiting_reply",
  "term_sheet_cold",
  "duplicate",
  "never_contacted",
  "stalled",
];

/**
 * Which tab a row belongs under. A row with no reason is one the borrower
 * wrote back on while it was snoozed — someone waiting on a reply, so it goes
 * with them.
 */
export function tabOf(row: Pick<QueueRowView, "reason">): QueueReason {
  return row.reason ?? "awaiting_reply";
}

export type WaitTone = "red" | "amber" | "plain";

/** Red at 30 days, amber at 14. Colour is never the only signal: the number is printed. */
export function waitTone(days: number): WaitTone {
  if (days >= 30) return "red";
  if (days >= 14) return "amber";
  return "plain";
}

/** "TS" for Taha Sheikh, "M" for a single name, "?" for an unlinked deal. */
export function initials(name: string): string {
  const words = name
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((w) => /^[\p{L}]/u.test(w));
  if (words.length === 0 || name.trim() === "(unlinked)") return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Why this row is here, in a few words — the line under the name. */
export function reasonDetail(row: Pick<QueueRowView, "reason">): string {
  switch (row.reason) {
    case null:
      return "Wrote back while snoozed";
    case "awaiting_reply":
      return "Wrote to you, no reply";
    case "term_sheet_cold":
      return "Term sheet unsigned";
    case "duplicate":
      return "Filed twice within a week";
    case "never_contacted":
      return "Never emailed";
    case "stalled":
      return "Same stage 30+ days";
  }
}

/** How many open files each application's contact holds — a repeat investor is worth knowing about. */
export function openFilesByApplication(apps: DashboardApplication[]): Map<string, number> {
  const perContact = new Map<string, number>();
  for (const a of apps) {
    if (!a.contactId || !isOpen(a.stage)) continue;
    perContact.set(a.contactId, (perContact.get(a.contactId) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const a of apps) out.set(a.id, a.contactId ? perContact.get(a.contactId) ?? 0 : 0);
  return out;
}

/** "Emailed you, no reply yet · 2 open files" — the count only when there is more than one. */
export function subLine(row: Pick<QueueRowView, "reason">, openFiles: number): string {
  const d = reasonDetail(row);
  return openFiles >= 2 ? `${d} · ${openFiles} open files` : d;
}

export type QueueCard = {
  applicationId: string;
  name: string;
  initials: string;
  sub: string;
  waitingDays: number;
  waitLabel: string;
  tone: WaitTone;
  stage: string;
  stageLabel: string;
  amount: string | null;
  wroteBack: boolean;
};

export type QueueTab = { reason: QueueReason; label: string; count: number; rows: QueueCard[] };

/** The tabs, in priority order, each with its rows; an empty tab is left out. */
export function queueTabs(rows: QueueRowView[], openFiles: Map<string, number>): QueueTab[] {
  const buckets = new Map<QueueReason, QueueCard[]>();
  for (const r of rows) {
    const key = tabOf(r);
    const list = buckets.get(key) ?? [];
    list.push({
      applicationId: r.applicationId,
      name: r.name,
      initials: initials(r.name),
      sub: subLine(r, openFiles.get(r.applicationId) ?? 0),
      waitingDays: r.waitingDays,
      waitLabel: ageLabel(r.waitingDays),
      tone: waitTone(r.waitingDays),
      stage: r.stage,
      stageLabel: labelOf(STAGE_LABEL, r.stage),
      amount: r.requestedAmount && amount(r.requestedAmount) > 0 ? money(r.requestedAmount) : null,
      wroteBack: r.wroteBack,
    });
    buckets.set(key, list);
  }
  return TAB_ORDER.filter((k) => (buckets.get(k)?.length ?? 0) > 0).map((k) => ({
    reason: k,
    label: REASON_LABEL[k],
    count: buckets.get(k)!.length,
    rows: buckets.get(k)!,
  }));
}

/** Rows shown before "Show all N". */
export const QUEUE_PREVIEW = 8;

/* ------------------------------------------------------- attention strip */

export type Attention =
  | {
      kind: "waiting";
      count: number;
      longestDays: number;
      top: { applicationId: string; name: string };
      headline: string;
      detail: string;
    }
  | { kind: "calm"; headline: string; detail: string };

/** How the next reason reads in a sentence, for the calm strip. */
function nextPhrase(reason: QueueReason, n: number): string {
  switch (reason) {
    case "awaiting_reply":
      return `${n} waiting on you`;
    case "term_sheet_cold":
      return `${n} ${plural(n, "term sheet")} going cold`;
    case "duplicate":
      return `${n} possible ${plural(n, "duplicate")}`;
    case "never_contacted":
      return `${n} ${plural(n, "borrower")} never contacted`;
    case "stalled":
      return `${n} ${plural(n, "file")} with no movement in 30 days`;
  }
}

/**
 * The strip across the top.
 *
 * Alarm only when somebody is actually waiting — the "Waiting on you" tab,
 * so the count here and the count on the tab can never disagree. Otherwise a
 * calm line that names the next thing, because a navy banner announcing zero
 * teaches the reader to stop looking at the banner.
 */
export function attention(tabs: QueueTab[]): Attention {
  const waiting = tabs.find((t) => t.reason === "awaiting_reply");
  if (waiting && waiting.count > 0) {
    let top = waiting.rows[0];
    for (const r of waiting.rows) if (r.waitingDays > top.waitingDays) top = r;
    const d = top.waitingDays;
    const how = d <= 0 ? "The longest wrote today." : `The longest has waited ${d} ${plural(d, "day")}.`;
    return {
      kind: "waiting",
      count: waiting.count,
      longestDays: d,
      top: { applicationId: top.applicationId, name: top.name },
      headline: `${waiting.count} ${waiting.count === 1 ? "person is" : "people are"} waiting on your reply`,
      detail: `${how} Start there; the rest of the day is in the queue below.`,
    };
  }
  const next = tabs[0];
  return {
    kind: "calm",
    headline: "Nobody is waiting on a reply.",
    detail: next ? `Next: ${nextPhrase(next.reason, next.count)}.` : "The queue is clear.",
  };
}

/* ----------------------------------------------------------- due today */

export type DueTaskView = DueTaskInput & { overdueDays: number; when: string };

/**
 * Open tasks due today or already late, late first (longest late at the top),
 * on the New York calendar. Undated and future tasks are not today's work.
 */
export function dueTasks(tasks: DueTaskInput[], now: Date): DueTaskView[] {
  const today = nyToday(now);
  const out: DueTaskView[] = [];
  for (const t of tasks) {
    if (!t.dueOn || !isIsoDay(t.dueOn)) continue;
    const ahead = dayDiff(today, t.dueOn);
    if (ahead > 0) continue;
    const late = -ahead;
    out.push({ ...t, overdueDays: late, when: late === 0 ? "due today" : `overdue ${late} ${plural(late, "day")}` });
  }
  return out.sort(
    (a, b) => b.overdueDays - a.overdueDays || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

/** Deals whose follow-up date lands on today, New York. Only deals still being worked. */
export function followUpsToday(apps: DashboardApplication[], now: Date): number {
  const today = nyToday(now);
  let n = 0;
  for (const a of apps) {
    if (!needsWork(a.stage)) continue;
    const t = time(a.nextActionAt);
    if (t !== null && nyToday(new Date(t)) === today) n++;
  }
  return n;
}

/** "3 follow-ups" + "come back today" — two parts, so the count can be set in bold. */
export function followUpsLine(n: number): { lead: string; rest: string } {
  return { lead: `${n} ${plural(n, "follow-up")}`, rest: `${n === 1 ? "comes" : "come"} back today` };
}

/* ------------------------------------------------------ pipeline by stage */

export type StageBar = {
  key: string;
  label: string;
  count: number;
  /** Width against the busiest row, 0–100. */
  pct: number;
  tone: "navy" | "gold" | "empty";
  /** The stages folded into a combined row, for its accessible description. */
  members: string[];
};

/** The late stages, folded into one row so a side card stays readable. The board has the detail. */
const LATE_STAGES = ["underwriting", "conditional_approval", "conditions_clearing", "clear_to_close", "docs_out"];
const GOLD_STAGES = new Set(["term_sheet_issued", "term_sheet_signed"]);

/**
 * The board's stages as bars. Term sheet issued and signed are gold — the
 * conversion gate — and an empty stage is drawn as an empty track, not
 * dropped: a pipeline with nothing in underwriting is the finding.
 */
export function stageBars(apps: DashboardApplication[]): StageBar[] {
  const counts = new Map<string, number>();
  for (const s of BOARD_STAGES) counts.set(s, 0);
  for (const a of apps) if (counts.has(a.stage)) counts.set(a.stage, counts.get(a.stage)! + 1);

  const rows: Omit<StageBar, "pct">[] = [];
  for (const s of BOARD_STAGES) {
    if (LATE_STAGES.includes(s)) continue;
    const count = counts.get(s)!;
    rows.push({
      key: s,
      label: STAGE_LABEL[s] ?? s,
      count,
      tone: count === 0 ? "empty" : GOLD_STAGES.has(s) ? "gold" : "navy",
      members: [s],
    });
  }
  const late = LATE_STAGES.reduce((n, s) => n + (counts.get(s) ?? 0), 0);
  rows.push({
    key: "late",
    label: `${STAGE_LABEL.underwriting} → ${STAGE_LABEL.docs_out}`,
    count: late,
    tone: late === 0 ? "empty" : "navy",
    members: LATE_STAGES,
  });

  const peak = Math.max(1, ...rows.map((r) => r.count));
  return rows.map((r) => ({ ...r, pct: (r.count / peak) * 100 }));
}

/* ----------------------------------------------------------- lead sources */

export const SOURCE_GROUPS = ["website", "biggerpockets", "broker", "other"] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

const SOURCE_GROUP_LABEL: Record<SourceGroup, string> = {
  website: "Website",
  biggerpockets: "BiggerPockets",
  broker: "Brokers",
  other: "Other",
};

/** Website, BiggerPockets and brokers by name; referral, LinkedIn, REIA, unknown and the rest as Other. */
export function sourceGroup(source: string | null | undefined): SourceGroup {
  return source === "website" || source === "biggerpockets" || source === "broker" ? source : "other";
}

/**
 * Whole percentages that add up to 100 (largest remainder), so a legend of
 * 33 / 33 / 33 cannot happen. All zero when there is nothing to divide.
 */
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((s, n) => s + n, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((s, n) => s + n, 0);
  const order = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

export type SourceSlice = { key: SourceGroup; label: string; count: number; pct: number };

/**
 * Where applications came from over the last `days` New York days, today
 * included.
 *
 * Dated by arrival (submitted, else created), not by created_at alone: the
 * legacy import stamped created_at with the day it ran, so on created_at the
 * whole historic book would count as "the last 30 days".
 */
export function leadSourceMix(
  apps: DashboardRow[],
  now: Date,
  days = 30,
): { total: number; slices: SourceSlice[] } {
  const since = nyMidnight(addDays(nyToday(now), -(days - 1))).getTime();
  const end = now.getTime();
  const counts = new Map<SourceGroup, number>(SOURCE_GROUPS.map((g) => [g, 0]));
  for (const a of apps) {
    const t = arrivedAt(a);
    if (t === null || t < since || t > end) continue;
    const g = sourceGroup(a.leadSource);
    counts.set(g, counts.get(g)! + 1);
  }
  const list = SOURCE_GROUPS.map((g) => counts.get(g)!);
  const pcts = percentages(list);
  return {
    total: list.reduce((s, n) => s + n, 0),
    slices: SOURCE_GROUPS.map((g, i) => ({ key: g, label: SOURCE_GROUP_LABEL[g], count: list[i], pct: pcts[i] })),
  };
}

/* ------------------------------------------------------- weekly trend */

export type WeekBucket = {
  /** Monday, "YYYY-MM-DD", New York. */
  start: string;
  /** "Sep 21" */
  label: string;
  /** "Sep 21 – Sep 27" */
  range: string;
  submitted: number;
  termSheets: number;
  /** The current week, counted to date. */
  partial: boolean;
};

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const shortDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return SHORT_DAY.format(new Date(Date.UTC(y, m - 1, d)));
};

/**
 * The last `weeks` New York weeks, Monday to Sunday, oldest first: how many
 * applications arrived and how many term sheets first went out in each.
 *
 * Bucketed by CALENDAR DAY, not by adding seven days of milliseconds: the
 * week that contains a daylight-saving change is 167 or 169 hours long, and
 * an instant-based boundary would shift an hour's worth of applications into
 * the neighbouring week twice a year.
 */
export function weeklyTrend(apps: DashboardRow[], now: Date, weeks = 12): WeekBucket[] {
  const thisMonday = mondayOf(nyToday(now));
  const buckets: WeekBucket[] = [];
  const at = new Map<string, WeekBucket>();
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    const b: WeekBucket = {
      start,
      label: shortDay(start),
      range: `${shortDay(start)} – ${shortDay(addDays(start, 6))}`,
      submitted: 0,
      termSheets: 0,
      partial: i === 0,
    };
    buckets.push(b);
    at.set(start, b);
  }
  const end = now.getTime();
  const weekOf = (t: number | null) => (t === null || t > end ? null : at.get(mondayOf(nyToday(new Date(t)))) ?? null);
  for (const a of apps) {
    const s = weekOf(arrivedAt(a));
    if (s) s.submitted++;
    const ts = weekOf(time(a.firstTermSheetAt));
    if (ts) ts.termSheets++;
  }
  return buckets;
}

/** The tallest value on the chart, never below 1 so an empty chart does not divide by zero. */
export function trendPeak(buckets: WeekBucket[]): number {
  return Math.max(1, ...buckets.flatMap((b) => [b.submitted, b.termSheets]));
}

/* --------------------------------------------------------- whole page */

export type DashboardModel = {
  attention: Attention;
  kpis: { pipeline: Kpi; submitted: Kpi; termSheets: Kpi; funded: Kpi };
  tabs: QueueTab[];
  queueTotal: number;
  parked: SnoozedItem[];
  parkedHeading: string | null;
  tasks: DueTaskView[];
  followUps: number;
  stages: StageBar[];
  sources: { total: number; slices: SourceSlice[] };
  weeks: WeekBucket[];
  weekPeak: number;
};

/**
 * Every number and list on the page, from one read and one clock.
 *
 * One `now` for the whole page, so the queue, the put-down list, the KPIs and
 * the charts cannot disagree about what day it is.
 */
export function buildDashboardModel(apps: DashboardRow[], tasks: DueTaskInput[], now: Date): DashboardModel {
  const queue = buildWorkQueue(apps, QUEUE_DEFAULTS, now);
  const rows = queueRows(queue, apps, snoozesBrokenByInbound(apps, now), now);
  const tabs = queueTabs(rows, openFilesByApplication(apps));
  const parked = snoozedItems(apps, now);
  const weeks = weeklyTrend(apps, now);
  return {
    attention: attention(tabs),
    kpis: {
      pipeline: openPipelineKpi(apps),
      submitted: submittedKpi(submittedMonthToDate(apps, now)),
      termSheets: termSheetKpi(apps),
      funded: fundedKpi(fundedYearToDate(apps, now)),
    },
    tabs,
    queueTotal: rows.length,
    parked,
    parkedHeading: putDownHeading(parked, now),
    tasks: dueTasks(tasks, now),
    followUps: followUpsToday(apps, now),
    stages: stageBars(apps),
    sources: leadSourceMix(apps, now),
    weeks,
    weekPeak: trendPeak(weeks),
  };
}
