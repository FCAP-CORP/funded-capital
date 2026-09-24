/**
 * Presentation rules for working the dashboard queue in place.
 *
 * PURE — no React, no database, no clock of its own: `now` is always a
 * parameter, so lib/crm/queueView.regress.ts can pin every decision here. It is
 * imported by the server page AND by the client row controls, so nothing in it
 * may reach for a server-only module.
 *
 * WHY NEW YORK TIME IS EXPLICIT. The server renders in UTC and the browser
 * renders in whatever zone the laptop is set to. Neither is where the deal
 * lives. Luis works on Eastern time, so every day shown here is computed in
 * America/New_York by name — the same screen says the same day on a server in
 * Virginia, a laptop in Madrid and a phone on a plane.
 */

import { snoozePresets } from "./followup";
import type { LoggableKind } from "./followup";
import { STAGE_LABEL, STAGE_ORDER, daysSince } from "./view";
import type { DashboardApplication, QueueItem, QueueReason, SnoozedItem } from "./dashboard";

export const NY_TZ = "America/New_York";

/* ------------------------------------------------------------ New York days */

const NY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

const NY_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nyNumbers(d: Date) {
  const out: Record<string, number> = {};
  for (const p of NY_PARTS.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    // Some engines still print midnight as "24" even under h23.
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/**
 * A day as Luis would say it: "Thu 1 Oct".
 *
 * The year is added only when it is not the current New York year, so a deal
 * put down in December until January reads "Fri 1 Jan 2027" rather than a date
 * that looks like it already happened.
 */
export function nyDayLabel(value: Date | string | null | undefined, now: Date): string {
  const d = toDate(value);
  if (!d) return "—";
  const parts: Record<string, string> = {};
  for (const p of NY_DAY.formatToParts(d)) parts[p.type] = p.value;
  const base = `${parts.weekday} ${parts.day} ${parts.month}`;
  return Number(parts.year) === nyNumbers(now).year ? base : `${base} ${parts.year}`;
}

/**
 * The New York wall clock, written as if it were UTC.
 *
 * 22:30 on Wednesday in New York is 02:30 on Thursday in UTC. Handing THAT
 * moment to a UTC-calendar function makes it think Wednesday is over. Shifting
 * the instant so its UTC fields read the New York wall clock lets
 * `snoozePresets` count days on the calendar Luis is actually standing in.
 */
export function nyWallClockAsUtc(now: Date): Date {
  const n = nyNumbers(now);
  return new Date(Date.UTC(n.year, n.month - 1, n.day, n.hour, n.minute, n.second, now.getUTCMilliseconds()));
}

export interface SnoozeOption {
  /** "Next week" */
  label: string;
  /** What gets sent to setSnooze. */
  iso: string;
  /** "Thu 1 Oct", in New York. */
  day: string;
  /** "Next week · Thu 1 Oct" */
  text: string;
}

/**
 * The five snooze buttons, counted on the New York calendar.
 *
 * `snoozePresets` counts UTC days. From 8pm Eastern onwards (midnight UTC in
 * summer) that makes "Tomorrow" land the day AFTER tomorrow for someone in New
 * York. Feeding it the New York wall clock fixes the counting without a second
 * copy of the preset list: each option lands at 13:00 UTC on the target New
 * York day — 9am in summer, 8am in winter — and every one of them is always in
 * the real future, because the earliest (tomorrow, 13:00 UTC) is at least eight
 * hours past New York midnight tonight.
 */
export function snoozeOptions(now: Date): SnoozeOption[] {
  // snoozePresets counts New York days itself (fixed at the source 24 Sep 2026).
  return snoozePresets(now).map((p) => {
    const day = nyDayLabel(p.iso, now);
    return { label: p.label, iso: p.iso, day, text: `${p.label} · ${day}` };
  });
}

/* ------------------------------------------------------------ put-down list */

/**
 * The heading over the put-down list, or null when nothing is put down.
 *
 * The count is the point. A queue that can be emptied by snoozing, with no
 * number for what was snoozed, rewards hiding work.
 */
export function putDownHeading(items: Pick<SnoozedItem, "until">[], now: Date): string | null {
  const times = items
    .map((i) => toDate(i.until))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (items.length === 0) return null;
  const next = times.length > 0 ? nyDayLabel(times[0], now) : null;
  if (items.length === 1) return next ? `1 put down · back ${next}` : "1 put down";
  return next ? `${items.length} put down · next back ${next}` : `${items.length} put down`;
}

/* ------------------------------------------------------------- log buttons */

/**
 * The three "I already did this" buttons.
 *
 * Every label starts with "Log" and every hint says it does not send. A later
 * build adds real calling and texting from this screen, and a bare "Call"
 * button sitting next to a real one is how a person records a call they never
 * made, or makes one they meant only to record. queueView.regress.ts fails if
 * a label here ever loses the word.
 */
export const LOG_ACTIONS: readonly {
  kind: Exclude<LoggableKind, "note">;
  label: string;
  hint: string;
  done: string;
}[] = [
  {
    kind: "call",
    label: "Log call",
    hint: "Record a call you already made. This does not place a call.",
    done: "Call recorded",
  },
  {
    kind: "email_out",
    label: "Log email",
    hint: "Record an email you already sent. This does not send an email.",
    done: "Email recorded",
  },
  {
    kind: "sms_out",
    label: "Log text",
    hint: "Record a text you already sent. This does not send a text.",
    done: "Text recorded",
  },
];

/* -------------------------------------------------------------- stage menu */

/**
 * Every stage in pipeline order, plus the current one if the label map does
 * not know it — otherwise opening the menu would silently offer to rewrite a
 * value the database holds. Same rule as the Pipeline grid's StageSelect.
 */
export function stageOptions(current: string): { value: string; label: string }[] {
  const out = STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABEL[s] ?? s }));
  if (!STAGE_ORDER.includes(current)) out.push({ value: current, label: current });
  return out;
}

/* ------------------------------------------------------------ queue rows */

export interface QueueRowView {
  applicationId: string;
  name: string;
  email: string | null;
  stage: string;
  /** Null only for a row that is here because the borrower wrote back. */
  reason: QueueReason | null;
  waitingDays: number;
  requestedAmount: string | null;
  /** They got in touch after the deal was put down. */
  wroteBack: boolean;
}

/**
 * The rows the table renders: the work queue, with the wrote-back badge applied.
 *
 * WHY THIS ADDS ROWS AND DOES NOT ONLY BADGE THEM. A snooze broken by inbound
 * contact stops the deal being snoozed, but it does not give it a queue reason.
 * A borrower who TEXTS back, or emails back less than two days ago, matches
 * none of the five reasons — so the deal was absent from the queue AND from the
 * put-down list: visible nowhere, at exactly the moment the borrower is trying
 * to reach us. Those deals are added here, first, because like `awaiting_reply`
 * they are someone who wrote and has not heard back. Deals already in the queue
 * for another reason keep their place and gain the badge.
 */
export function queueRows(
  queue: QueueItem[],
  apps: DashboardApplication[],
  brokenIds: readonly string[],
  now: Date,
): QueueRowView[] {
  const broken = new Set(brokenIds);
  const inQueue = new Set(queue.map((q) => q.applicationId));

  const extra: QueueRowView[] = apps
    .filter((a) => broken.has(a.id) && !inQueue.has(a.id))
    .map((a) => ({
      applicationId: a.id,
      name: a.name,
      email: a.email,
      stage: a.stage,
      reason: null,
      waitingDays: Math.max(0, daysSince(a.lastContactAt, now) ?? 0),
      requestedAmount: a.requestedAmount,
      wroteBack: true,
    }))
    .sort((a, b) => b.waitingDays - a.waitingDays || a.name.localeCompare(b.name));

  const listed: QueueRowView[] = queue.map((q) => ({
    applicationId: q.applicationId,
    name: q.name,
    email: q.email,
    stage: q.stage,
    reason: q.reason,
    waitingDays: q.waitingDays,
    requestedAmount: q.requestedAmount,
    wroteBack: broken.has(q.applicationId),
  }));

  return [...extra, ...listed];
}
