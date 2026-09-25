/**
 * The Google HTTP client for email from the record card. Talks to Google and
 * nothing else: reads no table, writes no table, logs nothing.
 *
 * Four calls:
 *   exchangeCode        the one-time Connect Gmail step (code → refresh token)
 *   refreshAccessToken  a short-lived access token for each send
 *   getSendAs           the mailbox's display name and SIGNATURE (Gmail does
 *                       not add the signature to API sends; we add it)
 *   sendMessage         POST users/me/messages/send
 *
 * NEVER LOGS. A log line is how a token or a borrower's address leaks; errors
 * come back as values with Google's own short reason, never with a token in
 * them. guards.regress.ts §13 pins that.
 *
 * Imported by the email executor (lib/comms/emailOutbox.server.ts) and the
 * Connect Gmail callback route only.
 */

import "server-only";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GOOGLE_TIMEOUT_MS = 10_000;

export type GoogleConfig = { clientId: string; clientSecret: string };

/** Null when the server is not set up — the card then says so in plain English. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function call(url: string, init: RequestInit): Promise<{ status: number; json: Record<string, unknown> } | { status: 0; json: null }> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
    let json: Record<string, unknown> = {};
    try { json = (await res.json()) as Record<string, unknown>; } catch { /* empty or non-JSON body */ }
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

/** Google's short machine reason, never the whole body. */
function reason(json: Record<string, unknown> | null): string {
  if (!json) return "no answer";
  const err = json.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as { status?: unknown; message?: unknown };
    if (typeof e.status === "string") return e.status;
    if (typeof e.message === "string") return e.message.slice(0, 120);
  }
  return "unexpected answer";
}

export async function exchangeCode(p: {
  config: GoogleConfig;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ ok: true; refreshToken: string | null; accessToken: string; scope: string } | { ok: false; error: string }> {
  const r = await call(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: p.config.clientId,
      client_secret: p.config.clientSecret,
      code: p.code,
      code_verifier: p.codeVerifier,
      redirect_uri: p.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const j = r.json;
  if (r.status !== 200 || !j || typeof j.access_token !== "string") return { ok: false, error: reason(j) };
  return {
    ok: true,
    accessToken: j.access_token,
    refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : null,
    scope: typeof j.scope === "string" ? j.scope : "",
  };
}

/**
 * `revoked` is true when Google says the grant is gone (the person removed
 * access, changed their password, or an admin revoked it). The only fix is to
 * connect again, and the card says so.
 */
export async function refreshAccessToken(
  config: GoogleConfig,
  refreshToken: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; revoked: boolean; error: string }> {
  const r = await call(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const j = r.json;
  if (r.status === 200 && j && typeof j.access_token === "string") return { ok: true, accessToken: j.access_token };
  const why = reason(j);
  return { ok: false, revoked: why === "invalid_grant", error: why };
}

export type SendAs = { email: string; displayName: string | null; signature: string | null; isPrimary: boolean };

/** The mailbox's primary address (at connect time) or one named address. */
export async function getSendAs(accessToken: string, email?: string): Promise<{ ok: true; sendAs: SendAs } | { ok: false; error: string }> {
  const url = email ? `${GMAIL}/settings/sendAs/${encodeURIComponent(email)}` : `${GMAIL}/settings/sendAs`;
  const r = await call(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (r.status !== 200 || !r.json) return { ok: false, error: reason(r.json) };
  const pick = (o: Record<string, unknown>): SendAs | null =>
    typeof o.sendAsEmail === "string"
      ? {
          email: o.sendAsEmail,
          displayName: typeof o.displayName === "string" && o.displayName.trim() ? o.displayName.trim() : null,
          signature: typeof o.signature === "string" && o.signature.trim() ? o.signature : null,
          isPrimary: o.isPrimary === true,
        }
      : null;
  if (email) {
    const one = pick(r.json);
    return one ? { ok: true, sendAs: one } : { ok: false, error: "unexpected answer" };
  }
  const list = Array.isArray(r.json.sendAs) ? (r.json.sendAs as Record<string, unknown>[]) : [];
  const primary = list.map(pick).find((s) => s?.isPrimary) ?? null;
  return primary ? { ok: true, sendAs: primary } : { ok: false, error: "no primary address" };
}

export type GmailSendResult =
  | { ok: true; id: string; threadId: string | null }
  | { ok: false; outcome: "rejected" | "unknown"; error: string };

/**
 * One message. `raw` is the base64url RFC 5322 message from buildMime().
 *
 * No answer (timeout, network) is UNKNOWN, not failed: Gmail may have sent it.
 * The executor says "check your Sent folder" rather than inviting a resend.
 */
export async function sendMessage(accessToken: string, raw: string): Promise<GmailSendResult> {
  const r = await call(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (r.status === 0) return { ok: false, outcome: "unknown", error: "Gmail did not answer in time." };
  if (r.status === 200 && r.json && typeof r.json.id === "string") {
    return { ok: true, id: r.json.id, threadId: typeof r.json.threadId === "string" ? r.json.threadId : null };
  }
  if (r.status >= 500) return { ok: false, outcome: "unknown", error: "Gmail had a problem on its side." };
  if (r.status === 401 || r.status === 403) return { ok: false, outcome: "rejected", error: "Gmail refused the permission. Reconnect Gmail from the Email panel." };
  if (r.status === 429) return { ok: false, outcome: "rejected", error: "Gmail's sending limit was reached. Try again later." };
  return { ok: false, outcome: "rejected", error: `Gmail refused the message (${reason(r.json)}).` };
}
