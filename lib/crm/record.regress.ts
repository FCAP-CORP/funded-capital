/**
 * Regression suite for the record card's presentation rules.
 *
 * The card is where one deal is read in full, so the failures that matter are
 * the quiet ones: a stale flag on a performing loan, a consent line that reads
 * as permission when the person texted STOP, a timeline that drops history
 * without saying so, or an activity kind printed as a raw enum.
 */

import { activityKindEnum, participantRoleEnum } from "../db/schema";
import { STALE_DAYS } from "./board";
import {
  ACTIVITY_LABEL,
  DOC_STATUS_LABEL,
  ROLE_LABEL,
  TIMELINE_LIMIT,
  addressLine,
  buildTimeline,
  docStatus,
  emailConsent,
  loanPurposeLabel,
  ratioText,
  smsConsent,
  stageAge,
  telHref,
  whenLabel,
  type ActivityInput,
  type TransitionInput,
} from "./record";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NOW = new Date("2026-09-24T14:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

console.log("\n=== 1. Days in stage and the stale flag ===");
const fresh = stageAge("underwriting", daysAgo(3), NOW);
check("three days in underwriting is not stale", fresh.days === 3 && !fresh.stale, JSON.stringify(fresh));
const old = stageAge("underwriting", daysAgo(STALE_DAYS), NOW);
check(`${STALE_DAYS} days in underwriting IS stale (same threshold as the board)`, old.stale, JSON.stringify(old));
const edge = stageAge("lead", daysAgo(STALE_DAYS - 1), NOW);
check("one day short is not", !edge.stale, JSON.stringify(edge));
const servicing = stageAge("active", daysAgo(90), NOW);
check("a performing loan in Active for 90 days is NOT stale", !servicing.stale && servicing.days === 90, JSON.stringify(servicing));
const lost = stageAge("closed_lost", daysAgo(200), NOW);
check("a closed deal is never stale", !lost.stale, JSON.stringify(lost));
const funded = stageAge("funded", daysAgo(45), NOW);
check("a funded deal is never stale", !funded.stale, JSON.stringify(funded));
const unknown = stageAge("lead", null, NOW);
check("no entry date means no age and no flag", unknown.days === null && !unknown.stale, JSON.stringify(unknown));

console.log("\n=== 2. Loan and property wording ===");
check("purchase", loanPurposeLabel("purchase") === "Purchase", String(loanPurposeLabel("purchase")));
check("cash-out uses the pricing engine's label", loanPurposeLabel("cash_out_refi") === "Cash-Out Refi", String(loanPurposeLabel("cash_out_refi")));
check("an unknown purpose is shown, not hidden", loanPurposeLabel("something_new") === "something_new", String(loanPurposeLabel("something_new")));
check("no purpose is null", loanPurposeLabel(null) === null, "null");
check(
  "a full address",
  addressLine({ addressLine1: "12 Oak St", city: "Tampa", state: "FL", postalCode: "33602" }) === "12 Oak St, Tampa, FL 33602",
  String(addressLine({ addressLine1: "12 Oak St", city: "Tampa", state: "FL", postalCode: "33602" })),
);
check(
  "missing pieces are skipped, not printed as blanks",
  addressLine({ addressLine1: null, city: "Tampa", state: "FL", postalCode: null }) === "Tampa, FL",
  String(addressLine({ addressLine1: null, city: "Tampa", state: "FL", postalCode: null })),
);
check(
  "nothing at all is null",
  addressLine({ addressLine1: " ", city: null, state: null, postalCode: null }) === null,
  "null",
);

check("85% LTC reads as 85.0%", ratioText("0.8500")?.text === "85.0%", String(ratioText("0.8500")?.text));
check("exactly 100% is still a number", ratioText(1)?.text === "100.0%" && !ratioText(1)?.incomplete, String(ratioText(1)?.text));
check("136.8% is marked incomplete, not shown as leverage", ratioText("1.368")?.incomplete === true, String(ratioText("1.368")?.text));
check("no ratio is null, not 0%", ratioText(null) === null && ratioText("") === null, "null");
check("garbage is null", ratioText("n/a") === null, "null");

console.log("\n=== 3. Phone links ===");
check("an E.164 number dials", telHref("+13055550101") === "tel:+13055550101", String(telHref("+13055550101")));
check("an unnormalised number does not (it would dial the wrong thing)", telHref("305-555-0101") === null, "null");
check("no number, no link", telHref(null) === null, "null");

console.log("\n=== 4. Consent is described, never granted ===");
const V = "2026-07-27";
const optedOut = smsConsent({ smsOptedOut: true, smsConsentAt: daysAgo(100), smsConsentVersion: V }, V);
check("an opt-out beats an earlier consent", optedOut.tone === "warn" && /opted out/i.test(optedOut.text), optedOut.text);
const current = smsConsent({ smsOptedOut: false, smsConsentAt: daysAgo(10), smsConsentVersion: V }, V);
check("consent at the current wording is ok", current.tone === "ok", current.text);
const older = smsConsent({ smsOptedOut: false, smsConsentAt: daysAgo(400), smsConsentVersion: "2025-01-01" }, V);
check("consent at older wording is flagged, and names the version", older.tone === "warn" && older.text.includes("2025-01-01"), older.text);
const noVersion = smsConsent({ smsOptedOut: false, smsConsentAt: daysAgo(10), smsConsentVersion: null }, V);
check("consent with no version recorded is flagged", noVersion.tone === "warn", noVersion.text);
const nothing = smsConsent({ smsOptedOut: false, smsConsentAt: null, smsConsentVersion: null }, V);
check("no record reads as no consent — never as permission", nothing.tone === "none" && /no text consent/i.test(nothing.text), nothing.text);
check("email subscribed", emailConsent(true).tone === "ok", emailConsent(true).text);
check("email unsubscribed is flagged", emailConsent(false).tone === "warn", emailConsent(false).text);
check("email unknown is unknown", emailConsent(null).tone === "none", emailConsent(null).text);

console.log("\n=== 5. Every enum value has a label ===");
const missingKinds = activityKindEnum.enumValues.filter((k) => !ACTIVITY_LABEL[k]);
const extraKinds = Object.keys(ACTIVITY_LABEL).filter((k) => !(activityKindEnum.enumValues as readonly string[]).includes(k));
check("every activity kind in the database has a timeline label", missingKinds.length === 0, missingKinds.join(", ") || `${activityKindEnum.enumValues.length} kinds`);
check("the timeline invents no kind the database lacks", extraKinds.length === 0, extraKinds.join(", ") || "none");
const missingRoles = participantRoleEnum.enumValues.filter((r) => !ROLE_LABEL[r]);
check("every participant role has a label", missingRoles.length === 0, missingRoles.join(", ") || `${participantRoleEnum.enumValues.length} roles`);
check("every document status has a label", (["received", "requested", "expired", "listed"] as const).every((s) => DOC_STATUS_LABEL[s]), "all");

console.log("\n=== 6. The timeline ===");
const act = (id: string, at: string, kind = "call", extra: Partial<ActivityInput> = {}): ActivityInput =>
  ({ id, kind, occurredAt: at, source: "crm", subject: null, body: null, ...extra });
const move = (id: string, at: string, from: string | null, to: string, reason: string | null = null): TransitionInput =>
  ({ id, fromStage: from, toStage: to, changedAt: at, reason });

const tl = buildTimeline(
  [
    act("a1", daysAgo(1), "call", { subject: "Called", body: "Left voicemail" }),
    act("a2", daysAgo(5), "email_in", { source: "gmail", subject: "Re: term sheet" }),
    act("a3", daysAgo(3), "note", { subject: "Put down until 2026-10-01", body: "Waiting on appraisal" }),
  ],
  [
    move("s1", daysAgo(2), "qualified", "term_sheet_issued"),
    move("s2", daysAgo(10), null, "lead"),
    move("s3", daysAgo(0.5), "term_sheet_issued", "closed_lost", "lost: Rate or terms — went with a bank"),
  ],
  { totalActivities: 3, totalTransitions: 3 },
);
check("newest first, activities and moves interleaved", tl.items.map((i) => i.key).join(",") === "s:s3,a:a1,s:s1,a:a3,a:a2,s:s2", tl.items.map((i) => i.key).join(","));
check("nothing older when everything fits", tl.older === 0, String(tl.older));
const call = tl.items.find((i) => i.key === "a:a1")!;
check("a logged call is titled 'Call' and does not repeat 'Called'", call.title === "Call" && call.subject === null, JSON.stringify(call));
check("...and keeps its note", call.body === "Left voicemail", String(call.body));
const inbound = tl.items.find((i) => i.key === "a:a2")!;
check("an inbound email keeps its subject line", inbound.title === "Email from them" && inbound.subject === "Re: term sheet", JSON.stringify(inbound));
const snooze = tl.items.find((i) => i.key === "a:a3")!;
check("a snooze note keeps 'Put down until…'", snooze.subject === "Put down until 2026-10-01" && snooze.body === "Waiting on appraisal", JSON.stringify(snooze));
const lostMove = tl.items.find((i) => i.key === "s:s3")!;
check("a lost move shows from → to", lostMove.title === "Term Sheet Issued → Closed — Lost", lostMove.title);
check("...and the lost reason", lostMove.reason === "lost: Rate or terms — went with a bank", String(lostMove.reason));
const first = tl.items.find((i) => i.key === "s:s2")!;
check("the first stage reads as 'Entered'", first.title === "Entered Lead", first.title);
const quiet = buildTimeline([], [move("x", daysAgo(1), "lead", "qualified", "changed in the CRM")], { totalActivities: 0, totalTransitions: 1 });
check("the default 'changed in the CRM' reason is not shown", quiet.items[0].reason === null, String(quiet.items[0].reason));

const many = Array.from({ length: TIMELINE_LIMIT }, (_, i) => act(`m${i}`, daysAgo(i + 1)));
const manyMoves = Array.from({ length: TIMELINE_LIMIT }, (_, i) => move(`n${i}`, daysAgo(i + 1.5), "lead", "qualified"));
const capped = buildTimeline(many, manyMoves, { totalActivities: 180, totalTransitions: 70 });
check(`capped at ${TIMELINE_LIMIT}`, capped.items.length === TIMELINE_LIMIT, String(capped.items.length));
check("older counts EVERYTHING not shown, from the database totals", capped.older === 250 - TIMELINE_LIMIT, String(capped.older));
check("the cap keeps the newest", capped.items[0].key === "a:m0", capped.items[0].key);
const lying = buildTimeline([act("z", daysAgo(1))], [], { totalActivities: 0, totalTransitions: 0 });
check("a total smaller than the rows given cannot make 'older' negative", lying.older === 0, String(lying.older));

check("an evening call reads on its New York day", whenLabel("2026-09-24T01:30:00Z", NOW) === "Wed 23 Sep, 9:30 PM", whenLabel("2026-09-24T01:30:00Z", NOW));
check("last year's item carries its year", whenLabel("2025-12-31T15:00:00Z", NOW) === "Wed 31 Dec 2025, 10:00 AM", whenLabel("2025-12-31T15:00:00Z", NOW));
check("no time is a dash", whenLabel(null, NOW) === "—", "—");

console.log("\n=== 7. Documents: status from dates, never contents ===");
check("received", docStatus({ requestedAt: daysAgo(5), receivedAt: daysAgo(1), expiresOn: null }, NOW) === "received", "received");
check("requested", docStatus({ requestedAt: daysAgo(5), receivedAt: null, expiresOn: null }, NOW) === "requested", "requested");
check("expired beats received", docStatus({ requestedAt: null, receivedAt: daysAgo(100), expiresOn: daysAgo(1) }, NOW) === "expired", "expired");
check("not yet expired is still received", docStatus({ requestedAt: null, receivedAt: daysAgo(1), expiresOn: new Date(NOW.getTime() + 86_400_000).toISOString() }, NOW) === "received", "received");
check("no dates is simply on file", docStatus({ requestedAt: null, receivedAt: null, expiresOn: null }, NOW) === "listed", "listed");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
