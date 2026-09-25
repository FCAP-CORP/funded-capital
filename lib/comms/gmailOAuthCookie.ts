import { createHash, randomBytes } from "node:crypto";

/**
 * The short-lived cookie that carries the Connect Gmail flow across Google's
 * screen: the `state` (CSRF — the callback must see the same value it sent),
 * the PKCE verifier, and where to return. httpOnly, Secure, SameSite=Lax,
 * scoped to /api/crm/google, ten minutes. Pure; covered by email.regress.ts.
 */

export const OAUTH_COOKIE = "fc_gmail_oauth";
export const OAUTH_COOKIE_MAX_AGE = 600;

const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function newOAuthFlow(returnTo: string): { state: string; verifier: string; challenge: string; cookie: string } {
  const state = b64u(randomBytes(24));
  const verifier = b64u(randomBytes(48));
  const challenge = b64u(createHash("sha256").update(verifier).digest());
  const cookie = b64u(Buffer.from(JSON.stringify({ s: state, v: verifier, r: returnTo, t: Date.now() }), "utf8"));
  return { state, verifier, challenge, cookie };
}

export type OAuthFlow = { state: string; verifier: string; returnTo: string };

/** Null for a missing, garbled or expired cookie. */
export function readOAuthFlow(cookie: string | undefined | null, nowMs: number): OAuthFlow | null {
  if (!cookie || cookie.length > 2000) return null;
  try {
    const j = JSON.parse(Buffer.from(cookie.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
    if (typeof j.s !== "string" || typeof j.v !== "string" || typeof j.r !== "string" || typeof j.t !== "number") return null;
    if (nowMs - j.t > OAUTH_COOKIE_MAX_AGE * 1000 || j.t > nowMs + 60_000) return null;
    return { state: j.s, verifier: j.v, returnTo: j.r };
  } catch {
    return null;
  }
}

/** Constant-time-ish equality for two short strings of known shape. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
