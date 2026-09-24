/**
 * Regression suite for the texting rules that are not consent: the segment
 * counter, the body limit, when a retry is allowed, and how Quo's answers are
 * reported.
 *
 * The two that cost money or trust if wrong: the counter (a curly quote pasted
 * from an email silently turns a 1-segment text into 3), and the retry rule (a
 * text whose outcome is UNKNOWN must not be retried straight away, or the
 * borrower gets it twice).
 */

import {
  MAX_SMS_BODY,
  STALE_SEND_MINUTES,
  canRetry,
  countSegments,
  describeQuoFailure,
  outboundStatusLabel,
  parseSmsBody,
} from "./sms";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};
const seg = (t: string) => {
  const s = countSegments(t);
  return `${s.encoding} units=${s.units} segments=${s.segments} per=${s.perSegment} left=${s.remaining}`;
};

console.log("\n=== 1. GSM-7: 160 in one segment, 153 per part after that ===");
{
  const cases: [string, number, number][] = [
    ["", 0, 0],
    ["Hi", 2, 1],
    ["a".repeat(160), 160, 1],
    ["a".repeat(161), 161, 2],
    ["a".repeat(306), 306, 2],
    ["a".repeat(307), 307, 3],
    ["a".repeat(459), 459, 3],
    ["a".repeat(1000), 1000, 7],
  ];
  for (const [t, units, segments] of cases) {
    const s = countSegments(t);
    check(`${t.length} plain characters → ${segments} segment(s)`, s.encoding === "GSM-7" && s.units === units && s.segments === segments, seg(t));
  }
  const s = countSegments("Hello, can you send the rehab budget? Thanks - Luis @ Funded Capital (305) 857-5620.");
  check("an ordinary business text stays GSM-7", s.encoding === "GSM-7" && s.segments === 1, seg("..."));
  check("£ ¥ è é Ä ñ ü ß are in the GSM-7 alphabet", countSegments("£¥èéÄñüß").encoding === "GSM-7", seg("£¥èéÄñüß"));
  check("a newline is one GSM-7 character", countSegments("a\nb").units === 3, seg("a\nb"));
  check("remaining counts down within the segment", countSegments("a".repeat(150)).remaining === 10, seg("a".repeat(150)));
}

console.log("\n=== 2. The GSM-7 extension table costs two ===");
{
  check("€ costs 2", countSegments("€").units === 2 && countSegments("€").encoding === "GSM-7", seg("€"));
  check("{ } [ ] ~ | ^ \\ each cost 2", countSegments("{}[]~|^\\").units === 16, seg("{}[]~|^\\"));
  check("80 × € = 160 units → still one segment", countSegments("€".repeat(80)).segments === 1, seg("€".repeat(80)));
  check("81 × € = 162 units → two", countSegments("€".repeat(81)).segments === 2, seg("€".repeat(81)));
}

console.log("\n=== 3. One non-GSM character switches the WHOLE text to UCS-2 ===");
{
  const curly = "Thanks — we’ll send the term sheet";
  const s = countSegments(curly);
  check("an em dash / curly apostrophe → UCS-2", s.encoding === "UCS-2", seg(curly));
  check("...and says which characters did it", s.unicodeChars.includes("—") && s.unicodeChars.includes("’"), s.unicodeChars.join(" "));
  check("70 UCS-2 units → one segment", countSegments("—".repeat(70)).segments === 1, seg("—".repeat(70)));
  check("71 → two (67 per part)", countSegments("—".repeat(71)).segments === 2 && countSegments("—".repeat(71)).perSegment === 67, seg("—".repeat(71)));
  check("134 → two, 135 → three", countSegments("—".repeat(134)).segments === 2 && countSegments("—".repeat(135)).segments === 3, "");
  const mixed = "a".repeat(100) + "é" + "ç";
  check("ç (lower-case) is NOT in GSM-7, so 102 chars → UCS-2, 2 segments", countSegments(mixed).encoding === "UCS-2" && countSegments(mixed).segments === 2, seg(mixed));
}

console.log("\n=== 4. Emoji are two UTF-16 units each ===");
{
  check("👍 alone is 2 units of 70", countSegments("👍").units === 2 && countSegments("👍").encoding === "UCS-2", seg("👍"));
  check("35 × 👍 = 70 units → one segment", countSegments("👍".repeat(35)).segments === 1, seg("👍".repeat(35)));
  check("36 × 👍 = 72 units → two", countSegments("👍".repeat(36)).segments === 2, seg("👍".repeat(36)));
  const t = "Great news, you're approved 🎉";
  check("a 160-char-budget text with one emoji is now billed at 70", countSegments(t).encoding === "UCS-2" && countSegments(t).perSegment === 70, seg(t));
  check("the emoji is reported once however often it appears", countSegments("🎉🎉🎉").unicodeChars.length === 1, countSegments("🎉🎉🎉").unicodeChars.join(","));
}

console.log("\n=== 5. The body limit ===");
{
  check(`limit is ${MAX_SMS_BODY}`, MAX_SMS_BODY === 1000, String(MAX_SMS_BODY));
  check("empty is refused", !parseSmsBody("").ok && !parseSmsBody("   \n ").ok, "");
  check("non-string is refused", !parseSmsBody(undefined).ok && !parseSmsBody(42).ok, "");
  const exact = parseSmsBody("x".repeat(1000));
  check("exactly 1,000 is accepted", exact.ok, "");
  const over = parseSmsBody("x".repeat(1001));
  check("1,001 is refused, and the message says how long it is", !over.ok && /1,001/.test(over.error), over.ok ? "" : over.error);
  const trimmed = parseSmsBody("  hello \r\nthere  ");
  check("trimmed, CRLF → LF, words untouched", trimmed.ok && trimmed.value === "hello \nthere", JSON.stringify(trimmed));
  const padded = parseSmsBody(" ".repeat(50) + "x".repeat(1000) + " ".repeat(50));
  check("padding does not count towards the limit", padded.ok, "");
}

console.log("\n=== 6. When a text may be retried ===");
{
  const now = new Date("2026-09-24T15:00:00Z");
  const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  check("failed → yes, at once (Quo said no, nothing went)", canRetry({ status: "failed", lastAttemptAt: ago(0), createdAt: ago(0) }, now), "");
  check("sending, 2 minutes ago → NO (outcome unknown; could double-send)", !canRetry({ status: "sending", lastAttemptAt: ago(2), createdAt: ago(2) }, now), "");
  check(`sending, ${STALE_SEND_MINUTES - 1} min ago → no`, !canRetry({ status: "sending", lastAttemptAt: ago(STALE_SEND_MINUTES - 1), createdAt: ago(30) }, now), "");
  check(`sending, ${STALE_SEND_MINUTES} min ago → yes (stale)`, canRetry({ status: "sending", lastAttemptAt: ago(STALE_SEND_MINUTES), createdAt: ago(30) }, now), "");
  check("queued and stale → yes", canRetry({ status: "queued", lastAttemptAt: null, createdAt: ago(60) }, now), "");
  check("queued, just now → no", !canRetry({ status: "queued", lastAttemptAt: null, createdAt: ago(1) }, now), "");
  for (const st of ["sent", "delivered", "undelivered", "blocked"]) {
    check(`${st} → never`, !canRetry({ status: st, lastAttemptAt: ago(600), createdAt: ago(600) }, now), "");
  }
}

console.log("\n=== 7. Quo's answers, in words — and which ones are 'unknown' ===");
{
  const a2p = describeQuoFailure(400, { code: "0206400", title: "A2P Registration Not Approved" });
  check("400 A2P → rejected, names A2P 10DLC", a2p.outcome === "rejected" && /A2P 10DLC/.test(a2p.error), a2p.error);
  const bad = describeQuoFailure(400, { message: "to must be E.164" });
  check("400 other → rejected, quotes Quo's message", bad.outcome === "rejected" && bad.error.includes("E.164"), bad.error);
  check("401 → rejected, points at QUO_API_KEY (by name, never its value)", describeQuoFailure(401, {}).error.includes("QUO_API_KEY"), describeQuoFailure(401, {}).error);
  check("402 → subscription expired", /expired/.test(describeQuoFailure(402, {}).error), "");
  check("403 daily cap → says try tomorrow", /tomorrow/.test(describeQuoFailure(403, { title: "A2P 10DLC Daily Message Cap Reached" }).error), "");
  check("404 → points at QUO_FROM_NUMBER", describeQuoFailure(404, {}).error.includes("QUO_FROM_NUMBER"), "");
  check("429 → rejected (Quo did not process it, safe to retry)", describeQuoFailure(429, {}).outcome === "rejected", "");
  for (const st of [500, 502, 503, 504]) {
    check(`${st} → UNKNOWN (may have been sent)`, describeQuoFailure(st, {}).outcome === "unknown", describeQuoFailure(st, {}).error);
  }
  check("timeout → UNKNOWN, and says check Quo before resending", describeQuoFailure(null, null, "timeout").outcome === "unknown" && /check/i.test(describeQuoFailure(null, null, "timeout").error), "");
  check("dropped connection → UNKNOWN", describeQuoFailure(null, null, "network").outcome === "unknown", "");
  check("a non-object body does not crash", describeQuoFailure(400, "oops").outcome === "rejected", "");
}

console.log("\n=== 8. Status labels on the timeline ===");
{
  check("sending is 'outcome unknown', never 'failed'", /unknown/i.test(outboundStatusLabel("sending").label) && outboundStatusLabel("sending").tone === "warn", outboundStatusLabel("sending").label);
  check("failed carries its reason", outboundStatusLabel("failed", "Quo refused it.").label.includes("Quo refused it."), outboundStatusLabel("failed", "Quo refused it.").label);
  check("blocked carries the gate's reason", outboundStatusLabel("blocked", "No consent.").label.includes("No consent."), "");
  check("delivered is good news", outboundStatusLabel("delivered").tone === "ok", "");
  check("an unknown status is shown, not hidden", outboundStatusLabel("weird").label === "weird", "");
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
