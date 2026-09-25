/**
 * Is this webhook really from Quo? Pure apart from `node:crypto`; pinned by
 * lib/comms/quoSignature.regress.ts.
 *
 * QUO HAS TWO SIGNING SCHEMES, and which one a delivery uses depends on how
 * the webhook was created. Both are implemented; the headers decide.
 *
 * 1. LEGACY — webhooks made in the Quo app (Settings → Webhooks). Source:
 *    support.quo.com/core-concepts/integrations/webhooks, read 24 Sep 2026.
 *      header  openphone-signature: hmac;1;<timestamp>;<base64 signature>
 *              (possibly several, comma-separated)
 *      signed  <timestamp> + "." + <JSON body>
 *      key     the base64 "signing secret" from the webhook's ⋯ menu, decoded
 *      hash    HMAC-SHA256, base64
 *    The doc's example timestamp (1639710054089) is in MILLISECONDS; seconds
 *    are accepted too. Its Node example signs `JSON.stringify(req.body)` — the
 *    re-serialised body — while its Python example signs the raw bytes, and it
 *    says to "remove all whitespace and newlines". So the raw body is tried
 *    first, then its compact re-serialisation. Both are exact HMACs; neither
 *    loosens anything an attacker could use.
 *
 * 2. STANDARD WEBHOOKS — webhooks made through the dated API (2026-03-30).
 *    Source: quo.com/docs/2026-03-30/webhooks-signature-validation.
 *      headers webhook-id, webhook-timestamp (seconds), webhook-signature
 *              ("v1,<base64>" entries, space-separated)
 *      signed  <webhook-id> + "." + <webhook-timestamp> + "." + <raw body>
 *      key     "whsec_" + base64; strip the prefix and decode
 *
 * EITHER WAY: constant-time comparison, and a timestamp more than five minutes
 * from now is refused, so a captured delivery cannot be replayed later. Quo
 * re-signs retries with a fresh timestamp, so this does not break retries.
 *
 * `QUO_WEBHOOK_SECRET` may hold more than one key separated by commas or
 * spaces — one per webhook, or old and new during a rotation. Any match passes.
 *
 * THE FIRST LIVE "Send Test Request" (25 Sep 2026) WAS REFUSED with 401, and
 * Vercel's logs are not readable from Cowork, so the reason could not be seen.
 * Re-reading the doc found an ambiguity worth covering: its Node example does
 * `Buffer.from(key, 'base64').toString('binary')` and hands that STRING to
 * createHmac, which Node re-encodes as UTF-8 — so every decoded byte of 0x80
 * or above becomes two bytes, a different key from the Python example's raw
 * bytes. Whichever language Quo signs with, one of the two examples is wrong.
 * The legacy scheme now tries both derivations, plus the secret's own text as
 * the key, and the body with all whitespace removed (the doc's literal
 * wording). Every candidate is still an exact HMAC under the configured
 * secret; none of them lets anyone without the secret through.
 *
 * A refusal now logs WHICH check failed and the clock skew (never the secret
 * or the body), so the next 401 explains itself in the Vercel log.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export type HeaderSource = { get(name: string): string | null } | Record<string, string | string[] | undefined>;

export type VerifyResult =
  | { ok: true; scheme: "legacy" | "standard"; deliveryId: string | null }
  | {
      ok: false;
      reason: "no_secret" | "no_signature" | "malformed" | "stale" | "mismatch";
      /** Which header set arrived, and how far its timestamp was from now — for the log only. */
      scheme?: "legacy" | "standard" | "none";
      skewSeconds?: number;
    };

function header(h: HeaderSource, name: string): string | null {
  if (typeof (h as { get?: unknown }).get === "function") {
    return (h as { get(n: string): string | null }).get(name);
  }
  const rec = h as Record<string, string | string[] | undefined>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  const v = key ? rec[key] : undefined;
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

/**
 * The signing keys, decoded. Refuses anything that decodes to fewer than 16
 * bytes: a key that short is a typo or a placeholder, and an HMAC with it
 * would be a lock anyone could pick. No keys means NOTHING verifies.
 */
export function parseSigningSecrets(env: string | undefined | null): Buffer[] {
  if (!env) return [];
  return env
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("whsec_") ? s.slice("whsec_".length) : s))
    .filter((s) => /^[A-Za-z0-9+/_-]+={0,2}$/.test(s))
    .map((s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"))
    .filter((b) => b.length >= 16);
}

/**
 * Every key the LEGACY scheme may have used, for each configured secret:
 *   1. the base64-decoded bytes (the doc's Python example);
 *   2. those bytes as a "binary" string re-encoded as UTF-8 (what the doc's
 *      Node example actually does — see the header comment);
 *   3. the secret's own text, if Quo turns out to sign with it undecoded.
 * Anything under 16 bytes is still refused.
 */
export function legacyKeyCandidates(env: string | undefined | null): Buffer[] {
  if (!env) return [];
  const out: Buffer[] = [];
  const seen = new Set<string>();
  const add = (b: Buffer) => {
    if (b.length < 16) return;
    const k = b.toString("hex");
    if (!seen.has(k)) { seen.add(k); out.push(b); }
  };
  for (const token of env.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)) {
    for (const decoded of parseSigningSecrets(token)) {
      add(decoded);
      add(Buffer.from(decoded.toString("binary"), "utf8"));
    }
    add(Buffer.from(token, "utf8"));
  }
  return out;
}

/** Equal-length, constant-time comparison of two base64 strings. */
function sameDigest(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still spend the comparison so a length mismatch is not faster.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

const hmac = (key: Buffer, data: string) => createHmac("sha256", key).update(Buffer.from(data, "utf8")).digest("base64");

/** A timestamp in seconds or milliseconds, as epoch milliseconds. */
function toMs(ts: string): number | null {
  if (!/^\d{9,14}$/.test(ts)) return null;
  const n = Number(ts);
  return n >= 1e11 ? n : n * 1000;
}

/**
 * The bodies the legacy scheme may have signed: exactly what arrived, then
 * compact JSON, then the doc's literal "all whitespace removed".
 */
function legacyBodies(raw: string): string[] {
  const out = [raw];
  try {
    const compact = JSON.stringify(JSON.parse(raw));
    if (!out.includes(compact)) out.push(compact);
  } catch {
    // Not JSON: the route rejects it after verification.
  }
  const stripped = raw.replace(/\s+/g, "");
  if (!out.includes(stripped)) out.push(stripped);
  return out;
}

export function verifyQuoSignature(input: {
  headers: HeaderSource;
  rawBody: string;
  secrets: string | undefined | null;
  nowMs: number;
  toleranceMs?: number;
}): VerifyResult {
  const keys = parseSigningSecrets(input.secrets);
  const legacyKeys = legacyKeyCandidates(input.secrets);
  if (keys.length === 0 && legacyKeys.length === 0) return { ok: false, reason: "no_secret" };
  const tolerance = input.toleranceMs ?? SIGNATURE_TOLERANCE_MS;
  const fresh = (ms: number) => Math.abs(input.nowMs - ms) <= tolerance;

  /* -- Standard Webhooks (dated API) -- */
  const stdSig = header(input.headers, "webhook-signature");
  if (stdSig !== null) {
    const id = header(input.headers, "webhook-id");
    const ts = header(input.headers, "webhook-timestamp");
    if (!id || !ts) return { ok: false, reason: "malformed", scheme: "standard" };
    const ms = /^\d{9,11}$/.test(ts) ? Number(ts) * 1000 : null;
    if (ms === null) return { ok: false, reason: "malformed", scheme: "standard" };
    const provided = stdSig
      .split(" ")
      .map((e) => e.trim())
      .filter(Boolean)
      .map((e) => {
        const at = e.indexOf(",");
        return at > 0 && e.slice(0, at) === "v1" ? e.slice(at + 1) : null;
      })
      .filter((s): s is string => !!s);
    if (provided.length === 0) return { ok: false, reason: "malformed", scheme: "standard" };
    const skewSeconds = Math.round((input.nowMs - ms) / 1000);
    if (!fresh(ms)) return { ok: false, reason: "stale", scheme: "standard", skewSeconds };
    const signed = `${id}.${ts}.${input.rawBody}`;
    for (const key of keys) {
      const expected = hmac(key, signed);
      if (provided.some((p) => sameDigest(p, expected))) return { ok: true, scheme: "standard", deliveryId: id };
    }
    return { ok: false, reason: "mismatch", scheme: "standard", skewSeconds };
  }

  /* -- Legacy openphone-signature (webhooks made in the Quo app) -- */
  const legacy = header(input.headers, "openphone-signature");
  if (legacy === null || legacy.trim() === "") return { ok: false, reason: "no_signature", scheme: "none" };

  const entries = legacy
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => e.split(";"))
    .filter((f) => f.length === 4 && f[0] === "hmac" && f[1] === "1" && f[3].length > 0)
    .map((f) => ({ ts: f[2], sig: f[3], ms: toMs(f[2]) }))
    .filter((e): e is { ts: string; sig: string; ms: number } => e.ms !== null);
  if (entries.length === 0) return { ok: false, reason: "malformed", scheme: "legacy" };

  const skewSeconds = Math.round((input.nowMs - entries[0].ms) / 1000);
  const current = entries.filter((e) => fresh(e.ms));
  if (current.length === 0) return { ok: false, reason: "stale", scheme: "legacy", skewSeconds };

  const bodies = legacyBodies(input.rawBody);
  for (const e of current) {
    for (const key of legacyKeys) {
      for (const body of bodies) {
        if (sameDigest(e.sig, hmac(key, `${e.ts}.${body}`))) return { ok: true, scheme: "legacy", deliveryId: null };
      }
    }
  }
  return { ok: false, reason: "mismatch", scheme: "legacy", skewSeconds };
}

/** Test helper and documentation in one: how Quo builds a legacy header. */
export function signLegacyForTest(keyBase64: string, timestamp: string, body: string): string {
  const sig = hmac(Buffer.from(keyBase64, "base64"), `${timestamp}.${body}`);
  return `hmac;1;${timestamp};${sig}`;
}

/** Test helper: how Quo builds the standard headers. */
export function signStandardForTest(secret: string, id: string, timestamp: string, body: string): Record<string, string> {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${hmac(key, `${id}.${timestamp}.${body}`)}`,
  };
}
