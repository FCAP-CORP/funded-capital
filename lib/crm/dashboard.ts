/**
 * The numbers on the dashboard, and the rule for what lands in the work queue.
 *
 * PURE. No database, no React, no clock of its own — `now` is always a
 * parameter. Every rule here is covered by `dashboard.regress.ts`, because the
 * failure mode of a work queue is not a crash: it is a confident, tidy list
 * that omits the borrower who has been waiting three weeks.
 *
 * THE QUEUE IS THE POINT, NOT THE CHARTS. A number saying "84 stalled" changes
 * nothing about today. A list saying "these five people are waiting, longest
 * first" is a morning's work. The KPIs are context above it, deliberately
 * smaller than the list underneath.
 */

import { STAGE_ORDER, daysSince } from "./view";

/* ------------------------------------------------------------------ stages */

/**
 * Nothing more will happen on these. Matches the Pipeline page's definition of
 * "open" exactly — `NOT IN ('closed_lost','payoff')` — so the two screens can
 * never disagree about how many files are open.
 */
export const TERMINAL_STAGES: ReadonlySet<string> = new Set(["closed_lost", "payoff"]);

/**
 * The money is out. These deals are being SERVICED, not sold.
 *
 * They are open, and they belong in the open count, but they must never appear
 * in the work queue: a funded loan sitting quietly in `active` for ninety days
 * is a performing loan, not a neglected lead. Without this distinction the
 * queue would fill with successes and bury the actual work — which is how a
 * "needs attention" list gets ignored after a week.
 */
export const SERVICING_STAGES: ReadonlySet<string> = new Set([
  "funded", "active", "draw_cycle", "extension",
]);

/** Still in the pipeline. The Pipeline page's count. */
export function isOpen(stage: string): boolean {
  return !TERMINAL_STAGES.has(stage);
}

/** Still being SOLD — pre-funding and not dead. Only these can enter the queue. */
export function needsWork(stage: string): boolean {
  return isOpen(stage) && !SERVICING_STAGES.has(stage);
}

/* ------------------------------------------------------------------- input */

/**
 * One application, reduced to only the fields a dashboard decision reads.
 *
 * Narrow on purpose. A wider type invites a future rule to reach for a field
 * whose meaning lives somewhere else — `broker_firm_id` above all, which is a
 * SCOPING field and belongs only to `lib/broker/scope.ts`.
 */
export interface DashboardApplication {
  id: string;
  stage: string;
  /** When it entered its current stage. The staleness clock. */
  stageEnteredAt: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  requestedAmount: string | null;
  contactId: string | null;
  name: string;
  email: string | null;

  /**
   * When it funded.
   *
   * The caller passes COALESCE(applications.funded_at, the first
   * stage_transitions row into 'funded'). Both exist, and neither is reliably
   * populated on its own: legacy rows migrated from the spreadsheet carry a
   * date with no transition history, and a deal moved through the UI writes a
   * transition. Preferring one silently would undercount whichever half of the
   * book it does not cover — and an undercount on this number looks exactly
   * like a bad month.
   */
  fundedAt: string | null;
  /** When it was decided one way or the other. Used for the lost count. */
  decisionedAt: string | null;
  termSheetIssuedAt: string | null;
  termSheetSignedAt: string | null;

  /** Newest email either way, and which way. Null means never contacted. */
  lastContactAt: string | null;
  lastContactDirection: string | null;

  /** When this deal should surface again. Null means it is not snoozed. */
  nextActionAt: string | null;
  /** When that decision was taken. Inbound contact after this beats the snooze. */
  nextActionSetAt: string | null;
  /** Why it was put down, shown when it comes back. */
  nextActionNote: string | null;
}

const amount = (v: string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const time = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/* -------------------------------------------------------------------- KPIs */

export interface Rollup {
  count: number;
  amount: number;
}

export interface DashboardKpis {
  fundedYtd: Rollup;
  fundedThisMonth: Rollup;
  submittedThisMonth: number;
  lostThisMonth: number;
  openCount: number;
  /** REQUESTED, not funded. Never label this "volume" — nothing here has closed. */
  openRequested: number;
}

/** UTC month and year boundaries, matching `daysSince`'s UTC-day convention. */
function startOfMonthUtc(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}
function startOfYearUtc(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), 0, 1);
}

function rollup(apps: DashboardApplication[], since: number, now: Date): Rollup {
  const end = now.getTime();
  let count = 0, total = 0;
  for (const a of apps) {
    const t = time(a.fundedAt);
    // A funded date in the future is a typo, not a forecast — excluded, so one
    // fat-fingered year cannot inflate the headline number.
    if (t === null || t < since || t > end) continue;
    count++;
    total += amount(a.requestedAmount);
  }
  return { count, amount: total };
}

export function computeKpis(apps: DashboardApplication[], now: Date = new Date()): DashboardKpis {
  const monthStart = startOfMonthUtc(now);
  const yearStart = startOfYearUtc(now);
  const end = now.getTime();

  const open = apps.filter((a) => isOpen(a.stage));

  let submittedThisMonth = 0;
  let lostThisMonth = 0;
  for (const a of apps) {
    const s = time(a.submittedAt) ?? time(a.createdAt);
    if (s !== null && s >= monthStart && s <= end) submittedThisMonth++;

    if (a.stage === "closed_lost") {
      const d = time(a.decisionedAt);
      if (d !== null && d >= monthStart && d <= end) lostThisMonth++;
    }
  }

  return {
    fundedYtd: rollup(apps, yearStart, now),
    fundedThisMonth: rollup(apps, monthStart, now),
    submittedThisMonth,
    lostThisMonth,
    openCount: open.length,
    openRequested: open.reduce((sum, a) => sum + amount(a.requestedAmount), 0),
  };
}

/* ------------------------------------------------------------ stage shape */

export interface StageCount {
  stage: string;
  count: number;
  requested: number;
}

/**
 * Every stage in pipeline order, INCLUDING the empty ones.
 *
 * Dropping zeros would hide the most useful thing this chart can say. A book
 * with everything in `lead` and nothing in underwriting is not a chart with
 * missing bars — it is a pipeline that is not moving, and the gap is the
 * finding.
 */
export function stageCounts(apps: DashboardApplication[]): StageCount[] {
  const counts = new Map<string, StageCount>();
  for (const stage of STAGE_ORDER) counts.set(stage, { stage, count: 0, requested: 0 });

  for (const a of apps) {
    // An unknown stage is still counted rather than dropped; a value the UI has
    // no label for is a schema drift bug, and schema-sync.regress.ts is what
    // catches it. Silently discarding the row would hide it from both.
    const row = counts.get(a.stage) ?? { stage: a.stage, count: 0, requested: 0 };
    row.count++;
    row.requested += amount(a.requestedAmount);
    counts.set(a.stage, row);
  }

  return [...counts.values()];
}

/* -------------------------------------------------------------- work queue */

/**
 * Did this contact come FROM the borrower?
 *
 * Deliberately broader than the test `awaiting_reply` uses, which looks only at
 * email. A snooze is a decision made on the information available at the time,
 * so anything the borrower sends afterwards — email or text — is newer
 * information and outranks it. Erring wide here surfaces work; erring narrow
 * buries a person who is actively trying to reach you. Those are not
 * symmetrical mistakes.
 */
export function isInboundDirection(direction: string | null): boolean {
  return typeof direction === "string" && direction.endsWith("_in");
}

export interface SnoozeState {
  /** True when this deal should stay out of the queue right now. */
  snoozed: boolean;
  /** When it returns, if it is snoozed. */
  until: string | null;
  /** Set when a snooze existed but the borrower has since made contact. */
  brokenByInbound: boolean;
}

/**
 * Whether a deal is currently put down, and whether that decision still holds.
 *
 * A snooze is NOT a mute. It says "nothing to do until Thursday" — a claim
 * about the future that stops being true the moment the borrower writes back.
 * Without this, snoozing would be the one action on this screen that can make a
 * live borrower disappear, which is the opposite of what the screen is for.
 */
export function snoozeState(
  app: DashboardApplication,
  now: Date = new Date(),
): SnoozeState {
  const until = time(app.nextActionAt);
  if (until === null) return { snoozed: false, until: null, brokenByInbound: false };

  // Already due, or overdue. Back in the queue on its own merits.
  if (until <= now.getTime()) {
    return { snoozed: false, until: app.nextActionAt, brokenByInbound: false };
  }

  if (isInboundDirection(app.lastContactDirection)) {
    const heard = time(app.lastContactAt);
    const setAt = time(app.nextActionSetAt);
    // No set-at recorded: treat any inbound contact as newer. A row written
    // before this column existed should fail towards surfacing the deal.
    if (heard !== null && (setAt === null || heard > setAt)) {
      return { snoozed: false, until: app.nextActionAt, brokenByInbound: true };
    }
  }

  return { snoozed: true, until: app.nextActionAt, brokenByInbound: false };
}

/**
 * Why something is in the queue, in the order urgency actually runs.
 *
 * `awaiting_reply` is first and it is not a close call. It is the only reason
 * on this list where the other person KNOWS they are being ignored: they wrote,
 * and nothing came back. A stalled record is invisible to the borrower; an
 * unanswered email is not.
 */
export type QueueReason =
  | "awaiting_reply"
  | "term_sheet_cold"
  | "duplicate"
  | "stalled"
  | "never_contacted";

const REASON_RANK: Record<QueueReason, number> = {
  awaiting_reply: 0,
  term_sheet_cold: 1,
  duplicate: 2,
  stalled: 3,
  never_contacted: 4,
};

export const REASON_LABEL: Record<QueueReason, string> = {
  awaiting_reply: "Waiting on you",
  term_sheet_cold: "Term sheet unsigned",
  duplicate: "Possible duplicate",
  stalled: "No movement",
  never_contacted: "Never contacted",
};

export interface QueueThresholds {
  /** Days an inbound email may sit unanswered before it is work. */
  awaitingReplyDays: number;
  /** Days a term sheet may sit unsigned before it needs chasing. */
  termSheetColdDays: number;
  /** Days in one stage before a deal is stalled. */
  stalledDays: number;
  /** Two applications for one contact filed this close together are a double-submit. */
  duplicateWindowDays: number;
}

export const QUEUE_DEFAULTS: QueueThresholds = {
  awaitingReplyDays: 2,
  termSheetColdDays: 7,
  stalledDays: 30,
  duplicateWindowDays: 7,
};

export interface QueueItem {
  applicationId: string;
  contactId: string | null;
  name: string;
  email: string | null;
  stage: string;
  reason: QueueReason;
  /** How long the triggering condition has been true, in whole days. */
  waitingDays: number;
  requestedAmount: string | null;
}

/**
 * Which contacts have filed two workable applications close together.
 *
 * NOT simply "two open applications". A repeat investor with a per-project LLC
 * legitimately runs several deals at once — that is the borrower this company
 * wants most, and flagging them as a data problem every morning would train
 * whoever reads this screen to ignore it. A double-submit looks different: the
 * same person, twice, within days, usually because a form was submitted twice
 * or a lead arrived down two channels.
 */
function duplicateContactIds(
  apps: DashboardApplication[],
  windowDays: number,
): Set<string> {
  const byContact = new Map<string, number[]>();
  for (const a of apps) {
    if (!a.contactId || !needsWork(a.stage)) continue;
    const t = time(a.submittedAt) ?? time(a.createdAt);
    if (t === null) continue;
    const list = byContact.get(a.contactId) ?? [];
    list.push(t);
    byContact.set(a.contactId, list);
  }

  const windowMs = windowDays * 86_400_000;
  const dupes = new Set<string>();
  for (const [contactId, times] of byContact) {
    if (times.length < 2) continue;
    const sorted = [...times].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] <= windowMs) {
        dupes.add(contactId);
        break;
      }
    }
  }
  return dupes;
}

/**
 * The single most urgent reason this application needs attention, or null.
 *
 * ONE REASON PER DEAL, not all of them. A deal that is stalled AND never
 * contacted AND a duplicate is one phone call, and listing it three times would
 * reproduce the exact problem this screen exists to solve — a long list nobody
 * can act on. The most urgent reason wins and the rest are implied by it.
 */
export function queueReasonFor(
  app: DashboardApplication,
  opts: { thresholds: QueueThresholds; duplicateContacts: ReadonlySet<string> },
  now: Date = new Date(),
): { reason: QueueReason; waitingDays: number } | null {
  if (!needsWork(app.stage)) return null;
  if (snoozeState(app, now).snoozed) return null;

  const { thresholds: th } = opts;

  // 1. They wrote to us and nothing went back.
  if (app.lastContactDirection === "email_in") {
    const d = daysSince(app.lastContactAt, now);
    if (d !== null && d >= th.awaitingReplyDays) return { reason: "awaiting_reply", waitingDays: d };
  }

  // 2. A term sheet is out and unsigned. The deal is live and going cold.
  if (app.termSheetIssuedAt && !app.termSheetSignedAt) {
    const d = daysSince(app.termSheetIssuedAt, now);
    if (d !== null && d >= th.termSheetColdDays) return { reason: "term_sheet_cold", waitingDays: d };
  }

  // 3. The same person, filed twice, days apart.
  if (app.contactId && opts.duplicateContacts.has(app.contactId)) {
    const d = daysSince(app.submittedAt ?? app.createdAt, now) ?? 0;
    return { reason: "duplicate", waitingDays: d };
  }

  // 4. Nobody has ever emailed them, in either direction.
  if (!app.lastContactAt) {
    const d = daysSince(app.submittedAt ?? app.createdAt, now) ?? 0;
    return { reason: "never_contacted", waitingDays: d };
  }

  // 5. Sitting in one stage too long.
  const stalled = daysSince(app.stageEnteredAt, now);
  if (stalled !== null && stalled >= th.stalledDays) return { reason: "stalled", waitingDays: stalled };

  return null;
}

/**
 * The queue, most urgent first.
 *
 * Sorted by reason, then by how long they have been waiting, then by name so
 * the order is fully deterministic — a list that reshuffles between reloads is
 * a list you lose your place in.
 */
export function buildWorkQueue(
  apps: DashboardApplication[],
  thresholds: QueueThresholds = QUEUE_DEFAULTS,
  now: Date = new Date(),
): QueueItem[] {
  const duplicateContacts = duplicateContactIds(apps, thresholds.duplicateWindowDays);

  const items: QueueItem[] = [];
  for (const app of apps) {
    const hit = queueReasonFor(app, { thresholds, duplicateContacts }, now);
    if (!hit) continue;
    items.push({
      applicationId: app.id,
      contactId: app.contactId,
      name: app.name,
      email: app.email,
      stage: app.stage,
      reason: hit.reason,
      waitingDays: hit.waitingDays,
      requestedAmount: app.requestedAmount,
    });
  }

  return items.sort((a, b) => {
    const r = REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (r !== 0) return r;
    if (a.waitingDays !== b.waitingDays) return b.waitingDays - a.waitingDays;
    return a.name.localeCompare(b.name);
  });
}

/** How many of each reason, for the summary strip above the list. */
export function queueSummary(items: QueueItem[]): { reason: QueueReason; count: number }[] {
  const order: QueueReason[] = ["awaiting_reply", "term_sheet_cold", "duplicate", "stalled", "never_contacted"];
  return order.map((reason) => ({ reason, count: items.filter((i) => i.reason === reason).length }));
}

/* ------------------------------------------------------------------ */
/* Snoozed work — visible, never hidden                                */
/* ------------------------------------------------------------------ */

export interface SnoozedItem {
  applicationId: string;
  contactId: string | null;
  name: string;
  stage: string;
  /** When it comes back. */
  until: string;
  note: string | null;
}

/**
 * Everything currently put down, soonest to return first.
 *
 * This exists so the dashboard can SAY how much is snoozed. A queue that can be
 * emptied by snoozing, with no count of what was snoozed, is a queue that
 * rewards hiding work — and this company already has one of those: 49 LinkedIn
 * drafts with a single post to show for them. The number goes on the screen.
 */
export function snoozedItems(
  apps: DashboardApplication[],
  now: Date = new Date(),
): SnoozedItem[] {
  const out: SnoozedItem[] = [];
  for (const app of apps) {
    if (!needsWork(app.stage)) continue;
    const s = snoozeState(app, now);
    if (!s.snoozed || !s.until) continue;
    out.push({
      applicationId: app.id,
      contactId: app.contactId,
      name: app.name,
      stage: app.stage,
      until: s.until,
      note: app.nextActionNote,
    });
  }
  return out.sort((a, b) => {
    const t = (time(a.until) ?? 0) - (time(b.until) ?? 0);
    return t !== 0 ? t : a.name.localeCompare(b.name);
  });
}

/**
 * Deals whose snooze was overruled because the borrower got in touch.
 *
 * Worth naming separately on the screen. "You put this down and then they
 * wrote" is a different and more urgent fact than "this came back on schedule".
 */
export function snoozesBrokenByInbound(
  apps: DashboardApplication[],
  now: Date = new Date(),
): string[] {
  return apps
    .filter((a) => needsWork(a.stage) && snoozeState(a, now).brokenByInbound)
    .map((a) => a.id);
}
