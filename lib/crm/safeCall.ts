/**
 * Every button in Lending OS awaits a server action. If the request itself
 * fails — a Wi-Fi blip, a tab left open across a deploy (the old action no
 * longer exists on the server), an expired sign-in — the action THROWS rather
 * than returning `{ ok: false }`, and inside a React transition an uncaught
 * throw replaces the whole page with an error screen (1 Oct 2026 review).
 *
 * `safeCall` turns that throw into an ordinary failure with a sentence Luis can
 * act on, so the button shows the problem and the page stays put.
 *
 * Pure and client-safe (no imports), pinned by safeCall.regress.ts.
 */

export const OFFLINE_MESSAGE =
  "Couldn't reach the server. Check your connection, or reload the page if the site was just updated.";

export async function safeCall<R extends { ok: boolean }>(
  call: () => Promise<R>,
): Promise<R | { ok: false; error: string }> {
  try {
    const res = await call();
    // A void or malformed answer is a failure, not a silent success.
    if (!res || typeof res !== "object" || typeof (res as { ok?: unknown }).ok !== "boolean") {
      return { ok: false, error: OFFLINE_MESSAGE };
    }
    return res;
  } catch {
    return { ok: false, error: OFFLINE_MESSAGE };
  }
}

/** The error line of a failed result, whichever shape the action used. */
export function errorOf(res: { ok: boolean } & Partial<{ error: string; message: string }>): string {
  return res.error ?? res.message ?? OFFLINE_MESSAGE;
}
