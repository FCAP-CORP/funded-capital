/**
 * Regression suite for Quo webhook signature verification.
 *
 * `proxy.ts` does not guard /api, so this check is the only thing standing
 * between the internet and a route that writes texts onto borrowers' records
 * and can opt people out. Every way a forged or replayed request could get
 * through has a case here, in both of Quo's signing schemes.
 *
 * Signatures are built with node:crypto directly from the documented recipe,
 * not only with the module's own test helpers — a helper that shared a bug
 * with the verifier would agree with it and prove nothing.
 */

import { createHmac, randomBytes } from "node:crypto";
import {
  SIGNATURE_TOLERANCE_MS,
  legacyKeyCandidates,
  parseSigningSecrets,
  signLegacyForTest,
  signStandardForTest,
  verifyQuoSignature,
} from "./quoSignature";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const KEY = randomBytes(32).toString("base64");
const OTHER = randomBytes(32).toString("base64");
const NOW = Date.parse("2026-09-24T15:00:00.000Z");
const TS_MS = String(NOW - 2_000);
const TS_S = String(Math.floor((NOW - 2_000) / 1000));

const event = {
  id: "EVc67ec998b35c41d388af50799aeeba3e",
  object: "event",
  apiVersion: "v2",
  createdAt: "2026-09-24T14:59:58.000Z",
  type: "message.received",
  data: { object: { id: "AC24a8", object: "message", from: "+13055550101", to: "+13058575620", direction: "incoming", body: "STOP", status: "received" } },
};
const compact = JSON.stringify(event);
const pretty = JSON.stringify(event, null, 2);

/** The documented legacy recipe, by hand. */
const legacySig = (keyB64: string, ts: string, body: string) =>
  createHmac("sha256", Buffer.from(keyB64, "base64")).update(`${ts}.${body}`, "utf8").digest("base64");
const legacyHeader = (keyB64: string, ts: string, body: string) => `hmac;1;${ts};${legacySig(keyB64, ts, body)}`;

const verify = (headers: Record<string, string>, body: string, secrets: string | null = KEY, nowMs = NOW) =>
  verifyQuoSignature({ headers, rawBody: body, secrets, nowMs });
const show = (r: ReturnType<typeof verifyQuoSignature>) => (r.ok ? `ok (${r.scheme})` : r.reason);

console.log("\n=== 1. Legacy openphone-signature: valid deliveries pass ===");
{
  const r = verify({ "openphone-signature": legacyHeader(KEY, TS_MS, compact) }, compact);
  check("millisecond timestamp, compact body", r.ok && r.scheme === "legacy", show(r));
  const s = verify({ "openphone-signature": legacyHeader(KEY, TS_S, compact) }, compact);
  check("second timestamp", s.ok, show(s));
  const p = verify({ "openphone-signature": legacyHeader(KEY, TS_MS, pretty) }, pretty);
  check("signature over the raw (pretty) bytes as sent", p.ok, show(p));
  const re = verify({ "openphone-signature": legacyHeader(KEY, TS_MS, compact) }, pretty);
  check("signature over the compact re-serialisation (Quo's Node example) of a pretty body", re.ok, show(re));
  const cased = verify({ "OpenPhone-Signature": legacyHeader(KEY, TS_MS, compact) }, compact);
  check("header name is case-insensitive", cased.ok, show(cased));
  const h = new Headers({ "openphone-signature": legacyHeader(KEY, TS_MS, compact) });
  const viaHeaders = verifyQuoSignature({ headers: h, rawBody: compact, secrets: KEY, nowMs: NOW });
  check("works with a real Headers object (what the route passes)", viaHeaders.ok, show(viaHeaders));
  const helper = verify({ "openphone-signature": signLegacyForTest(KEY, TS_MS, compact) }, compact);
  check("the test helper agrees with the hand-built recipe", helper.ok && signLegacyForTest(KEY, TS_MS, compact) === legacyHeader(KEY, TS_MS, compact), show(helper));
  const multi = verify({ "openphone-signature": `hmac;1;${TS_MS};AAAA,${legacyHeader(KEY, TS_MS, compact)}` }, compact);
  check("several comma-separated signatures: any valid one passes", multi.ok, show(multi));
  const docKey = "R2ZLM2o0bFhBNVpyUnU2NG9mYXQ1MHNyR3pvSUhIVVg=";
  const doc = verify({ "openphone-signature": legacyHeader(docKey, TS_MS, compact) }, compact, docKey);
  check("the example signing key from Quo's docs decodes and verifies", doc.ok, show(doc));
}

console.log("\n=== 2. Legacy: forged, tampered and replayed deliveries fail ===");
{
  const hdr = { "openphone-signature": legacyHeader(KEY, TS_MS, compact) };
  const tampered = compact.replace("STOP", "START");
  check("tampered body → mismatch", show(verify(hdr, tampered)) === "mismatch", show(verify(hdr, tampered)));
  const otherPhone = compact.replace("+13055550101", "+13055550199");
  check("a different phone number in the body → mismatch", show(verify(hdr, otherPhone)) === "mismatch", "");
  check("signed with another key → mismatch", show(verify({ "openphone-signature": legacyHeader(OTHER, TS_MS, compact) }, compact)) === "mismatch", "");
  const tsSwap = { "openphone-signature": `hmac;1;${String(Number(TS_MS) + 1000)};${legacySig(KEY, TS_MS, compact)}` };
  check("timestamp changed after signing → mismatch", show(verify(tsSwap, compact)) === "mismatch", show(verify(tsSwap, compact)));
  const staleTs = String(NOW - SIGNATURE_TOLERANCE_MS - 1000);
  check("valid signature, 5 min + 1 s old → stale", show(verify({ "openphone-signature": legacyHeader(KEY, staleTs, compact) }, compact)) === "stale", "");
  const edgeTs = String(NOW - SIGNATURE_TOLERANCE_MS + 1000);
  check("valid signature, just under 5 min old → accepted", verify({ "openphone-signature": legacyHeader(KEY, edgeTs, compact) }, compact).ok, "");
  const futureTs = String(NOW + SIGNATURE_TOLERANCE_MS + 1000);
  check("valid signature, 5 min in the FUTURE → stale", show(verify({ "openphone-signature": legacyHeader(KEY, futureTs, compact) }, compact)) === "stale", "");
  check("no header → no_signature", show(verify({}, compact)) === "no_signature", "");
  check("empty header → no_signature", show(verify({ "openphone-signature": "" }, compact)) === "no_signature", "");
  check("garbage header → malformed", show(verify({ "openphone-signature": "hello" }, compact)) === "malformed", "");
  check("wrong scheme (sha1;1;…) → malformed", show(verify({ "openphone-signature": `sha1;1;${TS_MS};abc` }, compact)) === "malformed", "");
  check("wrong version (hmac;2;…) → malformed", show(verify({ "openphone-signature": `hmac;2;${TS_MS};${legacySig(KEY, TS_MS, compact)}` }, compact)) === "malformed", "");
  check("non-numeric timestamp → malformed", show(verify({ "openphone-signature": `hmac;1;soon;${legacySig(KEY, "soon", compact)}` }, compact)) === "malformed", "");
  check("empty signature → malformed", show(verify({ "openphone-signature": `hmac;1;${TS_MS};` }, compact)) === "malformed", "");
  const truncated = legacyHeader(KEY, TS_MS, compact).slice(0, -4);
  check("truncated signature → mismatch (different length, no throw)", show(verify({ "openphone-signature": truncated }, compact)) === "mismatch", "");
}

console.log("\n=== 3. The secret: fail closed ===");
{
  const hdr = { "openphone-signature": legacyHeader(KEY, TS_MS, compact) };
  check("QUO_WEBHOOK_SECRET unset → no_secret (nothing verifies)", show(verify(hdr, compact, null)) === "no_secret", "");
  check("empty secret → no_secret", show(verify(hdr, compact, "")) === "no_secret", "");
  check("a secret under 16 bytes is ignored → no_secret", show(verify(hdr, compact, Buffer.from("short").toString("base64"))) === "no_secret", "");
  check("non-base64 junk → no_secret", show(verify(hdr, compact, "not a key!!")) === "no_secret", "");
  check("two secrets (rotation), the second matches → ok", verify(hdr, compact, `${OTHER},${KEY}`).ok, "");
  check("two secrets separated by whitespace/newline → ok", verify(hdr, compact, `${OTHER}\n ${KEY}`).ok, "");
  check("two secrets, neither matches → mismatch", show(verify(hdr, compact, `${OTHER},${randomBytes(32).toString("base64")}`)) === "mismatch", "");
  check("parseSigningSecrets strips whsec_", parseSigningSecrets(`whsec_${KEY}`)[0]?.equals(Buffer.from(KEY, "base64")) === true, "");
}

console.log("\n=== 4. Standard Webhooks (dated API): valid and invalid ===");
{
  const secret = `whsec_${KEY}`;
  const id = "msg_2abc";
  const std = (ts: string, body: string, s = secret) => ({
    "webhook-id": id,
    "webhook-timestamp": ts,
    "webhook-signature": `v1,${createHmac("sha256", Buffer.from(s.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`,
  });
  const ok = verify(std(TS_S, compact), compact, secret);
  check("valid → ok (standard), delivery id reported", ok.ok && ok.scheme === "standard" && ok.deliveryId === id, show(ok));
  check("...the secret also works without the whsec_ prefix", verify(std(TS_S, compact), compact, KEY).ok, "");
  check("the helper agrees with the hand-built recipe", signStandardForTest(secret, id, TS_S, compact)["webhook-signature"] === std(TS_S, compact)["webhook-signature"], "");
  check("tampered body → mismatch", show(verify(std(TS_S, compact), compact.replace("STOP", "HELP"), secret)) === "mismatch", "");
  check("raw body is required: a re-serialised body does NOT verify here", show(verify(std(TS_S, pretty), compact, secret)) === "mismatch", "");
  const withId = { ...std(TS_S, compact), "webhook-id": "msg_other" };
  check("a different webhook-id → mismatch (the id is signed)", show(verify(withId, compact, secret)) === "mismatch", "");
  check("wrong key → mismatch", show(verify(std(TS_S, compact, `whsec_${OTHER}`), compact, secret)) === "mismatch", "");
  const staleS = String(Math.floor((NOW - SIGNATURE_TOLERANCE_MS - 5000) / 1000));
  check("stale timestamp → stale", show(verify(std(staleS, compact), compact, secret)) === "stale", "");
  check("millisecond timestamp is malformed in this scheme", show(verify(std(TS_MS, compact), compact, secret)) === "malformed", "");
  const noId = { ...std(TS_S, compact) } as Record<string, string>;
  delete noId["webhook-id"];
  check("missing webhook-id → malformed", show(verify(noId, compact, secret)) === "malformed", "");
  const v2 = { ...std(TS_S, compact), "webhook-signature": std(TS_S, compact)["webhook-signature"].replace(/^v1,/, "v2,") };
  check("only non-v1 signatures → malformed", show(verify(v2, compact, secret)) === "malformed", "");
  const several = { ...std(TS_S, compact), "webhook-signature": `v1,AAAA ${std(TS_S, compact)["webhook-signature"]}` };
  check("space-separated list, one valid → ok", verify(several, compact, secret).ok, "");
  const both = { ...std(TS_S, compact), "openphone-signature": legacyHeader(OTHER, TS_MS, compact) };
  check("both header sets present: the standard one decides", verify(both, compact, secret).ok, "");
}

console.log("\n=== 5. Legacy key and body variants (added after the first live 401) ===");
{
  // A key with high bytes, so the Node "binary string" derivation really differs.
  const HIGH = Buffer.from(Array.from({ length: 32 }, (_, i) => 0x80 + i)).toString("base64");
  const nodeKey = Buffer.from(Buffer.from(HIGH, "base64").toString("binary"), "utf8");
  check("the Node derivation is a different key for high bytes", !nodeKey.equals(Buffer.from(HIGH, "base64")), `${nodeKey.length} bytes`);
  const nodeSig = createHmac("sha256", Buffer.from(HIGH, "base64").toString("binary")).update(Buffer.from(`${TS_MS}.${compact}`, "utf8")).digest("base64");
  const r1 = verify({ "openphone-signature": `hmac;1;${TS_MS};${nodeSig}` }, compact, HIGH);
  check("signed exactly as the doc's Node example → ok", r1.ok, show(r1));
  const r2 = verify({ "openphone-signature": legacyHeader(HIGH, TS_MS, compact) }, compact, HIGH);
  check("signed exactly as the doc's Python example → ok", r2.ok, show(r2));

  const TEXT = "qu0-plain-signing-secret-2026-abc";
  const textSig = createHmac("sha256", Buffer.from(TEXT, "utf8")).update(`${TS_MS}.${compact}`).digest("base64");
  const r3 = verify({ "openphone-signature": `hmac;1;${TS_MS};${textSig}` }, compact, TEXT);
  check("signed with the secret's own text as the key → ok", r3.ok, show(r3));

  const spaced = JSON.stringify({ ...event, data: { object: { ...event.data.object, body: "Yes please call me" } } }, null, 2);
  const stripped = spaced.replace(/\s+/g, "");
  const r4 = verify({ "openphone-signature": legacyHeader(KEY, TS_MS, stripped) }, spaced);
  check("signed over the body with ALL whitespace removed → ok", r4.ok, show(r4));

  const r5 = verify({ "openphone-signature": `hmac;1;${TS_MS};${textSig}` }, compact, OTHER);
  check("…but none of that helps without the right secret → mismatch", show(r5) === "mismatch", show(r5));
  const r6 = verify({ "openphone-signature": `hmac;1;${TS_MS};${textSig}` }, compact.replace("STOP", "HELP"), TEXT);
  check("…and a changed body still fails under the text key → mismatch", show(r6) === "mismatch", show(r6));
  check("a short text secret is still refused → no_secret", show(verify({ "openphone-signature": legacyHeader(KEY, TS_MS, compact) }, compact, "tooshort")) === "no_secret", "");
  check("legacyKeyCandidates never returns a key under 16 bytes", legacyKeyCandidates(`${KEY},short`).every((k) => k.length >= 16), "");
  check("legacyKeyCandidates dedupes (low-byte keys give one decoded + one text)", legacyKeyCandidates(Buffer.from("A".repeat(24)).toString("base64")).length === 2, String(legacyKeyCandidates(Buffer.from("A".repeat(24)).toString("base64")).length));

  const stale = verify({ "openphone-signature": legacyHeader(KEY, String(NOW - 3_600_000), compact) }, compact);
  check("a refusal reports the scheme and skew for the log", !stale.ok && stale.scheme === "legacy" && stale.skewSeconds === 3600, JSON.stringify(stale));
  const none = verify({}, compact);
  check("no signature header → scheme none", !none.ok && none.scheme === "none", JSON.stringify(none));
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
