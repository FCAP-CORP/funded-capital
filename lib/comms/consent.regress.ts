/**
 * Regression suite for the texting consent gate and inbound opt-out keywords.
 *
 * Anything touching consent needs one before it ships (CLAUDE.md, Testing).
 * The failures that matter here are all quiet: a text sent to someone who
 * replied STOP, a text sent under consent to wording that has since changed, a
 * BiggerPockets lead texted with no consent at all, or an opt-out silently
 * lifted by a "START" nobody reviewed. Each has a test below.
 */

import { CONSENT_VERSION } from "../consent";
import {
  E164,
  HELP_KEYWORDS,
  START_KEYWORDS,
  STOP_KEYWORDS,
  canEmail,
  canText,
  inboundKeyword,
  isStopMessage,
  normaliseReply,
  type SmsGateContact,
} from "./consent";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const V = CONSENT_VERSION;
const good: SmsGateContact = {
  phone: "+13055550101",
  smsOptedOut: false,
  smsConsentAt: "2026-08-01T15:00:00.000Z",
  smsConsentVersion: V,
  leadSource: "website",
};
const gate = (c: Partial<SmsGateContact> | null, currentVersion = V) =>
  canText(c === null ? null : { ...good, ...c }, { currentVersion });
const show = (r: ReturnType<typeof canText>) => (r.ok ? `ok (${r.phone}, ${r.consentVersion})` : `${r.code}: ${r.reason}`);

console.log("\n=== 1. A consented contact at the current version may be texted ===");
{
  const r = gate({});
  check("website lead with current consent → allowed", r.ok, show(r));
  check("...the permit carries the phone to text", r.ok && r.phone === "+13055550101", show(r));
  check("...and the consent it relied on, for the outbox row", r.ok && r.consentVersion === V && r.consentAt === "2026-08-01T15:00:00.000Z", show(r));
  const d = gate({ smsConsentAt: new Date("2026-08-01T15:00:00.000Z") });
  check("a Date consent timestamp works as well as a string", d.ok, show(d));
  const spaced = gate({ phone: "  +13055550101 " });
  check("surrounding whitespace on the stored phone is tolerated", spaced.ok && spaced.phone === "+13055550101", show(spaced));
  const intl = gate({ phone: "+447700900123" });
  check("a non-US E.164 number is still a number", intl.ok, show(intl));
}

console.log("\n=== 2. Opt-out beats everything ===");
{
  const r = gate({ smsOptedOut: true });
  check("opted out → blocked", !r.ok && r.code === "opted_out", show(r));
  check("...and the reason says they replied STOP and only they can undo it", !r.ok && /STOP/.test(r.reason) && /only they/i.test(r.reason), show(r));
  const both = gate({ smsOptedOut: true, phone: null, smsConsentAt: null });
  check("opted out AND no phone AND no consent → the opt-out is the reason given", !both.ok && both.code === "opted_out", show(both));
  const nul = gate({ smsOptedOut: null });
  check("opt-out status unknown (null) fails CLOSED", !nul.ok && nul.code === "opted_out", show(nul));
  const fresh = gate({ smsOptedOut: true, smsConsentAt: "2026-09-20T00:00:00Z" });
  check("a later consent timestamp does not override an opt-out", !fresh.ok && fresh.code === "opted_out", show(fresh));
}

console.log("\n=== 3. A number that can be texted ===");
for (const [label, phone] of [
  ["no phone", null],
  ["empty phone", ""],
  ["unnormalised 305-555-0101", "305-555-0101"],
  ["ten digits, no plus", "3055550101"],
  ["too short", "+1305"],
  ["letters", "+1305555ABCD"],
  ["leading zero country code", "+0305555010"],
] as const) {
  const r = gate({ phone });
  check(`${label} → blocked`, !r.ok && r.code === "no_phone", show(r));
}
check("E164 accepts +13055550101", E164.test("+13055550101"), "");
check("E164 rejects 13055550101", !E164.test("13055550101"), "");

console.log("\n=== 4. Consent must exist, and be at the CURRENT version ===");
{
  const none = gate({ smsConsentAt: null, smsConsentVersion: null });
  check("no consent → blocked", !none.ok && none.code === "no_consent", show(none));
  const badDate = gate({ smsConsentAt: "not a date" });
  check("an unreadable consent timestamp is no consent", !badDate.ok && badDate.code === "no_consent", show(badDate));
  const noVer = gate({ smsConsentVersion: null });
  check("consent with no recorded version → blocked", !noVer.ok && noVer.code === "version_unknown", show(noVer));
  const blank = gate({ smsConsentVersion: "  " });
  check("a blank version is no version", !blank.ok && blank.code === "version_unknown", show(blank));
  const old = gate({ smsConsentVersion: "2025-01-15" });
  check("older wording → blocked", !old.ok && old.code === "version_old", show(old));
  check("...and the reason names BOTH versions", !old.ok && old.reason.includes("2025-01-15") && old.reason.includes(V), show(old));
  const newer = gate({ smsConsentVersion: "2099-01-01" });
  check("a version that is not the current one (even 'newer') → blocked", !newer.ok && newer.code === "version_old", show(newer));
  const bumped = gate({}, "2027-01-01");
  check("bumping CONSENT_VERSION blocks everyone on the old wording at once", !bumped.ok && bumped.code === "version_old", show(bumped));
  const empty = gate({ smsConsentVersion: "" }, "");
  check("an empty current version refuses everyone (never matches an empty stored one)", !empty.ok && empty.code === "misconfigured", show(empty));
}

console.log("\n=== 5. BiggerPockets leads, brokers' borrowers, and no contact ===");
{
  const bp = gate({ leadSource: "biggerpockets", smsConsentAt: null, smsConsentVersion: null });
  check("a BiggerPockets lead (no consent) → blocked", !bp.ok && bp.code === "no_consent", show(bp));
  check("...with the reason that texting BP leads is on hold pending counsel", !bp.ok && /BiggerPockets/.test(bp.reason) && /counsel/.test(bp.reason), show(bp));
  const brokerBorrower = gate({ leadSource: "broker", smsConsentAt: null, smsConsentVersion: null });
  check("a borrower a broker introduced (no consent of their own) → blocked", !brokerBorrower.ok && brokerBorrower.code === "no_consent", show(brokerBorrower));
  check("...and is not told it is a BiggerPockets problem", !brokerBorrower.ok && !/BiggerPockets/.test(brokerBorrower.reason), show(brokerBorrower));
  const bpConsented = gate({ leadSource: "biggerpockets" });
  check("a BP lead who later consented THEMSELVES on the website form, at the current version → allowed", bpConsented.ok, show(bpConsented));
  const nobody = gate(null);
  check("no contact on the deal → blocked", !nobody.ok && nobody.code === "no_contact", show(nobody));
  const undef = canText(undefined, { currentVersion: V });
  check("undefined contact → blocked", !undef.ok && undef.code === "no_contact", show(undef));
}

console.log("\n=== 6. Every refusal is a sentence Luis can act on ===");
{
  const cases = [
    gate({ smsOptedOut: true }), gate({ phone: null }), gate({ smsConsentAt: null }),
    gate({ smsConsentVersion: null }), gate({ smsConsentVersion: "x" }), gate(null),
  ];
  for (const r of cases) {
    check(`${r.ok ? "?" : r.code}: plain English, ends with a full stop, no enum names`,
      !r.ok && r.reason.length > 30 && /[.]$/.test(r.reason) && !/sms_|_at\b|null|undefined/.test(r.reason),
      r.ok ? "ALLOWED?" : r.reason);
  }
}

console.log("\n=== 7. canEmail (not used to send yet) ===");
{
  check("subscribed with an address → ok", canEmail({ email: "a@b.co", emailSubscribed: true }).ok, "");
  check("unknown status with an address → ok (a borrower who wrote can be answered)", canEmail({ email: "a@b.co", emailSubscribed: null }).ok, "");
  const unsub = canEmail({ email: "a@b.co", emailSubscribed: false });
  check("unsubscribed → refused, and says only they can re-subscribe", !unsub.ok && /only they/i.test(unsub.reason), JSON.stringify(unsub));
  check("no email → refused", !canEmail({ email: null, emailSubscribed: true }).ok, "");
  check("junk email → refused", !canEmail({ email: "not-an-email", emailSubscribed: true }).ok, "");
  check("no contact → refused", !canEmail(null).ok, "");
}

console.log("\n=== 8. STOP keywords: the whole message, any case, any spacing ===");
const stopForms = [
  "STOP", "stop", "Stop", " stop ", "STOP.", "stop!", "Stop!!", "\"STOP\"", "stop\n",
  "STOPALL", "stopall", "UNSUBSCRIBE", "unsubscribe", "Cancel", "END", "end.", "QUIT", "quit",
  "REVOKE", "opt out", "OPT-OUT", "optout", "  Opt   Out  ", "’stop’",
];
for (const t of stopForms) check(`${JSON.stringify(t)} is an opt-out`, isStopMessage(t), normaliseReply(t));
check("every listed STOP keyword is recognised", STOP_KEYWORDS.every((k) => isStopMessage(k)), STOP_KEYWORDS.join(","));

console.log("\n=== 9. ...and NOT the words inside ordinary replies ===");
const notStop = [
  "Can we stop by the property Friday?", "I want to end the loan early", "Cancel the appraisal please",
  "stopped by the bank", "Stops", "STOP ME IF YOU'VE HEARD THIS", "", "   ", "The END of the month works",
];
for (const t of notStop) check(`${JSON.stringify(t)} is not an automatic opt-out`, !isStopMessage(t), String(inboundKeyword(t)));
check("non-string input is nothing", inboundKeyword(undefined) === null && inboundKeyword(42) === null, "");

console.log("\n=== 10. Opt-out language inside a longer message is FLAGGED, not applied ===");
for (const t of [
  "Please stop texting me", "stop messaging me", "Unsubscribe me from this", "I want to opt out",
  "don't text me again", "Do not contact me", "remove me from your list", "STOP please", "stop, wrong number",
]) {
  check(`${JSON.stringify(t)} → possible_stop`, inboundKeyword(t) === "possible_stop", String(inboundKeyword(t)));
}
for (const t of ["I'll stop by Friday", "Can we end the call early tomorrow", "Yes please send the term sheet"]) {
  check(`${JSON.stringify(t)} → no flag`, inboundKeyword(t) === null, String(inboundKeyword(t)));
}

console.log("\n=== 11. START / HELP are recorded, never applied ===");
for (const t of ["START", "start", "Unstop", "UNSTOP."]) check(`${JSON.stringify(t)} → start`, inboundKeyword(t) === "start", String(inboundKeyword(t)));
check("YES is NOT an opt-in keyword (far too common in normal replies)", inboundKeyword("Yes") === null && !(START_KEYWORDS as readonly string[]).includes("YES"), String(inboundKeyword("Yes")));
for (const t of HELP_KEYWORDS) check(`${t} → help`, inboundKeyword(t) === "help", String(inboundKeyword(t)));
check("START is never a stop", !isStopMessage("START"), "");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
