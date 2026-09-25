/**
 * Regression suite for email from the record card: the draft rules, the MIME
 * message, the signature, and the Connect Gmail flow's redirects and cookie.
 */
import { createHash } from "node:crypto";
import {
  GMAIL_SCOPES, base64Url, buildMime, encodeHeader, googleAuthUrl, hasAllScopes, parseEmailDraft,
  safeReturnPath, signatureToText, textToHtml, withGmailStatus, GMAIL_STATUS_TEXT,
} from "./email";
import { OAUTH_COOKIE_MAX_AGE, newOAuthFlow, readOAuthFlow, sameState } from "./gmailOAuthCookie";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. The draft ===");
const ok = parseEmailDraft("  Your Fix & Flip loan request ", "Hi Tony,\r\n\r\nThanks.\r\n");
check("valid draft passes, trimmed, CRLF normalised", ok.ok && ok.subject === "Your Fix & Flip loan request" && ok.body === "Hi Tony,\n\nThanks.", JSON.stringify(ok));
check("empty subject refused", !parseEmailDraft("", "x").ok, "");
check("empty body refused", !parseEmailDraft("Hi", "   ").ok, "");
check("a line break in the subject is refused (header injection)", !parseEmailDraft("Hi\r\nBcc: x@y.com", "x").ok, "");
check("…a bare LF too", !parseEmailDraft("Hi\nBcc: x@y.com", "x").ok, "");
check("an HTML entity in the subject is refused (the 3 Sep &amp; incident)", !parseEmailDraft("fix &amp; flip", "x").ok, "");
check("…numeric entities too", !parseEmailDraft("fix &#38; flip", "x").ok && !parseEmailDraft("fix &#x26; flip", "x").ok, "");
check("a literal & is fine", parseEmailDraft("Fix & Flip", "x").ok, "");
check("subject over 200 refused", !parseEmailDraft("a".repeat(201), "x").ok, "");
check("body over 20,000 refused", !parseEmailDraft("Hi", "a".repeat(20_001)).ok, "");
check("a leftover {{placeholder}} is refused", !parseEmailDraft("Hi", "Hi {{firstName}}").ok, "");

console.log("\n=== 2. HTML and the signature ===");
check("text is escaped and line breaks become <br>", textToHtml(`a < b & "c"\nnext`) === `<div dir="ltr">a &lt; b &amp; &quot;c&quot;<br>next</div>`, textToHtml(`a < b & "c"\nnext`));
const sig = `<div dir="ltr"><b>Luis Fajardo</b><div>Founder &amp; CEO</div><div>Funded Capital</div><div><a href="tel:+13058575620">(305) 857-5620</a><br>fundedcapital.com</div><script>alert(1)</script></div>`;
const sigText = signatureToText(sig);
check("signature text keeps its lines", sigText === "Luis Fajardo\nFounder & CEO\nFunded Capital\n(305) 857-5620\nfundedcapital.com", JSON.stringify(sigText));
check("…and drops scripts", !sigText.includes("alert"), "no script");
check("a Gmail spacer line (<div><br></div>) stays one blank line", signatureToText("<div>Luis</div><div><br></div><div>Funded</div>") === "Luis\n\nFunded", JSON.stringify(signatureToText("<div>Luis</div><div><br></div><div>Funded</div>")));
check("numeric entities decode", signatureToText("A&#8212;B&#x2014;C") === "A—B—C", signatureToText("A&#8212;B&#x2014;C"));

console.log("\n=== 3. The MIME message ===");
const mime = buildMime({
  from: "luis@fundedcapital.com", fromName: "Luis Fajardo", to: "tony@example.com",
  subject: "Your Fix & Flip loan request", text: "Hi Tony,\n\nThanks — talk soon.", signatureHtml: sig,
  boundary: "B1", date: new Date("2026-09-25T15:00:00Z"),
});
const [head, ...rest] = mime.split("\r\n\r\n");
check("From carries the display name", head.includes(`From: "Luis Fajardo" <luis@fundedcapital.com>`), "");
check("To is the borrower", head.includes("To: tony@example.com"), "");
check("ASCII subject is sent as-is — with a literal &", head.includes("Subject: Your Fix & Flip loan request") && !head.includes("&amp;"), "");
check("no Bcc / Cc header can appear", !/^(Bcc|Cc):/im.test(head), "");
check("multipart/alternative with both parts", mime.includes("multipart/alternative") && mime.includes("text/plain") && mime.includes("text/html"), "");
const parts = rest.join("\r\n\r\n").split("--B1");
const decode = (p: string) => Buffer.from(p.split("\r\n\r\n")[1]?.replace(/\r\n/g, "") ?? "", "base64").toString("utf8");
const textPart = decode(parts.find((p) => p.includes("text/plain")) ?? "");
const htmlPart = decode(parts.find((p) => p.includes("text/html")) ?? "");
check("plain part = body + '-- ' + signature text", textPart === `Hi Tony,\n\nThanks — talk soon.\n\n-- \n${sigText}`, JSON.stringify(textPart.slice(-40)));
check("html part carries the signature HTML in Gmail's own wrapper", htmlPart.includes('class="gmail_signature"') && htmlPart.includes("<b>Luis Fajardo</b>"), "");
check("no tracking pixel or rewritten links", !/<img/i.test(htmlPart.replace(sig, "")) && !/utm_|track/i.test(htmlPart), "clean");
const noSig = buildMime({ from: "luis@fundedcapital.com", to: "t@example.com", subject: "Hi", text: "x", signatureHtml: null, boundary: "B" });
check("no signature → no '-- ' separator", !Buffer.from(noSig.split("--B")[1].split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString().includes("-- "), "");
check("non-ASCII subject is RFC 2047 encoded", encodeHeader("Próximo paso") === `=?UTF-8?B?${Buffer.from("Próximo paso").toString("base64")}?=`, encodeHeader("Próximo paso"));
let threw = false;
try { buildMime({ from: "luis@fundedcapital.com", to: "t@example.com\r\nBcc: x@y.com", subject: "Hi", text: "x", signatureHtml: null }); } catch { threw = true; }
check("a line break in To throws (second lock)", threw, "");
threw = false;
try { buildMime({ from: "luis@fundedcapital.com", to: "not an address", subject: "Hi", text: "x", signatureHtml: null }); } catch { threw = true; }
check("a bad address throws", threw, "");
check("base64url has no + / =", !/[+/=]/.test(base64Url(mime)), "url-safe");

console.log("\n=== 4. Connect Gmail: only two permissions, redirects stay inside /crm ===");
check("exactly send + settings.basic — never read access", GMAIL_SCOPES.length === 2 && GMAIL_SCOPES.every((s) => /gmail\.(send|settings\.basic)$/.test(s)) && !GMAIL_SCOPES.some((s) => /readonly|modify|mail\.google\.com/.test(s)), GMAIL_SCOPES.join(" "));
const url = new URL(googleAuthUrl({ clientId: "cid", redirectUri: "https://www.fundedcapital.com/api/crm/google/callback", state: "st", codeChallenge: "ch", loginHint: "luis@fundedcapital.com" }));
check("auth URL asks offline + consent (so a refresh token always comes back)", url.searchParams.get("access_type") === "offline" && url.searchParams.get("prompt") === "consent", "");
check("…with state and an S256 PKCE challenge", url.searchParams.get("state") === "st" && url.searchParams.get("code_challenge_method") === "S256", "");
check("hasAllScopes: both → true", hasAllScopes(GMAIL_SCOPES.join(" ")), "");
check("hasAllScopes: one missing → false", !hasAllScopes(GMAIL_SCOPES[0]), "");
for (const [input, want] of [
  ["/crm?open=abc", "/crm?open=abc"],
  ["/crm/board?open=abc", "/crm/board?open=abc"],
  ["https://evil.com", "/crm"],
  ["//evil.com", "/crm"],
  ["/crm//evil.com", "/crm"],
  ["/\\evil.com", "/crm"],
  ["/crmx", "/crm"],
  ["/broker-portal", "/crm"],
  [null, "/crm"],
] as const) {
  check(`safeReturnPath(${JSON.stringify(input)}) → ${want}`, safeReturnPath(input) === want, safeReturnPath(input));
}
check("withGmailStatus appends to an existing query", withGmailStatus("/crm?open=abc", "connected") === "/crm?open=abc&gmail=connected", withGmailStatus("/crm?open=abc", "connected"));
check("withGmailStatus on a bare path", withGmailStatus("/crm/board", "denied") === "/crm/board?gmail=denied", "");
check("every status the callback can send has a sentence", ["connected", "denied", "wrong-account", "scopes", "no-refresh", "expired", "not-configured", "error"].every((k) => typeof GMAIL_STATUS_TEXT[k] === "string"), "");

console.log("\n=== 5. The OAuth cookie ===");
const now = Date.parse("2026-09-25T15:00:00Z");
const realNow = Date.now;
Date.now = () => now;
const flow = newOAuthFlow("/crm?open=abc");
Date.now = realNow;
const read = readOAuthFlow(flow.cookie, now + 1000);
check("round trip keeps state, verifier and return path", read?.state === flow.state && read?.verifier === flow.verifier && read?.returnTo === "/crm?open=abc", "");
check("PKCE challenge is S256 of the verifier", flow.challenge === createHash("sha256").update(flow.verifier).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "");
check("expires after ten minutes", readOAuthFlow(flow.cookie, now + OAUTH_COOKIE_MAX_AGE * 1000 + 1) === null, "");
check("garbage → null", readOAuthFlow("xyz", now) === null && readOAuthFlow(undefined, now) === null, "");
check("state compare: same → true", sameState(flow.state, flow.state), "");
check("state compare: different / missing → false", !sameState(flow.state, flow.state.slice(0, -1) + (flow.state.endsWith("x") ? "y" : "x")) && !sameState(null, flow.state) && !sameState("", ""), "");
check("two flows never share a state", newOAuthFlow("/crm").state !== newOAuthFlow("/crm").state, "");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
