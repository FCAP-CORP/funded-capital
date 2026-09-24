/**
 * Tasks on a deal — the rules, with no database and no clock of their own.
 *
 * Pure, so lib/crm/tasks.regress.ts pins every decision. The server actions in
 * app/crm/actions.ts validate with these and write; the record card renders
 * with these and reads. Neither re-decides anything.
 *
 * ONE CALENDAR. A due date is a DAY on Luis's calendar (America/New_York), the
 * same business timezone lib/crm/followup.ts counts snoozes in. "Overdue" means
 * the New York day has moved past the due day — not that some UTC midnight has
 * passed, which would flag Thursday's task as late at 8pm on Wednesday.
 */

import { BUSINESS_TIMEZONE, type Parsed } from "./followup";

/** Long enough for "Chase the insurance binder for 12 Oak St", short enough to scan. */
export const MAX_TASK_TITLE = 200;

/** A due date further out than this is almost certainly a typo in the year. */
export const MAX_TASK_DUE_DAYS = 730;

/** How many finished tasks the card keeps showing under the open ones. */
export const RECENT_DONE_LIMIT = 5;

/** The RFC 4122 shape. Ids arrive from the browser; Postgres throws on anything else. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/* ---------------------------------------------------------------- calendar */

const NY_YMD = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today on the New York calendar, as "YYYY-MM-DD". */
export function nyToday(now: Date): string {
  const parts: Record<string, string> = {};
  for (const p of NY_YMD.formatToParts(now)) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Whole days from `a` to `b`, both "YYYY-MM-DD". Calendar arithmetic, no clock. */
export function dayDiff(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** A real calendar date in "YYYY-MM-DD" form — 2026-02-30 is not one. */
export function isIsoDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/* -------------------------------------------------------------- validation */

/**
 * A task title: trimmed, inner runs of whitespace collapsed, 1–200 characters.
 *
 * Collapsing matters because a title is one line on the card. A pasted title
 * carrying a newline would render as one line anyway and then fail to match
 * what someone searches for.
 */
export function parseTaskTitle(input: unknown): Parsed<string> {
  const raw = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  if (!raw) return { ok: false, error: "Say what needs doing." };
  if (raw.length > MAX_TASK_TITLE) {
    return { ok: false, error: `Keep it under ${MAX_TASK_TITLE} characters.` };
  }
  return { ok: true, value: raw };
}

/**
 * An optional due day.
 *
 * Empty means "no date", which is a normal task. The past is refused — a task
 * created already overdue would open the card in red for something nobody has
 * failed to do yet — but TODAY is allowed, because "do this today" is the most
 * common task there is.
 */
export function parseDueDate(input: unknown, now: Date): Parsed<string | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "That date could not be read." };
  const v = input.trim();
  if (!v) return { ok: true, value: null };
  if (!isIsoDay(v)) return { ok: false, error: "That date could not be read." };
  const ahead = dayDiff(nyToday(now), v);
  if (ahead < 0) return { ok: false, error: "That date has already passed." };
  if (ahead > MAX_TASK_DUE_DAYS) {
    return { ok: false, error: "That is more than two years out — check the year." };
  }
  return { ok: true, value: v };
}

/* ------------------------------------------------------------ presentation */

export type TaskLike = {
  id: string;
  title: string;
  dueOn: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type TaskState = "overdue" | "due_today" | "upcoming" | "no_date" | "done";

export function taskState(t: Pick<TaskLike, "dueOn" | "completedAt">, now: Date): TaskState {
  if (t.completedAt) return "done";
  if (!t.dueOn || !isIsoDay(t.dueOn)) return "no_date";
  const d = dayDiff(nyToday(now), t.dueOn);
  if (d < 0) return "overdue";
  if (d === 0) return "due_today";
  return "upcoming";
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", // the day is already a New York day; do not shift it again
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Today", "Tomorrow", "Yesterday", otherwise "Thu 1 Oct". */
export function dueLabel(dueOn: string | null, now: Date): string {
  if (!dueOn || !isIsoDay(dueOn)) return "No date";
  const d = dayDiff(nyToday(now), dueOn);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  const [y, m, day] = dueOn.split("-").map(Number);
  const parts: Record<string, string> = {};
  for (const p of DAY_LABEL.formatToParts(new Date(Date.UTC(y, m - 1, day)))) parts[p.type] = p.value;
  const base = `${parts.weekday} ${parts.day} ${parts.month}`;
  return y === Number(nyToday(now).slice(0, 4)) ? base : `${base} ${y}`;
}

const time = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * The order the card shows tasks in.
 *
 * OPEN FIRST, and among open: overdue (longest overdue first), then due today,
 * then upcoming by date, then undated in the order they were added. The thing
 * already late is the thing to do next.
 *
 * Then DONE, newest first, capped at `recentDone` — a finished task is a
 * record, not work, and a deal with forty ticked boxes should still open on
 * the three that are not ticked. `hiddenDone` says how many were left off so
 * the card can say so rather than silently dropping them.
 */
export function arrangeTasks<T extends TaskLike>(
  tasks: T[],
  now: Date,
  recentDone: number = RECENT_DONE_LIMIT,
): { open: T[]; done: T[]; hiddenDone: number; overdue: number } {
  const rank: Record<TaskState, number> = { overdue: 0, due_today: 1, upcoming: 2, no_date: 3, done: 4 };
  const open = tasks
    .filter((t) => !t.completedAt)
    .sort((a, b) => {
      const ra = rank[taskState(a, now)], rb = rank[taskState(b, now)];
      if (ra !== rb) return ra - rb;
      if (a.dueOn && b.dueOn && a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
      return time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id);
    });
  const allDone = tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => time(b.completedAt) - time(a.completedAt) || a.id.localeCompare(b.id));
  const cap = Math.max(0, recentDone);
  return {
    open,
    done: allDone.slice(0, cap),
    hiddenDone: Math.max(0, allDone.length - cap),
    overdue: open.filter((t) => taskState(t, now) === "overdue").length,
  };
}
