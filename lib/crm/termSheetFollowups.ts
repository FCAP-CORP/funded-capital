/**
 * Term-sheet follow-ups — when a borrower has a term sheet and has gone quiet,
 * which personal email is due next, and when the series stops.
 *
 * PURE. No database, no clock except the `now` passed in. Pinned by
 * termSheetFollowups.regress.ts.
 *
 * WHY THIS EXISTS. A borrower holding a term sheet is the closest thing to a
 * funded loan in the book, and nothing followed up with them on its own: the
 * website drips cover the first two weeks of a new lead, Klaviyo covers people
 * quiet for a month, and a deal at term sheet fell between the two.
 *
 * LUIS APPROVES EACH ONE. Nothing here sends. The dashboard shows the emails
 * that are due, already written; Luis reads, edits if he wants, and presses
 * Send, which goes through the record card's Gmail executor (consent gate,
 * idempotency, signature, timeline) like any other email.
 *
 * THE SERIES, measured from the day the deal last ENTERED term_sheet_issued (so
 * a re-issued term sheet starts again):
 *
 *   ts-1  day 2   did it arrive, any questions
 *   ts-2  day 5   anything to adjust
 *   ts-3  day 10  still moving forward
 *   ts-4  day 17  closing the loop
 *
 * and never sooner than MIN_GAP_DAYS after the last time Luis reached out in
 * any way (email, text or call), so a call on Monday pushes Tuesday's email
 * back rather than stacking on top of it.
 *
 * IT STOPS WHEN: the deal leaves term_sheet_issued (signed, lost, anything);
 * the borrower writes or texts back; Luis presses "Stop follow-ups"; the
 * address is missing or unsubscribed; or all four have been sent.
 *
 * CATCH-UP, NOT REPLAY (1 Oct 2026). A missed step is skipped: a term sheet
 * that is 12 days old with nothing sent gets ts-3 ("still moving forward?"),
 * never ts-1 ("did it arrive?") a week and a half late.
 *
 * OLD TERM SHEETS GET ONE CHECK-IN, NOT THE SERIES (1 Oct 2026). Past
 * SERIES_WINDOW_DAYS the deal on that term sheet has almost certainly closed
 * elsewhere or died — Luis's first live look showed a 172-day-old term sheet
 * from the old CRM offered "making sure the term sheet reached you". Those
 * deals get a single "ts-checkin" ("how did it turn out, anything new?"),
 * listed after the live series, newest first, and nothing after it. If the
 * series already reached ts-4 ("closing the loop"), there is no check-in.
 */

export type FollowupStep = {
  step: 1 | 2 | 3 | 4 | 5;
  templateKey: "ts-1" | "ts-2" | "ts-3" | "ts-4" | "ts-checkin";
  afterDays: number;
};

export const TS_SERIES: readonly FollowupStep[] = [
  { step: 1, templateKey: "ts-1", afterDays: 2 },
  { step: 2, templateKey: "ts-2", afterDays: 5 },
  { step: 3, templateKey: "ts-3", afterDays: 10 },
  { step: 4, templateKey: "ts-4", afterDays: 17 },
];

/** After this many days the series is over and an old term sheet gets one check-in instead. */
export const SERIES_WINDOW_DAYS = 30;

/** The one email an old term sheet gets. Not part of the numbered series. */
export const CHECKIN_STEP: FollowupStep = { step: 5, templateKey: "ts-checkin", afterDays: SERIES_WINDOW_DAYS + 1 };

export const isCheckin = (s: FollowupStep): boolean => s.templateKey === CHECKIN_STEP.templateKey;

export const TS_TEMPLATE_KEYS: readonly string[] = [...TS_SERIES.map((s) => s.templateKey), CHECKIN_STEP.templateKey];

/** Never two touches closer than this. */
export const MIN_GAP_DAYS = 2;

/** "Not now" puts the deal down for this long. */
export const NOT_NOW_DAYS = 3;

const DAY = 86_400_000;

export type TsDeal = {
  applicationId: string;
  stage: string;
  /** When the deal last entered term_sheet_issued. */
  termSheetAt: string | null;
  followupStoppedAt: string | null;
  /** applications.next_action_at — "Not now" and any other snooze. */
  snoozedUntil: string | null;
  email: string | null;
  emailSubscribed: boolean | null;
  /** Latest email_in / sms_in from the borrower. */
  lastInboundAt: string | null;
  /** Latest email_out / sms_out / call. */
  lastOutboundAt: string | null;
  /** Series emails actually SENT for this deal: template key and when. */
  sent: { templateKey: string; at: string }[];
};

export type TsOff = "not_at_term_sheet" | "no_date" | "stopped" | "replied" | "cannot_email" | "finished";

export type TsDecision =
  | { state: "due"; step: FollowupStep; dueAt: string; daysSinceTermSheet: number }
  | { state: "upcoming"; step: FollowupStep; dueAt: string; daysSinceTermSheet: number }
  | { state: "off"; why: TsOff };

export const TS_OFF_LABEL: Record<TsOff, string> = {
  not_at_term_sheet: "Not at term sheet",
  no_date: "No term sheet date",
  stopped: "You stopped follow-ups",
  replied: "They replied",
  cannot_email: "No emailable address",
  finished: "All four sent",
};

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const v = Date.parse(iso);
  return Number.isNaN(v) ? null : v;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function followupFor(d: TsDeal, now: Date): TsDecision {
  if (d.stage !== "term_sheet_issued") return { state: "off", why: "not_at_term_sheet" };
  const ts = ms(d.termSheetAt);
  if (ts === null) return { state: "off", why: "no_date" };

  const stopped = ms(d.followupStoppedAt);
  if (stopped !== null && stopped >= ts) return { state: "off", why: "stopped" };

  const inbound = ms(d.lastInboundAt);
  if (inbound !== null && inbound > ts) return { state: "off", why: "replied" };

  if (d.emailSubscribed === false || !EMAIL.test((d.email ?? "").trim())) return { state: "off", why: "cannot_email" };

  // The highest step already sent since this term sheet went out. A step sent
  // for an EARLIER term sheet on the same deal does not count.
  let done = 0;
  let checkedIn = false;
  for (const s of d.sent) {
    const at = ms(s.at);
    if (at === null || at < ts) continue;
    if (s.templateKey === CHECKIN_STEP.templateKey) checkedIn = true;
    const step = TS_SERIES.find((x) => x.templateKey === s.templateKey);
    if (step) done = Math.max(done, step.step);
  }
  const elapsedDays = (now.getTime() - ts) / DAY;
  const last = TS_SERIES[TS_SERIES.length - 1];

  let next: FollowupStep | undefined;
  if (elapsedDays > SERIES_WINDOW_DAYS) {
    // Old term sheet: one check-in, unless the series already closed the loop.
    if (checkedIn || done >= last.step) return { state: "off", why: "finished" };
    next = CHECKIN_STEP;
  } else {
    // Catch up: the latest step whose day has come, never one already passed over.
    const reached = TS_SERIES.filter((x) => x.step > done && x.afterDays <= elapsedDays);
    next = reached.length ? reached[reached.length - 1] : TS_SERIES.find((x) => x.step === done + 1);
    if (!next) return { state: "off", why: "finished" };
  }

  let due = ts + next.afterDays * DAY;
  const out = ms(d.lastOutboundAt);
  if (out !== null && out >= ts) due = Math.max(due, out + MIN_GAP_DAYS * DAY);
  const snooze = ms(d.snoozedUntil);
  if (snooze !== null && snooze > now.getTime()) due = Math.max(due, snooze);

  const daysSinceTermSheet = Math.max(0, Math.floor((now.getTime() - ts) / DAY));
  const decision = { step: next, dueAt: new Date(due).toISOString(), daysSinceTermSheet };
  return now.getTime() >= due ? { state: "due", ...decision } : { state: "upcoming", ...decision };
}

/**
 * Live term sheets first (longest waiting first, then the earliest step); old
 * term sheets' check-ins after them, NEWEST first — a 40-day-old one is far
 * likelier to be alive than a 400-day-old one.
 */
export function sortDue<T extends { dueAt: string; daysSinceTermSheet: number; step: FollowupStep }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ca = isCheckin(a.step) ? 1 : 0, cb = isCheckin(b.step) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    if (ca) return a.daysSinceTermSheet - b.daysSinceTermSheet || a.dueAt.localeCompare(b.dueAt);
    return b.daysSinceTermSheet - a.daysSinceTermSheet || a.dueAt.localeCompare(b.dueAt);
  });
}

/** A follow-up that is due, already written, as the dashboard shows it. */
export type DueFollowup = {
  applicationId: string;
  name: string;
  email: string;
  deal: string;
  step: FollowupStep;
  dueAt: string;
  daysSinceTermSheet: number;
  subject: string;
  body: string;
  /**
   * Set when the last Send for this step got no clear answer from Gmail
   * (outbound row stuck at `sending`). The dashboard asks Luis to check his
   * Sent folder and settle it, instead of counting it done or resending blind.
   */
  unsureKey?: string | null;
};

/** A `sending` row younger than this is a send in flight and counts as done; older is "unsure". */
export const UNSURE_AFTER_MINUTES = 10;

export function isFollowupTemplate(key: string | null | undefined): boolean {
  return !!key && TS_TEMPLATE_KEYS.includes(key);
}
