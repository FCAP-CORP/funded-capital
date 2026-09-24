/**
 * The record card — every presentation decision, pure.
 *
 * No database, no React, no clock of its own: `now` is always a parameter, so
 * lib/crm/record.regress.ts pins each rule. `lib/crm/record.server.ts` reads the
 * rows; `app/crm/record/` renders them; this file decides what they say.
 */

import { LOAN_PURPOSE_OPTIONS } from "../pricing";
import { STAGE_LABEL, daysSince } from "./view";
import { STALE_DAYS, isBoardStage } from "./board";
import { KIND_LABEL } from "./followup";

/* ---------------------------------------------------------------- the stage */

/**
 * Days in the current stage, and whether that is a problem.
 *
 * Stale only while the deal is still being WON — the same columns the board
 * shows, with the same STALE_DAYS threshold, so the card and the board can
 * never disagree about one deal. A funded loan sitting quietly in Active for
 * ninety days is a performing loan, not a stalled one, and flagging it would
 * teach the reader to ignore the flag.
 */
export function stageAge(
  stage: string,
  stageEnteredAt: string | null,
  now: Date,
): { days: number | null; stale: boolean } {
  const days = daysSince(stageEnteredAt, now);
  return { days, stale: days !== null && days >= STALE_DAYS && isBoardStage(stage) };
}

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

/* ------------------------------------------------------------- the loan */

const PURPOSE_LABEL: Record<string, string> = Object.fromEntries(
  LOAN_PURPOSE_OPTIONS.map((o) => [o.key, o.label]),
);

/** "Purchase", "Cash-Out Refi" — the pricing engine's own words, not a second copy. */
export function loanPurposeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return PURPOSE_LABEL[v] ?? v;
}

/**
 * A stored leverage ratio (0.8500) as the card shows it.
 *
 * Over 100% is not leverage, it is missing data — the same rule the Pipeline
 * grid applies: neither web form asks for a rehab budget, so LTC on a rehab
 * deal is loan ÷ purchase price alone and prints 136%. Shown as a confident
 * number it invites someone to decline a normal deal, so it is marked instead.
 */
export function ratioText(v: string | number | null | undefined): { text: string; incomplete: boolean } | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n > 1) return { text: "over 100% — inputs incomplete", incomplete: true };
  return { text: `${(n * 100).toFixed(1)}%`, incomplete: false };
}

/** One line: "12 Oak St, Tampa, FL 33602". Missing pieces are skipped, not dashed. */
export function addressLine(p: {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string | null {
  const stateZip = [p.state, p.postalCode].filter(Boolean).join(" ");
  const out = [p.addressLine1, p.city, stateZip].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  return out || null;
}

/* --------------------------------------------------------------- the person */

export const ROLE_LABEL: Record<string, string> = {
  borrower: "Borrower",
  co_borrower: "Co-borrower",
  guarantor: "Guarantor",
  ubo: "Beneficial owner",
  broker: "Broker",
};

/** `tel:` target. Only an E.164 number is dialable as-is; anything else gets none. */
export function telHref(phone: string | null | undefined): string | null {
  return phone && /^\+\d{8,15}$/.test(phone) ? `tel:${phone}` : null;
}

export type ConsentTone = "ok" | "warn" | "none";

/**
 * What the database says about contact permission — read-only, always.
 *
 * Consent flows INBOUND only (CLAUDE.md): a Quo STOP or a Klaviyo unsubscribe is
 * authoritative, and nothing on this card may grant it. So this only describes.
 *
 * An opt-out beats a consent record: someone who agreed in March and texted
 * STOP in May has opted out. A consent recorded under older wording is still
 * consent, but it is marked, because an automated send has to verify consent at
 * the CURRENT version and would refuse this person.
 */
export function smsConsent(
  c: { smsOptedOut: boolean; smsConsentAt: string | null; smsConsentVersion: string | null },
  currentVersion: string,
): { text: string; tone: ConsentTone } {
  if (c.smsOptedOut) return { text: "Opted out of texts", tone: "warn" };
  if (!c.smsConsentAt) return { text: "No text consent on record", tone: "none" };
  if (c.smsConsentVersion && c.smsConsentVersion !== currentVersion) {
    return { text: `Consented under older wording (${c.smsConsentVersion})`, tone: "warn" };
  }
  if (!c.smsConsentVersion) return { text: "Consented — wording version not recorded", tone: "warn" };
  return { text: "Consented to calls and texts", tone: "ok" };
}

export function emailConsent(subscribed: boolean | null): { text: string; tone: ConsentTone } {
  if (subscribed === true) return { text: "Subscribed to email", tone: "ok" };
  if (subscribed === false) return { text: "Unsubscribed from email", tone: "warn" };
  return { text: "Email status unknown", tone: "none" };
}

/* ------------------------------------------------------------- the timeline */

/**
 * Every activity kind, labelled for a person.
 *
 * Keyed on the full `activity_kind` enum and checked both ways against it by
 * record.regress.ts — an unlabelled kind is the bug class schema-sync exists
 * for, and on a timeline it would print a raw enum value at the borrower.
 */
export const ACTIVITY_LABEL: Record<string, string> = {
  email_in: "Email from them",
  email_out: "Email to them",
  call: "Call",
  sms_in: "Text from them",
  sms_out: "Text to them",
  note: "Note",
  field_change: "Field changed",
  stage_change: "Stage changed",
  automation: "Automation",
  form_submission: "Form submitted",
};

export type ActivityInput = {
  id: string;
  kind: string;
  occurredAt: string;
  source: string | null;
  subject: string | null;
  body: string | null;
};

export type TransitionInput = {
  id: string;
  fromStage: string | null;
  toStage: string;
  changedAt: string;
  reason: string | null;
};

export type TimelineItem = {
  key: string;
  at: string;
  kind: string;
  /** What happened, in words. */
  title: string;
  /** An email's subject line, or a snooze's "Put down until…". */
  subject: string | null;
  /** The note someone typed. Never an email body — those are not stored. */
  body: string | null;
  /** Only for stage moves: the lost reason, or why it moved. */
  reason: string | null;
};

/** Default depth. Past this the card says how many more there are, not nothing. */
export const TIMELINE_LIMIT = 50;

/**
 * The subjects the CRM writes for a hand-logged touch ("Called", "Emailed"…).
 * Repeating "Called" under a heading that already says "Call" is noise.
 */
const LOGGED_VERBS = new Set(Object.values(KIND_LABEL));

function activityItem(a: ActivityInput): TimelineItem {
  const subject = a.subject?.trim() || null;
  return {
    key: `a:${a.id}`,
    at: a.occurredAt,
    kind: a.kind,
    title: ACTIVITY_LABEL[a.kind] ?? a.kind,
    subject: subject && a.source === "crm" && LOGGED_VERBS.has(subject) ? null : subject,
    body: a.body?.trim() || null,
    reason: null,
  };
}

function transitionItem(t: TransitionInput): TimelineItem {
  const to = stageLabel(t.toStage);
  const from = t.fromStage ? stageLabel(t.fromStage) : null;
  const reason = t.reason?.trim() || null;
  return {
    key: `s:${t.id}`,
    at: t.changedAt,
    kind: "stage_move",
    title: from ? `${from} → ${to}` : `Entered ${to}`,
    subject: null,
    body: null,
    // "changed in the CRM" is the default the action writes; it adds nothing.
    reason: reason && reason !== "changed in the CRM" ? reason : null,
  };
}

const t = (iso: string) => {
  const n = Date.parse(iso);
  return Number.isNaN(n) ? -Infinity : n;
};

/**
 * Activities and stage moves, merged newest first, capped.
 *
 * `totalActivities` and `totalTransitions` are the full counts from the
 * database, which may exceed the rows passed in — each list is itself read with
 * a limit. Because both are newest-first, the newest `limit` of the merge is
 * always inside the newest `limit` of each, so reading `limit` of each is exact.
 * `older` is how many exist beyond what is shown.
 */
export function buildTimeline(
  acts: ActivityInput[],
  moves: TransitionInput[],
  totals: { totalActivities: number; totalTransitions: number },
  limit: number = TIMELINE_LIMIT,
): { items: TimelineItem[]; older: number } {
  const merged = [...acts.map(activityItem), ...moves.map(transitionItem)].sort(
    (a, b) => t(b.at) - t(a.at) || a.key.localeCompare(b.key),
  );
  const items = merged.slice(0, Math.max(0, limit));
  const total = Math.max(totals.totalActivities, acts.length) + Math.max(totals.totalTransitions, moves.length);
  return { items, older: Math.max(0, total - items.length) };
}

const NY_WHEN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * "Thu 24 Sep, 10:14 AM" on the New York clock — the year only when it is not
 * this year. A timeline read in UTC puts an evening call on the wrong day.
 */
export function whenLabel(iso: string | null | undefined, now: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p: Record<string, string> = {};
  for (const part of NY_WHEN.formatToParts(d)) p[part.type] = part.value;
  const nowYear = NY_WHEN.formatToParts(now).find((x) => x.type === "year")?.value;
  const day = `${p.weekday} ${p.day} ${p.month}${p.year === nowYear ? "" : ` ${p.year}`}`;
  return `${day}, ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/* ------------------------------------------------------------ the documents */

export type DocStatus = "received" | "requested" | "expired" | "listed";

/**
 * Where a document stands — from its dates alone.
 *
 * Expired wins over received: a received appraisal that is past its date is a
 * condition that has come back open, which is the thing worth seeing.
 */
export function docStatus(
  d: { requestedAt: string | null; receivedAt: string | null; expiresOn: string | null },
  now: Date,
): DocStatus {
  if (d.expiresOn && t(d.expiresOn) < now.getTime()) return "expired";
  if (d.receivedAt) return "received";
  if (d.requestedAt) return "requested";
  return "listed";
}

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  received: "Received",
  requested: "Requested",
  expired: "Expired",
  listed: "On file",
};
