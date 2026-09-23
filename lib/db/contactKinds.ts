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
