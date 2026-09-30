/**
 * The nurture cockpit — every rule that lets Luis run the Klaviyo programmes
 * from Lending OS without opening Klaviyo. PURE: no database, no network, no
 * clock except the `now` passed in. Pinned by cockpit.regress.ts.
 *
 *   WARM-UP      A new sender that suddenly emails hundreds of old contacts
 *                looks like a spammer to Gmail and Outlook. Enrolments wait
 *                in a queue and are released to Klaviyo a few dozen a day,
 *                growing on each day that sends, on weekday mornings only.
 *   FLOW LIVE    Nobody is released to a list whose flow is not live: a
 *                list-triggered flow only catches people added AFTER it goes
 *                live, so releasing early would silently waste them.
 *   GUARD        If bounces or spam complaints cross the line, releases pause
 *                themselves. Only Luis resumes.
 *   EVENTS       Klaviyo's email events (sent, opened, clicked, bounced, spam,
 *                unsubscribed) for the five nurture flows only — never the
 *                newsletter, never bot clicks.
 *   PREVIEWS     What each flow will send, read from Klaviyo's own definition.
 *   REPORTS      What each programme produced: reach, opens, clicks, replies,
 *                and deals started within 90 days.
 */

import { PROGRAMS, PROGRAM_KEYS, type ProgramKey } from "./nurture";

/* ------------------------------------------------------------------ time */

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** New York calendar day ("2026-09-28"), weekday (0 = Sunday) and minutes since midnight. */
export function nyClock(now: Date): { day: string; weekday: number; minutes: number } {
  const parts = Object.fromEntries(NY.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * Releases happen on weekday mornings, New York time, so a person's first
 * email lands when an investor is at a desk — the same 9:30 the flows' own
 * waits use for every later email.
 */
export const RELEASE_OPENS_MIN = 9 * 60 + 30;
export const RELEASE_CLOSES_MIN = 12 * 60;

export function inReleaseWindow(now: Date): boolean {
  const c = nyClock(now);
  return c.weekday >= 1 && c.weekday <= 5 && c.minutes >= RELEASE_OPENS_MIN && c.minutes < RELEASE_CLOSES_MIN;
}

/** "now", "today at 9:30am", "tomorrow at 9:30am" or "Monday at 9:30am". */
export function nextReleaseLabel(now: Date): string {
  if (inReleaseWindow(now)) return "now";
  const c = nyClock(now);
  const weekday = (d: number) => d >= 1 && d <= 5;
  if (weekday(c.weekday) && c.minutes < RELEASE_OPENS_MIN) return "today at 9:30am";
  for (let i = 1; i <= 7; i++) {
    const d = (c.weekday + i) % 7;
    if (weekday(d)) return i === 1 ? "tomorrow at 9:30am" : `${DAY_NAMES[d]} at 9:30am`;
  }
  return "the next weekday at 9:30am";
}

/* --------------------------------------------------------------- warm-up */

/**
 * People released per sending day, across all five programmes together (the
 * reputation being protected is the domain's, not a list's). Day 1 is the
 * first day anything is released; a day with no release does not advance the
 * ramp; 30 days with no release starts it again. Each release is one email
 * today plus the flow's later emails, so real volume runs about 1.5× this.
 */
export const WARMUP_RAMP = [20, 30, 40, 60, 80, 100, 125, 150] as const;
export const STEADY_DAILY_CAP = 200;
/** The window `priorReleaseDays` is counted over. */
export const WARMUP_MEMORY_DAYS = 30;

/** `priorReleaseDays` = distinct New York days with a release in the last 30 days, not counting today. */
export function dailyCap(priorReleaseDays: number): number {
  const n = Math.max(0, Math.floor(priorReleaseDays));
  return n < WARMUP_RAMP.length ? WARMUP_RAMP[n] : STEADY_DAILY_CAP;
}

export function warmupStatus(priorReleaseDays: number): { day: number; of: number; cap: number; warming: boolean } {
  const n = Math.max(0, Math.floor(priorReleaseDays));
  return { day: n + 1, of: WARMUP_RAMP.length, cap: dailyCap(n), warming: n < WARMUP_RAMP.length };
}

/* ------------------------------------------------------------- flow live */

/** Klaviyo's flow statuses. "manual" means sends wait for someone to approve them in Klaviyo. */
export type FlowStatus = "draft" | "manual" | "live";

/** A cached status older than this is not trusted to release anyone. */
export const FLOW_FRESH_MINUTES = 60;

export function flowIsLive(status: string | null | undefined, checkedAt: string | null | undefined, now: Date): boolean {
  if (status !== "live" || !checkedAt) return false;
  const t = Date.parse(checkedAt);
  return Number.isFinite(t) && now.getTime() - t <= FLOW_FRESH_MINUTES * 60_000 && t <= now.getTime() + 60_000;
}

/* --------------------------------------------------------------- release */

export type QueuedLite = { id: string; program: string; enrolledAt: string | null };

export type ReleaseBlock = "paused" | "outside_window" | "nothing_queued" | "no_live_flow" | "cap_reached";

export type ReleasePlan = { ids: string[]; cap: number; left: number; blocked: ReleaseBlock | null };

const PRIORITY = new Map<string, number>(PROGRAM_KEYS.map((k, i) => [k, i]));

/**
 * Who goes to Klaviyo in this run. Order: programme priority (the warmest
 * relationships first — past borrowers, then BiggerPockets, quiet, lost,
 * contacts), then longest-waiting first. The daily cap is shared.
 */
export function planRelease(i: {
  queued: QueuedLite[];
  now: Date;
  paused: boolean;
  livePrograms: ReadonlySet<string>;
  releasedToday: number;
  priorReleaseDays: number;
}): ReleasePlan {
  const cap = dailyCap(i.priorReleaseDays);
  const left = Math.max(0, cap - Math.max(0, i.releasedToday));
  const out = (blocked: ReleaseBlock | null, ids: string[] = []): ReleasePlan => ({ ids, cap, left, blocked });
  if (i.paused) return out("paused");
  if (!inReleaseWindow(i.now)) return out("outside_window");
  if (i.queued.length === 0) return out("nothing_queued");
  const eligible = i.queued.filter((q) => PRIORITY.has(q.program) && i.livePrograms.has(q.program));
  if (eligible.length === 0) return out("no_live_flow");
  if (left === 0) return out("cap_reached");
  const t = (s: string | null) => { const v = s ? Date.parse(s) : NaN; return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER; };
  const sorted = [...eligible].sort((a, b) =>
    (PRIORITY.get(a.program)! - PRIORITY.get(b.program)!) || (t(a.enrolledAt) - t(b.enrolledAt)) || a.id.localeCompare(b.id));
  return out(null, sorted.slice(0, left).map((q) => q.id));
}

export const RELEASE_BLOCK_LABEL: Record<ReleaseBlock, string> = {
  paused: "Sending is paused",
  outside_window: "Waiting for the next weekday morning",
  nothing_queued: "Nobody is waiting",
  no_live_flow: "The emails for these programmes are switched off",
  cap_reached: "Today's warm-up limit is reached",
};

/* ---------------------------------------------------------- deliverability */

/**
 * The lines mailbox providers hold senders to. Google and Yahoo's bulk-sender
 * rules ask for spam complaints under 0.1% and never 0.3%; a bounce rate over
 * 2% says the list has dead addresses in it. Measured over the last 7 days of
 * nurture sends only. Small samples use absolute counts instead of rates, so
 * one bounce in the first ten emails does not stop everything, but five does.
 */
export const HEALTH_DAYS = 7;
export const HEALTH_MIN_SAMPLE = 25;
export const BOUNCE_WATCH = 0.01;
export const BOUNCE_STOP = 0.02;
export const SPAM_WATCH = 0.001;
export const SPAM_STOP = 0.003;
export const SMALL_SAMPLE_BOUNCE_STOP = 5;
export const SMALL_SAMPLE_SPAM_STOP = 2;

export type HealthCounts = { sent: number; bounce: number; spam: number; unsub: number };
export type Health = HealthCounts & {
  bounceRate: number | null;
  spamRate: number | null;
  level: "ok" | "watch" | "stop";
  reason: string | null;
};

const pctText = (r: number) => `${(Math.round(r * 1000) / 10).toFixed(1)}%`;

export function deliverability(c: HealthCounts): Health {
  const sent = Math.max(0, c.sent);
  const bounceRate = sent > 0 ? c.bounce / sent : null;
  const spamRate = sent > 0 ? c.spam / sent : null;
  const base = { ...c, sent, bounceRate, spamRate };
  if (sent >= HEALTH_MIN_SAMPLE) {
    if (spamRate! > SPAM_STOP) return { ...base, level: "stop", reason: `Spam complaints at ${pctText(spamRate!)} of emails in the last ${HEALTH_DAYS} days (the line is 0.3%).` };
    if (bounceRate! > BOUNCE_STOP) return { ...base, level: "stop", reason: `Bounces at ${pctText(bounceRate!)} of emails in the last ${HEALTH_DAYS} days (the line is 2%).` };
  }
  if (c.spam >= SMALL_SAMPLE_SPAM_STOP) return { ...base, level: "stop", reason: `${c.spam} spam complaints in the last ${HEALTH_DAYS} days.` };
  if (c.bounce >= SMALL_SAMPLE_BOUNCE_STOP && (sent < HEALTH_MIN_SAMPLE || bounceRate! > BOUNCE_STOP)) {
    return { ...base, level: "stop", reason: `${c.bounce} bounced emails in the last ${HEALTH_DAYS} days.` };
  }
  if (sent >= HEALTH_MIN_SAMPLE && (spamRate! > SPAM_WATCH || bounceRate! > BOUNCE_WATCH)) {
    return { ...base, level: "watch", reason: "Bounces or complaints are above normal. Keep an eye on it." };
  }
  if (c.spam > 0) return { ...base, level: "watch", reason: "One spam complaint this week." };
  return { ...base, level: "ok", reason: null };
}

/* ---------------------------------------------------------------- events */

export type EventKind = "sent" | "open" | "click" | "bounce" | "spam" | "unsub";

/**
 * Funded Capital's Klaviyo metric ids (account-specific, not secrets).
 * Read 28 Sep 2026 from the account's metric list.
 */
export const EVENT_METRICS: readonly { kind: EventKind; metricId: string }[] = [
  { kind: "sent", metricId: "TFGnUW" },   // Received Email
  { kind: "open", metricId: "Vu8grr" },   // Opened Email
  { kind: "click", metricId: "Xgy9VU" },  // Clicked Email
  { kind: "bounce", metricId: "UR7dNN" }, // Bounced Email
  { kind: "spam", metricId: "T4Fkij" },   // Marked Email as Spam
  { kind: "unsub", metricId: "WNcfWu" },  // Unsubscribed from Email Marketing
];

export const EVENT_LABEL: Record<EventKind, string> = {
  sent: "Emailed",
  open: "Opened",
  click: "Clicked",
  bounce: "Bounced",
  spam: "Marked as spam",
  unsub: "Unsubscribed",
};

export type KlaviyoEventLite = { id: string; datetime: string | null; profileId: string | null; properties: Record<string, unknown> };

export type NurtureEventIn = {
  klaviyoEventId: string;
  kind: EventKind;
  program: ProgramKey;
  profileId: string;
  flowMessageId: string | null;
  subject: string | null;
  url: string | null;
  occurredAt: string;
};

const FLOW_TO_PROGRAM = new Map<string, ProgramKey>(PROGRAMS.map((p) => [p.klaviyoFlowId, p.key]));
/** A click on the unsubscribe or preferences link is not interest. */
const NOT_INTEREST = /unsubscribe|opt[-_ ]?out|preferences/i;

const textOf = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/**
 * One Klaviyo event → one nurture event, or null when it is not ours to keep:
 * not from one of the five nurture flows (the newsletter, a campaign, a
 * preview), a bot or security-scanner click, a click on the unsubscribe link,
 * an automatic "open" by Apple Mail's privacy proxy, or missing its person.
 */
export function toNurtureEvent(kind: EventKind, e: KlaviyoEventLite): NurtureEventIn | null {
  const p = e.properties ?? {};
  const program = FLOW_TO_PROGRAM.get(String(p["$flow"] ?? ""));
  if (!program || !e.id || !e.profileId) return null;
  const at = e.datetime ? Date.parse(e.datetime) : NaN;
  if (!Number.isFinite(at)) return null;
  if (kind === "click") {
    if (p["Bot Click"] === true || p["Bot Click"] === "true") return null;
    if (typeof p["URL"] === "string" && NOT_INTEREST.test(p["URL"])) return null;
  }
  if (kind === "open" && (p["Machine Open"] === true || p["$machine_open"] === true)) return null;
  return {
    klaviyoEventId: e.id,
    kind,
    program,
    profileId: e.profileId,
    flowMessageId: textOf(p["$message"], 64),
    subject: textOf(p["Subject"], 200),
    url: kind === "click" ? textOf(p["URL"], 500) : null,
    occurredAt: new Date(at).toISOString(),
  };
}

/** Re-read this much before the last cursor: Klaviyo can record an event a little after it happened. */
export const EVENT_OVERLAP_MINUTES = 120;
export const EVENT_FIRST_READ_DAYS = 30;
export const EVENT_MAX_LOOKBACK_DAYS = 60;

/** Where this run's read of Klaviyo events starts. */
export function eventsFrom(cursor: string | null, now: Date): Date {
  const floor = now.getTime() - EVENT_MAX_LOOKBACK_DAYS * 86_400_000;
  const c = cursor ? Date.parse(cursor) : NaN;
  if (!Number.isFinite(c)) return new Date(now.getTime() - EVENT_FIRST_READ_DAYS * 86_400_000);
  return new Date(Math.max(floor, Math.min(c, now.getTime()) - EVENT_OVERLAP_MINUTES * 60_000));
}

/* ----------------------------------------------------- flows and previews */

export type FlowEmail = {
  /** Klaviyo's flow message id — also what "$message" carries on its events. */
  messageId: string;
  name: string;
  subject: string;
  previewText: string;
  templateId: string | null;
  status: string;
  /** Days after joining that this email goes out (0 = straight away). */
  afterDays: number;
  /** Rendered preview (Klaviyo's own renderer, sample name "Alex"), when fetched. */
  html?: string | null;
};

export type FlowSnapshot = {
  flowId: string;
  name: string;
  status: string;
  /** Triggered by "Added to list" for this programme's list. */
  triggeredByList: boolean;
  /** Filters on "is in <this list>", so removing someone stops their emails. */
  filtersOnList: boolean;
  emails: FlowEmail[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string => (typeof v === "string" ? v : "");

const UNIT_DAYS: Record<string, number> = { minutes: 1 / 1440, hours: 1 / 24, days: 1, weeks: 7 };

/**
 * Klaviyo's flow (GET /api/flows/{id}?additional-fields[flow]=definition) →
 * what the page shows. Walks the actions from the entry action along each
 * `next` link, so the emails come out in send order with the waits between
 * them added up. Branches are not used by these flows; a conditional split
 * would be followed down its "true" side only. Null when the answer is not a
 * flow at all.
 */
export function parseFlow(json: unknown, expect: { flowId: string; listId: string }): FlowSnapshot | null {
  const data = obj(obj(json).data);
  if (data.type !== "flow" || data.id !== expect.flowId) return null;
  const attrs = obj(data.attributes);
  const def = obj(attrs.definition);
  const actions = new Map<string, Obj>();
  for (const a of list(def.actions)) {
    const o = obj(a);
    if (o.id !== undefined) actions.set(String(o.id), o);
  }
  const emails: FlowEmail[] = [];
  let days = 0;
  let cursor: string | null = def.entry_action_id !== undefined && def.entry_action_id !== null ? String(def.entry_action_id) : null;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor) && seen.size < 100) {
    seen.add(cursor);
    const a = actions.get(cursor);
    if (!a) break;
    const d = obj(a.data);
    if (a.type === "time-delay") {
      const v = Number(d.value);
      if (Number.isFinite(v) && v > 0) days += v * (UNIT_DAYS[s(d.unit)] ?? 1);
    } else if (a.type === "send-email") {
      const m = obj(d.message);
      emails.push({
        messageId: s(m.id),
        name: s(m.name),
        subject: s(m.subject_line),
        previewText: s(m.preview_text),
        templateId: s(m.template_id) || null,
        status: s(d.status),
        afterDays: Math.round(days * 10) / 10,
      });
    }
    const links = obj(a.links);
    const next = links.next ?? links.next_if_true ?? null;
    cursor = next === null || next === undefined ? null : String(next);
  }
  const triggers = list(def.triggers).map(obj);
  const conditions = list(obj(def.profile_filter).condition_groups).flatMap((g) => list(obj(g).conditions)).map(obj);
  return {
    flowId: expect.flowId,
    name: s(attrs.name),
    status: s(attrs.status),
    triggeredByList: triggers.some((t) => t.type === "list" && t.id === expect.listId),
    filtersOnList: conditions.some((c) =>
      c.type === "profile-group-membership" && c.is_member === true && list(c.group_ids).includes(expect.listId)),
    emails,
  };
}

/** What is wrong with a flow that would make switching it on unsafe or pointless. Empty = fine. */
export function flowProblems(snap: FlowSnapshot | null): string[] {
  if (!snap) return ["Lending OS hasn't been able to read this flow from Klaviyo yet."];
  const out: string[] = [];
  if (!snap.triggeredByList) out.push("The flow is no longer started by this programme's list, so nobody Lending OS adds would get it.");
  if (!snap.filtersOnList) out.push("The flow no longer checks the person is still on the list, so taking someone out would not stop their emails.");
  if (snap.emails.length === 0) out.push("The flow has no emails in it.");
  return out;
}

/** Keep previews already rendered for templates that have not changed. */
export function carryPreviews(prev: FlowSnapshot | null, next: FlowSnapshot): FlowSnapshot {
  const byTemplate = new Map((prev?.emails ?? []).filter((e) => e.templateId && e.html).map((e) => [e.templateId!, e.html!]));
  return { ...next, emails: next.emails.map((e) => ({ ...e, html: e.templateId ? byTemplate.get(e.templateId) ?? null : null })) };
}

export const PREVIEW_MAX_AGE_HOURS = 24;

/** Re-render when an email has no preview, or the previews are a day old (a template edited in Klaviyo). */
export function previewsStale(snap: FlowSnapshot | null, renderedAt: string | null, now: Date): boolean {
  if (!snap || snap.emails.length === 0) return false;
  if (snap.emails.some((e) => e.templateId && !e.html)) return true;
  const t = renderedAt ? Date.parse(renderedAt) : NaN;
  return !Number.isFinite(t) || now.getTime() - t > PREVIEW_MAX_AGE_HOURS * 3_600_000;
}

/** The sample person every preview is rendered for. */
export const PREVIEW_CONTEXT = { first_name: "Alex", last_name: "Rivera", person: { first_name: "Alex", last_name: "Rivera" } } as const;

/** A flow snapshot read back from the database; null for anything that is not one. */
export function snapshotOf(v: unknown): FlowSnapshot | null {
  let x: unknown = v;
  if (typeof x === "string") { try { x = JSON.parse(x); } catch { return null; } }
  const o = obj(x);
  if (typeof o.flowId !== "string" || !Array.isArray(o.emails)) return null;
  return {
    flowId: o.flowId,
    name: s(o.name),
    status: s(o.status),
    triggeredByList: o.triggeredByList === true,
    filtersOnList: o.filtersOnList === true,
    emails: o.emails.map(obj).map((e) => ({
      messageId: s(e.messageId), name: s(e.name), subject: s(e.subject), previewText: s(e.previewText),
      templateId: s(e.templateId) || null, status: s(e.status),
      afterDays: Number.isFinite(Number(e.afterDays)) ? Number(e.afterDays) : 0,
      html: typeof e.html === "string" ? e.html : null,
    })),
  };
}

export function afterLabel(days: number): string {
  if (days <= 0) return "Straight away";
  const d = Math.round(days);
  return `Day ${d}`;
}

/* ------------------------------------------------------------------ mode */

export type Mode = "review" | "auto";

export function parseMode(v: unknown): Mode | null {
  return v === "review" || v === "auto" ? v : null;
}

export const MODE_LABEL: Record<Mode, string> = { auto: "Automatic", review: "You choose" };

/* --------------------------------------------------------------- reports */

export type NurtureReportRow = {
  program: string;
  releasedAt: string | null;
  status: "active" | "stopped";
  stopReason: string | null;
  sent: number;
  opened: number;
  clicked: number;
  /** An enquiry arrived within 90 days of release. */
  dealWithin90: boolean;
};

export type NurtureReportLine = {
  key: ProgramKey | "all";
  name: string;
  released: number;
  reached: number;
  openPct: number | null;
  clickPct: number | null;
  replied: number;
  deals: number;
  unsubscribed: number;
  bounced: number;
};

const pctOf = (n: number, of: number): number | null => (of > 0 ? Math.round((n / of) * 100) : null);

/**
 * Per programme, for people RELEASED to Klaviyo in the window — a cohort, so
 * every rate divides people by the same people. Opens and clicks are "at
 * least one", per person, of those who were sent at least one email.
 */
export function nurtureReport(rows: NurtureReportRow[], w: { start: number | null; end: number }): { lines: NurtureReportLine[]; total: NurtureReportLine | null } {
  const inW = (iso: string | null) => {
    const v = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(v) && v <= w.end && (w.start === null || v >= w.start);
  };
  const cohort = rows.filter((r) => inW(r.releasedAt));
  const line = (key: ProgramKey | "all", name: string, rs: NurtureReportRow[]): NurtureReportLine => {
    const reached = rs.filter((r) => r.sent > 0);
    return {
      key, name,
      released: rs.length,
      reached: reached.length,
      openPct: pctOf(reached.filter((r) => r.opened > 0).length, reached.length),
      clickPct: pctOf(reached.filter((r) => r.clicked > 0).length, reached.length),
      replied: rs.filter((r) => r.stopReason === "replied").length,
      deals: rs.filter((r) => r.dealWithin90).length,
      unsubscribed: rs.filter((r) => r.stopReason === "unsubscribed").length,
      bounced: rs.filter((r) => r.stopReason === "bounced").length,
    };
  };
  const lines = PROGRAMS.map((p) => line(p.key, p.name, cohort.filter((r) => r.program === p.key)));
  return { lines, total: cohort.length ? line("all", "All programmes", cohort) : null };
}


/** A stored Klaviyo error that means the API key lacks a permission (the client's wording, klaviyo.server.ts). */
export const isPermissionError = (error: string | null | undefined) => typeof error === "string" && /refused the API key/.test(error);

/* --------------------------------------- unsubscribes from anyone (30 Sep) */

/**
 * Klaviyo unsubscribes and spam complaints, for EVERYONE in Klaviyo — not only
 * people Lending OS put in a programme. Before this, someone who unsubscribed
 * from an old newsletter could still be emailed from the record card, because
 * the mirror only read the five programme lists. Consent still flows one way
 * only: this can set `email_subscribed = false`, never true.
 */
export const OPT_OUT_METRICS: readonly { kind: "unsub" | "spam"; metricId: string }[] = EVENT_METRICS
  .filter((m): m is { kind: "unsub" | "spam"; metricId: string } => m.kind === "unsub" || m.kind === "spam");

/** The first read goes back far enough to catch the newsletter years. */
export const OPT_OUT_FIRST_READ_DAYS = 800;

export function optOutsFrom(cursor: string | null, now: Date): Date {
  const c = cursor ? Date.parse(cursor) : NaN;
  if (!Number.isFinite(c)) return new Date(now.getTime() - OPT_OUT_FIRST_READ_DAYS * 86_400_000);
  return new Date(Math.min(c, now.getTime()) - EVENT_OVERLAP_MINUTES * 60_000);
}

/** Lower-cased, de-duplicated, plausible addresses. Anything odd is skipped, never guessed at. */
export function optOutEmails(events: readonly { email?: string | null }[]): string[] {
  const out = new Set<string>();
  for (const e of events) {
    const v = (e.email ?? "").trim().toLowerCase();
    if (v.length <= 254 && /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[a-z]{2,}$/.test(v)) out.add(v);
  }
  return [...out].sort();
}
