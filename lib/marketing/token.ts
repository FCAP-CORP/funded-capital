/**
 * The shared secret that lets a scheduled task read and update the marketing
 * queue over HTTP.
 *
 * WHY A TOKEN RATHER THAN CLERK. A scheduled Claude task has no browser, no
 * cookie and no session, so `assertCrmStaff()` can never pass for it. The first
 * design got round that by having the task pull PRODUCTION DATABASE CREDENTIALS
 * onto Luis's laptop on every run and talk to Neon directly. That worked on
 * paper and failed in practice — the task has no shell to run the pull with —
 * but it was the wrong shape regardless: production secrets copied to a
 * workstation three times a day, to read a list of blog topics.
 *
 * A bearer token scoped to ONE endpoint that exposes ONE table is a much
 * smaller thing to leak.
 *
 * WHAT THIS IS NOT. It is not a way into the CRM. The endpoint it guards reads
 * and writes `content_requests` and nothing else — blog topics and their
 * status. No borrower touches it. If this token ever guards anything that can
 * see an application, that is the mistake, not the token.
 *
 * Pure and fully tested. `token.regress.ts`.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shortest secret this will accept.
 *
 * Not a style rule. Without it, `CONTENT_QUEUE_TOKEN=test` set once during
 * debugging is a live credential on a public endpoint, and nothing anywhere
 * would complain. 32 characters is past guessing and past anything someone
 * types by hand, which is the point — a token this long came from a generator.
 */
export const MIN_TOKEN_LENGTH = 32;

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Both sides are hashed first so the comparison always runs over 32 bytes.
 * Comparing the raw strings would return early on the first differing byte and
 * on any length mismatch, which is enough to recover a secret one character at
 * a time given enough attempts.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Is this request carrying the right secret?
 *
 * FAILS CLOSED, and deliberately in the same shape as `lib/crm/access.ts`: an
 * unset or too-short `expected` admits NOBODY. The alternative — an unset
 * variable meaning "no check configured, let it through" — is the single most
 * common way an internal endpoint ends up open, because it looks like it works
 * from the first day and the failure is invisible.
 */
export function tokenOk(provided: string | null | undefined, expected: string | null | undefined): boolean {
  const secret = (expected ?? "").trim();
  if (secret.length < MIN_TOKEN_LENGTH) return false;

  const given = (provided ?? "").trim();
  if (!given) return false;

  return constantTimeEquals(given, secret);
}

/**
 * Pull the secret out of an Authorization header.
 *
 * Accepts `Bearer <token>` and a bare token, because the second is what someone
 * reaches for with curl at 2am and refusing it teaches nothing.
 */
export function bearerFrom(header: string | null | undefined): string | null {
  const raw = (header ?? "").trim();
  if (!raw) return null;

  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (match) return match[1].trim() || null;

  /*
   * The scheme word with nothing after it is a MALFORMED header, not a token.
   *
   * The first version fell through to the bare-token branch here and returned
   * the literal string "Bearer", which would then be compared against the
   * secret. Harmless in practice — "Bearer" is six characters and the minimum
   * is thirty-two — but it is a parser returning something it was never given,
   * and that is the kind of thing that stops being harmless when it is reused.
   */
  if (/^Bearer$/i.test(raw) || /^Bearer\s*$/i.test(raw)) return null;

  return raw || null;
}

/** Why a request was refused, in words that do not help an attacker. */
export type TokenVerdict =
  | { ok: true }
  | { ok: false; status: 503; reason: "The marketing queue API is not configured." }
  | { ok: false; status: 401; reason: "Not authorised." };

/**
 * 503 when the server has no usable secret, 401 when the caller's is wrong.
 *
 * The distinction is for LUIS, not for a caller: "not configured" is a thing he
 * can fix in Vercel, and reporting it as 401 would send him hunting for a wrong
 * token that does not exist. It leaks only that the endpoint is switched off,
 * which is not worth hiding.
 */
export function checkToken(
  provided: string | null | undefined,
  expected: string | null | undefined,
): TokenVerdict {
  if ((expected ?? "").trim().length < MIN_TOKEN_LENGTH) {
    return { ok: false, status: 503, reason: "The marketing queue API is not configured." };
  }
  return tokenOk(provided, expected)
    ? { ok: true }
    : { ok: false, status: 401, reason: "Not authorised." };
}
