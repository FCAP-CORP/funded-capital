/**
 * The rules behind logging a touch and putting a deal down.
 *
 * Pure — no database, no Clerk — so every decision here is pinned by
 * lib/crm/followup.regress.ts. The server actions in app/crm/actions.ts do the
 * writing; they do not do the deciding.
 */

/**
 * The kinds a person may log by hand, and nothing else.
 *
 * `email_in` and `sms_in` are absent on purpose. Inbound is a fact that
 * happened to us and arrives from a webhook with a provider id to dedupe on.
 * Letting a person assert "they emailed me" by hand would corrupt the one
 * signal the work queue trusts most — `awaiting_reply` exists precisely because
 * the borrower wrote and we did not answer, and a hand-typed inbound row would
 * let that clear itself.
 *
 * `stage_change`, `field_change` and `automation` are absent for the same
 * reason in reverse: the system writes those, so a person writing one would be
 * forging an audit trail.
 */
export const LOGGABLE_KINDS = ["call", "email_out", "sms_out", "note"] as const;
export type LoggableKind = (typeof LOGGABLE_KINDS)[number];

export function isLoggableKind(kind: unknown): kind is LoggableKind {
  return typeof kind === "string" && (LOGGABLE_KINDS as readonly string[]).includes(kind);
}

export const KIND_LABEL: Record<LoggableKind, string> = {
  call: "Called",
  email_out: "Emailed",
  sms_out: "Texted",
  note: "Note",
};

/** Longest a deal may be put down. A year is already generous for a live file. */
export const MAX_SNOOZE_DAYS = 365;

/** Free text on an activity or a snooze. Long enough for context, not a document. */
export const MAX_NOTE_LENGTH = 2000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Validate a snooze target.
 *
 * Refuses the past. A snooze is a statement about when to look again, and
 * "look again yesterday" is not one — it would silently do nothing, which is
 * worse than an error because the person believes the deal is handled.
 */
export function parseSnoozeDate(input: unknown, now: Date = new Date()): Parsed<string> {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "Pick a date to come back to this." };
  }
  const t = Date.parse(input);
  if (Number.isNaN(t)) return { ok: false, error: "That date could not be read." };
  if (t <= now.getTime()) return { ok: false, error: "That date has already passed." };
  const days = (t - now.getTime()) / 86_400_000;
  if (days > MAX_SNOOZE_DAYS) {
    return { ok: false, error: `The longest you can put something down is ${MAX_SNOOZE_DAYS} days.` };
  }
  return { ok: true, value: new Date(t).toISOString() };
}

/** Trim and bound free text. Empty becomes null rather than an empty string. */
export function parseNote(input: unknown, required = false): Parsed<string | null> {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) {
    return required ? { ok: false, error: "Write something first." } : { ok: true, value: null };
  }
  if (raw.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_NOTE_LENGTH} characters.` };
  }
  return { ok: true, value: raw };
}

export interface SnoozePreset {
  label: string;
  iso: string;
}

/**
 * The buttons offered instead of a date picker.
 *
 * Each lands at 13:00 UTC on the target day — roughly 9am Eastern — so a deal
 * put down until Thursday reappears on Thursday morning rather than at whatever
 * minute of Thursday you happened to click. A deal that returns at 4:47pm has
 * effectively been snoozed a day longer than you asked for.
 */
/** Luis's calendar. A "tomorrow" that isn't his tomorrow is the wrong day. */
export const BUSINESS_TIMEZONE = "America/New_York";

/** Year, month and day of `now` on the business calendar. */
function businessDay(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function snoozePresets(now: Date = new Date()): SnoozePreset[] {
  // Count days on the NEW YORK calendar. Counting UTC days made "Tomorrow"
  // mean the day after tomorrow for four hours every evening: at 9pm Eastern
  // it is already tomorrow in UTC, so UTC+1 lands two New York days out.
  const today = businessDay(now);
  const at = (days: number): string => {
    const d = new Date(Date.UTC(today.y, today.m - 1, today.d + days, 13, 0, 0, 0));
    // A target already in the past can only happen for days = 0, which is not
    // offered — but a preset must never be a moment that parseSnoozeDate
    // would refuse, so push rather than trust that.
    if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  };
  return [
    { label: "Tomorrow", iso: at(1) },
    { label: "In 3 days", iso: at(3) },
    { label: "Next week", iso: at(7) },
    { label: "In 2 weeks", iso: at(14) },
    { label: "In a month", iso: at(30) },
  ];
}
