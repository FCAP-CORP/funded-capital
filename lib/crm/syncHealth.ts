/**
 * Is the Gmail sync still reaching the CRM? (10 Oct 2026)
 *
 * WHY THIS EXISTS. GmailSync.gs was pasted into the Apps Script project and its
 * history load ran, but the every-15-minutes timer was never switched on. For
 * weeks nothing Luis sent or received in Gmail reached Lending OS: replies never
 * showed under "Waiting on you", leads he had emailed sat under "Never
 * contacted", and nurture could not see a lead write back. Nothing on any
 * screen said so. A pipe that stops produces no error; it produces nothing.
 *
 * HOW IT KNOWS. `/api/crm/activity` stamps `integration_heartbeats.gmail_sync`
 * on every authenticated call, and GmailSync.gs calls it every run — with an
 * empty list when there is no new mail — so the stamp is fresh every 15 minutes
 * whether or not anyone wrote. Migration 0021 seeds the row at migration time,
 * so a sync that never runs at all still turns into a warning.
 *
 * Pure: the clock and the stamp come in, a verdict and its words go out.
 * lib/crm/syncHealth.regress.ts covers every branch.
 */

/** The row name in integration_heartbeats. Shared with the route, so the two cannot drift. */
export const GMAIL_SYNC_HEARTBEAT = "gmail_sync";

/**
 * Six missed runs. Apps Script's time-based triggers are not punctual — a run
 * can slip several minutes or be skipped under load — so a single late run
 * must not cry wolf. An hour and a half of silence is not a hiccup.
 */
export const GMAIL_STALE_AFTER_MINUTES = 90;

/** Where Luis fixes it: the project's own timer list. Not a secret — it needs his Google sign-in. */
export const GMAIL_SYNC_TRIGGERS_URL =
  "https://script.google.com/home/projects/11os__G6cbm4OwLVmjIso0irncRnVTcX63M-d-DWNJV5SM1QjwCPlcsXk/triggers";

export type SyncHealth =
  | { state: "ok"; lastSeenAt: string; minutes: number }
  | { state: "stale"; lastSeenAt: string; minutes: number }
  /** The read failed or the table is not there yet. Says nothing rather than guess. */
  | { state: "unknown" };

/**
 * The verdict.
 *
 * `lastSeenAt` null with a successful read means the row is missing — which
 * only happens if migration 0021 has not run. That is "unknown", not "stale":
 * the warning must be a fact about the sync, never about a deploy step.
 * A stamp in the future (clock skew) counts as just now.
 */
export function gmailSyncHealth(lastSeenAt: string | Date | null | undefined, now: Date): SyncHealth {
  if (lastSeenAt === null || lastSeenAt === undefined) return { state: "unknown" };
  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime()) || Number.isNaN(now.getTime())) return { state: "unknown" };
  const minutes = Math.max(0, Math.floor((now.getTime() - seen.getTime()) / 60_000));
  const iso = seen.toISOString();
  return minutes >= GMAIL_STALE_AFTER_MINUTES
    ? { state: "stale", lastSeenAt: iso, minutes }
    : { state: "ok", lastSeenAt: iso, minutes };
}

/** "95 minutes", "3 hours", "2 days" — whole units, rounded down, never "0 hours". */
export function ageWords(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 120) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hours`;
  const d = Math.floor(h / 24);
  return `${d} days`;
}

/** "Fri Oct 9, 2:15 PM" in New York time — when it last got through. */
export function seenAtWords(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** The banner's two sentences. Null when there is nothing to say. */
export function gmailSyncWarning(h: SyncHealth): { title: string; body: string } | null {
  if (h.state !== "stale") return null;
  return {
    title: `Gmail hasn't synced for ${ageWords(h.minutes)}`,
    body:
      `The last sync reached the CRM on ${seenAtWords(h.lastSeenAt)}. Until it runs again, emails you send ` +
      `or receive in Gmail won't show here: replies won't appear under "Waiting on you", and nurture can't ` +
      `see a lead write back. Emails sent from a record card still log as normal.`,
  };
}
