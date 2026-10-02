import { sql } from "drizzle-orm";

/**
 * What counts as having been in touch with a person.
 *
 * Email, phone and text. NOT `note` — a note is something you wrote to
 * yourself, and letting it count would mean typing "chase him" marks him as
 * chased. NOT `stage_change`, `field_change`, `automation` or
 * `form_submission` either: those are the system moving, not a human reaching
 * out, and counting them would put every untouched lead back under a
 * reassuring "last contacted" date.
 *
 * THIS IS THE ONLY DEFINITION. It lives in its own module, with no database
 * import, so the regression suite can render it without opening a connection —
 * and so a second copy cannot quietly appear in a query file. Until 2026-09-23
 * there were four copies and all four said email only, which meant a borrower
 * you had phoned still counted as never contacted.
 */
export const CONTACT_KIND_LIST = [
  "email_in",
  "email_out",
  "call",
  "sms_in",
  "sms_out",
] as const;

export type ContactKind = (typeof CONTACT_KIND_LIST)[number];

/**
 * The same list as a SQL fragment for `... a.kind IN ${CONTACT_KINDS}`.
 *
 * Built from string literals defined in this file, never from anything a
 * request carries, so there is nothing here for a parameter to protect.
 */
export const CONTACT_KINDS = sql.raw(
  `(${CONTACT_KIND_LIST.map((k) => `'${k}'`).join(", ")})`,
);

/* ------------------------------------------------- whose turn it was (1 Oct 2026) */

/**
 * THEIR RESPONSE, as opposed to us reaching out. Nurture's quiet clock runs
 * from the last time the PERSON responded (Luis, 1 Oct 2026: "his last
 * response to me was on June 30th, which is what ultimately matters"), not
 * from the last time we emailed them.
 *
 * A response is an email or text FROM them, a call they placed, or any call
 * where we actually spoke: Quo's `answered`, or "Spoke with them" on a call
 * logged by hand (`spoke`). A call with none of that — an unanswered dial, or
 * a call logged before 1 Oct 2026 when the choice did not exist — is us
 * reaching out.
 *
 * Pure twin of the SQL below, so the rule can be tested without a database.
 */
export function isResponse(a: { kind: string; metadata?: Record<string, unknown> | null }): boolean {
  if (a.kind === "email_in" || a.kind === "sms_in") return true;
  if (a.kind !== "call") return false;
  const m = a.metadata ?? {};
  return m.direction === "incoming" || m.answered === true || m.spoke === true;
}

/** Us reaching out: an email or text we sent, or a call that was not a conversation. */
export function isOutreach(a: { kind: string; metadata?: Record<string, unknown> | null }): boolean {
  return (a.kind === "email_out" || a.kind === "sms_out" || a.kind === "call") && !isResponse(a);
}

/**
 * The same two rules as SQL conditions on an `activities` row aliased `ac`.
 * The alias is fixed (not a parameter) so nothing from a request can reach
 * the raw SQL. jsonb `->>` yields the text 'true' for a JSON true. Every
 * read is COALESCEd: a call with no metadata would otherwise make the whole
 * condition NULL, and `NOT NULL` would silently drop it from OUTREACH too.
 */
const RESPONSE_COND =
  "(ac.kind IN ('email_in', 'sms_in') OR (ac.kind = 'call' AND (" +
  "COALESCE(ac.metadata->>'direction', '') = 'incoming' OR " +
  "COALESCE(ac.metadata->>'answered', '') = 'true' OR " +
  "COALESCE(ac.metadata->>'spoke', '') = 'true')))";
export const RESPONSE_WHERE = sql.raw(RESPONSE_COND);
export const OUTREACH_WHERE = sql.raw(`(ac.kind IN ('email_out', 'sms_out', 'call') AND NOT ${RESPONSE_COND})`);
