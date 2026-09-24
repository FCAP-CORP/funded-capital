/**
 * Regression suite for BiggerPockets lead mapping (lib/leads/biggerpockets.ts).
 *
 * Every input below is shaped like what `parseBpLead_` in the BiggerPockets
 * Apps Script actually produces: "N/A" for every absent field (never blank),
 * firstName "there" when BP sent no name, targetPrice back-filled from
 * maxPrice, phoneE164 empty when the parser could not normalise. The strategy,
 * loan-type, credit and money strings are the ones in the live BiggerPockets
 * Leads tab and the 14 Sep export ("Get a home equity loan (investment
 * property)", "Fix & flip or bridge loans", "760+", "$1,500,000"…). A suite
 * that invents tidy values passes while production maps real leads wrongly —
 * that is how every /contact lead once landed as `unknown`.
 */

import {
  BP_LEAD_FIELDS, bpDedupKey, buildBpRecord, buildBpRows, contactGapFill,
  migratedTwin, planBpWrite, singleMoney, usableEmail, validateBpItem,
  MAX_BP_LEADS_PER_REQUEST,
  type BpIntakeItem, type BpKnown, type BpLead, type ExistingContact,
} from "./biggerpockets";
import { mapProduct } from "../migrate/transform";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NA = "N/A";
/** A full parser output with every field "N/A", then overrides. */
function parsed(over: BpLead = {}): BpLead {
  const base: BpLead = {};
  for (const f of BP_LEAD_FIELDS) base[f] = NA;
  base.profileUrl = "";
  base.phoneE164 = "";
  base.firstName = "there";
  base.lastName = "";
  return { ...base, ...over };
}

/** What processBiggerPocketsLeads + postBpLeadToLendingOs_ send for a real lead. */
const KIMBERLY = parsed({
  name: "Kimberly Collins", firstName: "Kimberly", lastName: "Collins",
  profile: "kimberlyc88", profileUrl: "https://www.biggerpockets.com/users/kimberlyc88",
  email: "kcollins.invest@gmail.com", phone: "(614) 530-9478", phoneE164: "+16145309478",
  preferredContact: "Phone", market: "Columbus, OH", marketZip: "43068",
  strategy: "Finance a fix and flip", goal: "Fix & flip", loanType: "Fix & flip or bridge loans",
  ownerOccupied: "No", timeline: "Under contract", creditScore: "740-759",
  downPayment: "$28,500", propertyAddress: "5050 Open Meadows Dr, Columbus OH",
  maxPrice: "$159,000", targetPrice: "$159,000", amountNeeded: "$130,500",
  numInvestments: "2-5", uniqueSituations: "None", specificProperty: "Yes",
  preApproval: "Yes", source: "Business Finder", comments: "Closing in 21 days, need a quick answer",
  messageId: "18f3a9c2d4e5b6a7", subject: "New lead from BiggerPockets!",
});
const AT = new Date("2026-09-20T14:05:00.000Z");
const NOW = new Date("2026-09-24T12:00:00.000Z");

const item = (lead: BpLead, over: Partial<BpIntakeItem> = {}): BpIntakeItem => {
  const v = validateBpItem({ ...lead, gmailMessageId: lead.messageId, receivedAt: AT.toISOString() }, NOW);
  if (!v.ok) throw new Error(`fixture invalid: ${v.error}`);
  return { ...v.item, ...over };
};

/* ------------------------------------------------------------------------ */
console.log("\n=== 1. A complete, real-shaped lead maps onto the CRM's columns ===");
const k = buildBpRecord(KIMBERLY);
check("first / last from the parser", k.firstName === "Kimberly" && k.lastName === "Collins", `${k.firstName} / ${k.lastName}`);
check("email kept, lowercased", k.email === "kcollins.invest@gmail.com", k.email ?? "null");
check("phone is E.164", k.phone === "+16145309478" && k.phoneRaw === null, k.phone ?? "null");
check("market splits into city + state", k.targetMarket === "Columbus" && k.state === "OH", `${k.targetMarket} / ${k.state}`);
check("market zip kept as postal code", k.postalCode === "43068", k.postalCode ?? "null");
check("credit band verbatim", k.creditBand === "740-759", k.creditBand ?? "null");
check("profile url kept", k.profileUrl === "https://www.biggerpockets.com/users/kimberlyc88", k.profileUrl ?? "null");
check("target price parsed", k.targetPrice === 159000, String(k.targetPrice));
check("down payment parsed", k.downPayment === 28500, String(k.downPayment));
check("amount needed parsed", k.amountNeeded === 130500, String(k.amountNeeded));
check("F&F-or-bridge with a flip goal -> fix_and_flip (the migration's rule)", k.product === "fix_and_flip" && k.productConfident, k.product);
check("timeline kept", k.timeline === "Under contract", k.timeline ?? "null");
check("comments are the borrower's message, verbatim", k.message === "Closing in 21 days, need a quick answer", k.message ?? "null");
check("notes say where it came from", (k.notes ?? "").startsWith("via BiggerPockets"), k.notes ?? "null");
check("notes carry what has no column (goal, strategy, pre-approval)",
  /goal: Fix & flip/.test(k.notes ?? "") && /strategy: Finance a fix and flip/.test(k.notes ?? "") && /pre-approval: Yes/.test(k.notes ?? ""),
  "goal · strategy · pre-approval");
check("'None' from BP is not written as a unique situation", !/unique situations/.test(k.notes ?? ""), "skipped");

/* ------------------------------------------------------------------------ */
console.log("\n=== 2. Product: the 14 Sep migration's classifier, reused verbatim ===");
const prod = (o: BpLead) => buildBpRecord(parsed(o)).product;
const same = (o: BpLead) => buildBpRecord(parsed(o)).product === mapProduct({ loanType: o.loanType ?? NA, goal: o.goal ?? NA, strategy: o.strategy ?? NA }).product;
check("HELOC goal -> not_our_product", prod({ goal: "HELOC" }) === "not_our_product", prod({ goal: "HELOC" }));
check("HELOC beats a DSCR loan type", prod({ goal: "HELOC", loanType: "DSCR loans" }) === "not_our_product", "the goal wins");
check("home equity strategy -> not_our_product", prod({ strategy: "Get a home equity loan (investment property)" }) === "not_our_product", "not_our_product");
check("conventional -> not_our_product", prod({ loanType: "Conventional loans" }) === "not_our_product", "not_our_product");
check("'Finance a long-term rental' -> dscr", prod({ strategy: "Finance a long-term rental" }) === "dscr", "dscr");
check("'Refinance an investment property' -> dscr", prod({ strategy: "Refinance an investment property" }) === "dscr", "dscr");
check("'Get a bridge loan' -> bridge", prod({ strategy: "Get a bridge loan" }) === "bridge", "bridge");
check("'Finance a rehab for buy-and-hold' -> fix_and_flip", prod({ strategy: "Finance a rehab for buy-and-hold" }) === "fix_and_flip", "fix_and_flip");
check("'DSCR loans' -> dscr", prod({ loanType: "DSCR loans" }) === "dscr", "dscr");
check("'New Construction' -> ground_up", prod({ loanType: "New Construction" }) === "ground_up", "ground_up");
check("F&F-or-bridge, no goal -> bridge, NOT confident", prod({ loanType: "Fix & flip or bridge loans" }) === "bridge"
  && !buildBpRecord(parsed({ loanType: "Fix & flip or bridge loans" })).productConfident, "bridge, confident=false");
check("...and the low confidence is said in the notes",
  /low confidence/.test(buildBpRecord(parsed({ loanType: "Fix & flip or bridge loans" })).notes ?? ""), "noted");
check("all N/A -> unknown", prod({}) === "unknown", "unknown");
for (const o of [
  { goal: "HELOC" }, { strategy: "Get a home equity loan (investment property)" }, { loanType: "Conventional loans" },
  { loanType: "Fix & flip or bridge loans", goal: "BRRRR" }, { strategy: "Finance a long-term rental" }, { loanType: "Multiple" },
] as BpLead[]) {
  check(`  identical to mapProduct for ${JSON.stringify(o)}`, same(o), prod(o));
}

/* ------------------------------------------------------------------------ */
console.log("\n=== 3. Missing and malformed contact details — kept, never dropped ===");
const noPhone = buildBpRecord(parsed({ name: "Don Hulse", firstName: "Don", lastName: "Hulse", email: "alphahomes467@gmail.com" }));
check("no phone -> both phone fields null", noPhone.phone === null && noPhone.phoneRaw === null, "null / null");
check("...and nothing about phone in the notes", !/phone/.test(noPhone.notes ?? ""), noPhone.notes ?? "");
const e164Missing = buildBpRecord(parsed({ email: "a@b.co", phone: "1-770-369-1767", phoneE164: "" }));
check("parser gave no E.164 but the raw number normalises", e164Missing.phone === "+17703691767", e164Missing.phone ?? "null");
const badPhone = buildBpRecord(parsed({ email: "a@b.co", phone: "555-0101", phoneE164: "" }));
check("undiallable phone -> null, raw kept", badPhone.phone === null && badPhone.phoneRaw === "555-0101", badPhone.phoneRaw ?? "null");
check("...and flagged in the notes", /phone as given \(not diallable\): 555-0101/.test(badPhone.notes ?? ""), "flagged");
const badEmail = buildBpRecord(parsed({ email: "jessy.chavez at hotmail", phone: "(915) 861-9738", phoneE164: "+19158619738" }));
check("bad email -> null (never stored as an identity key)", badEmail.email === null, "null");
check("...kept verbatim for a human", badEmail.emailAsGiven === "jessy.chavez at hotmail", badEmail.emailAsGiven ?? "null");
check("...and flagged in the notes", /email as given \(not usable\)/.test(badEmail.notes ?? ""), "flagged");
check("usableEmail uses the Apps Script's own rule", usableEmail(" Mixed@Case.COM ") === "mixed@case.com" && usableEmail("N/A") === null && usableEmail("x@y") === null, "ok");
const noName = buildBpRecord(parsed({ email: "qiaoeraj@gmail.com" }));
check("parser's 'there' placeholder is NOT stored as a first name", noName.firstName === null && noName.lastName === null, `${noName.firstName}`);
const oneName = buildBpRecord(parsed({ name: "Qiao", firstName: "Qiao", lastName: "", email: "q@x.io" }));
check("single name -> first name, null last", oneName.firstName === "Qiao" && oneName.lastName === null, `${oneName.firstName} / ${oneName.lastName}`);
const long = buildBpRecord(parsed({ name: "Barbara Hsusenfluck Gronbach", firstName: "Barbara", lastName: "Hsusenfluck Gronbach", email: "b@g.com" }));
check("multi-part surname stays whole", long.lastName === "Hsusenfluck Gronbach", long.lastName ?? "null");

/* ------------------------------------------------------------------------ */
console.log("\n=== 4. Money, markets and BP's filler ===");
check("singleMoney('$1,500,000')", singleMoney("$1,500,000").value === 1500000, "1500000");
check("singleMoney('N/A') is null, not 0", singleMoney("N/A").value === null && singleMoney("N/A").unparsed === null, "null");
check("singleMoney('$0') is a real zero", singleMoney("$0").value === 0, "0");
check("a range is refused, not read as 100000150000", singleMoney("$100,000 - $150,000").value === null && singleMoney("$100,000 - $150,000").unparsed === "$100,000 - $150,000", "refused, kept");
check("a percentage is refused, not read as dollars", singleMoney("20%").value === null, "refused");
const ranged = buildBpRecord(parsed({ email: "r@x.com", downPayment: "20%", amountNeeded: "$300k-$400k" }));
check("refused figures are kept in the notes", /down payment as given: 20%/.test(ranged.notes ?? "") && /amount needed as given: \$300k-\$400k/.test(ranged.notes ?? ""), "kept");
const maxOnly = buildBpRecord(parsed({ email: "m@x.com", maxPrice: "$95,000", targetPrice: NA }));
check("target falls back to maximum target price", maxOnly.targetPrice === 95000, String(maxOnly.targetPrice));
const noState = buildBpRecord(parsed({ email: "s@x.com", market: "Florida" }));
check("market without a state is tolerated", noState.targetMarket === "Florida" && noState.state === null, `${noState.targetMarket} / ${noState.state}`);
check("a non-zip market zip is ignored", buildBpRecord(parsed({ email: "z@x.com", marketZip: "Columbus" })).postalCode === null, "null");
check("comments 'None' is not a message", buildBpRecord(parsed({ email: "n@x.com", comments: "None" })).message === null, "null");
check("a non-BP profile url is not stored", buildBpRecord(parsed({ email: "p@x.com", profileUrl: "https://evil.example/users/x" })).profileUrl === null, "null");

/* ------------------------------------------------------------------------ */
console.log("\n=== 5. Validation: lenient about content, strict about identity ===");
const ok = validateBpItem({ ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: "2026-09-20T14:05:00.000Z" }, NOW);
check("a real lead validates", ok.ok, ok.ok ? ok.item.dedupKey : ok.error);
check("key is bp:gmail:<id>", ok.ok && ok.item.dedupKey === "bp:gmail:18f3a9c2d4e5b6a7", ok.ok ? ok.item.dedupKey : "");
const viaMessageId = validateBpItem({ ...KIMBERLY, receivedAt: AT.toISOString() }, NOW);
check("the parser's own messageId is accepted when gmailMessageId is absent", viaMessageId.ok && viaMessageId.item.gmailMessageId === "18f3a9c2d4e5b6a7", "accepted");
const cases: [string, unknown, RegExp][] = [
  ["not an object", "hello", /JSON object/],
  ["an array", [1, 2], /JSON object/],
  ["null", null, /JSON object/],
  ["no receivedAt", { ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7" }, /receivedAt/],
  ["garbage receivedAt", { ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: "yesterday-ish" }, /receivedAt/],
  ["receivedAt in 2019", { ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: "2019-01-01T00:00:00Z" }, /plausible/],
  ["receivedAt next week", { ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: "2026-10-01T00:00:00Z" }, /plausible/],
  ["id with spaces/slashes", { ...KIMBERLY, gmailMessageId: "../../etc passwd", receivedAt: AT.toISOString() }, /not a Gmail message id/],
  ["nothing to identify anyone", { ...parsed(), gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: AT.toISOString() }, /format may have changed/],
  ["name only, no id -> cannot be keyed", { ...parsed({ name: "Ann Lee", firstName: "Ann", lastName: "Lee", messageId: "" }), receivedAt: AT.toISOString() }, /no gmailMessageId/],
];
for (const [label, raw, re] of cases) {
  const v = validateBpItem(raw, NOW);
  check(`  ${label} -> per-lead error`, !v.ok && re.test(v.error), v.ok ? "**ACCEPTED**" : v.error);
}
const bad = validateBpItem({ ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7" }, NOW);
check("an error still names the lead's message id", !bad.ok && bad.gmailMessageId === "18f3a9c2d4e5b6a7", bad.ok ? "" : String(bad.gmailMessageId));
const nameOnly = validateBpItem({ ...parsed({ name: "Ann Lee", firstName: "Ann", lastName: "Lee" }), gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: AT.toISOString() }, NOW);
check("name only WITH a message id is still written (never discard)", nameOnly.ok, nameOnly.ok ? "accepted" : nameOnly.error);
const huge = validateBpItem({ ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: AT.toISOString(), comments: "x".repeat(50_000), market: "y".repeat(10_000) }, NOW);
check("an oversized field is truncated, not refused", huge.ok && huge.item.lead.comments!.length === 8000 && huge.item.lead.market!.length === 2000, "8000 / 2000");
const stray = validateBpItem({ ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: AT.toISOString(), secret: "x", isAdmin: true, email: { $ne: 1 } }, NOW);
check("unknown keys and non-string values are ignored", stray.ok && !("secret" in stray.item.lead) && stray.item.lead.email === undefined, "ignored");
check("per-request cap is 50", MAX_BP_LEADS_PER_REQUEST === 50, String(MAX_BP_LEADS_PER_REQUEST));

/* ------------------------------------------------------------------------ */
console.log("\n=== 6. The dedup key: the same lead always gets the same key ===");
const t = new Date("2026-09-20T14:05:07.123Z");
check("message id wins", bpDedupKey({ gmailMessageId: "abc12345", email: "a@b.co", phone: null, receivedAt: t }) === "bp:gmail:abc12345", "bp:gmail:abc12345");
const fb1 = bpDedupKey({ gmailMessageId: null, email: "a@b.co", phone: "+13055550101", receivedAt: t });
const fb2 = bpDedupKey({ gmailMessageId: null, email: "a@b.co", phone: "+13055550101", receivedAt: new Date("2026-09-20T14:05:07.999Z") });
check("fallback key for a hand-entered row", fb1 === "bp:row:a@b.co:2026-09-20T14:05:07.000Z", fb1 ?? "null");
check("fallback ignores sub-second noise from the sheet", fb1 === fb2, "stable");
check("fallback uses phone when there is no email", bpDedupKey({ gmailMessageId: null, email: null, phone: "+13055550101", receivedAt: t })?.startsWith("bp:row:+13055550101:") === true, "phone");
check("no id, no email, no phone -> no key", bpDedupKey({ gmailMessageId: null, email: null, phone: null, receivedAt: t }) === null, "null");
check("the two key spaces cannot collide", !"bp:gmail:x".startsWith("bp:row:") && !"bp:row:x".startsWith("bp:gmail:"), "distinct prefixes");
check("never in the Gmail activity sync's space (gmail:<id>:<addr>)", !(fb1 ?? "").startsWith("gmail:") && !"bp:gmail:abc".startsWith("gmail:"), "distinct");
const again = validateBpItem({ ...KIMBERLY, gmailMessageId: "18f3a9c2d4e5b6a7", receivedAt: "2026-09-20T10:05:00-04:00" }, NOW);
check("the backfill (sheet Date) and the live post (ISO) give the SAME key", ok.ok && again.ok && ok.item.dedupKey === again.item.dedupKey, "same key");

/* ------------------------------------------------------------------------ */
console.log("\n=== 7. Repeat enquirer: one contact per email, a new application every time ===");
const EXISTING: ExistingContact = {
  id: "11111111-1111-4111-8111-111111111111", email: "kcollins.invest@gmail.com",
  phone: null, firstName: "Kimberly", lastName: null, creditBand: "700-719",
  targetMarket: null, state: null, leadSource: "unknown", externalIds: {},
};
const none: BpKnown = { dedupHit: null, emailContact: null, phoneContacts: [], migratedApps: [] };
const ki = item(KIMBERLY);

const fresh = planBpWrite(ki, k, none);
check("unknown person -> create a contact", fresh.action === "create" && fresh.contact.mode === "create", fresh.action);

const rep = planBpWrite(ki, k, { ...none, emailContact: EXISTING });
check("same email -> REUSE the contact, not a second one", rep.action === "create" && rep.contact.mode === "reuse" && rep.contact.id === EXISTING.id, rep.action === "create" ? rep.contact.mode : rep.action);
check("...matched on email", rep.action === "create" && rep.contact.mode === "reuse" && rep.contact.matchedOn === "email", "email");
const patch = contactGapFill(EXISTING, k);
check("gap fill: phone added because the contact had none", patch.phone === "+16145309478", String(patch.phone));
check("gap fill: last name added", patch.lastName === "Collins", String(patch.lastName));
check("gap fill: first name NOT overwritten", patch.firstName === undefined, "untouched");
check("gap fill: market + state added", patch.targetMarket === "Columbus" && patch.state === "OH", "added");
check("credit band takes the newest, exactly as record.ts does", patch.creditBand === "740-759", String(patch.creditBand));
check("unknown lead source becomes biggerpockets (the migration's rule)", patch.leadSource === "biggerpockets", String(patch.leadSource));
check("profile url joins external ids", patch.externalIds?.biggerpockets === "https://www.biggerpockets.com/users/kimberlyc88", "added");
const full = contactGapFill({ ...EXISTING, phone: "+13055550000", lastName: "C.", targetMarket: "Miami", state: "FL", leadSource: "website", externalIds: { biggerpockets: "https://www.biggerpockets.com/users/old", klaviyo: "k1" } }, k);
check("a filled phone is never overwritten", full.phone === undefined, "untouched");
check("a website contact stays a website contact", full.leadSource === undefined, "untouched");
check("an existing BP profile id is not replaced", full.externalIds === undefined, "untouched");
check("no consent field is ever in the patch", !Object.keys(full).some((x) => /consent|optOut|subscribed/i.test(x)) && !Object.keys(patch).some((x) => /consent|optOut|subscribed/i.test(x)), Object.keys(patch).join(","));

// Rows for the repeat path: the application is NEW, the contact is the old one.
if (rep.action === "create") {
  const rows = buildBpRows(ki, k, rep, { contactId: "22222222-2222-4222-8222-222222222222", applicationId: "33333333-3333-4333-8333-333333333333", propertyId: "44444444-4444-4444-8444-444444444444" }, "live");
  check("repeat: no new contact row", rows.newContact === null, "null");
  check("repeat: the patch is applied to the OLD contact", rows.contactId === EXISTING.id && rows.contactPatch !== null, rows.contactId);
  check("repeat: a NEW application all the same", rows.application.id === "33333333-3333-4333-8333-333333333333", "new application");
  check("repeat: participant links the old contact to the new deal", rows.participant.contactId === EXISTING.id && rows.participant.applicationId === rows.application.id, "linked");
  check("repeat: the activity says so", rows.activity.metadata.repeat === true && rows.activity.metadata.matchedOn === "email", "repeat=true");
}

/* ------------------------------------------------------------------------ */
console.log("\n=== 8. Phone: a fallback when there is no email, never a merge ===");
const noEmailRec = buildBpRecord(parsed({ name: "Sam Ortiz", firstName: "Sam", lastName: "Ortiz", email: "sam at gmail", phone: "(305) 513-1468", phoneE164: "+13055131468", messageId: "18f3a9c2d4e5b6b1" }));
const noEmailItem = item(parsed({ name: "Sam Ortiz", firstName: "Sam", lastName: "Ortiz", email: "sam at gmail", phone: "(305) 513-1468", phoneE164: "+13055131468", messageId: "18f3a9c2d4e5b6b1" }));
const PHONE_OWNER: ExistingContact = { ...EXISTING, id: "55555555-5555-4555-8555-555555555555", email: "sam@ortizrealty.com", phone: "+13055131468" };
const byPhone = planBpWrite(noEmailItem, noEmailRec, { ...none, phoneContacts: [PHONE_OWNER] });
check("no usable email + exactly one phone match -> reuse", byPhone.action === "create" && byPhone.contact.mode === "reuse" && byPhone.contact.matchedOn === "phone", byPhone.action === "create" ? byPhone.contact.mode : "");
const ambiguous = planBpWrite(noEmailItem, noEmailRec, { ...none, phoneContacts: [PHONE_OWNER, { ...PHONE_OWNER, id: "66666666-6666-4666-8666-666666666666" }] });
check("two contacts share the phone -> new contact, both flagged", ambiguous.action === "create" && ambiguous.contact.mode === "create" && ambiguous.phoneSharedWith.length === 2, ambiguous.action === "create" ? String(ambiguous.phoneSharedWith.length) : "");
const withEmail = planBpWrite(ki, k, { ...none, phoneContacts: [{ ...PHONE_OWNER, phone: "+16145309478" }] });
check("HAS an email, phone belongs to someone else -> new contact, not a merge", withEmail.action === "create" && withEmail.contact.mode === "create", "create");
check("...and the overlap is flagged for a human", withEmail.action === "create" && withEmail.phoneSharedWith[0] === PHONE_OWNER.id, "flagged");
if (withEmail.action === "create") {
  const rows = buildBpRows(ki, k, withEmail, { contactId: "c", applicationId: "a", propertyId: "p" }, "live");
  check("...in the application notes", /phone also on 1 other contact — check for a duplicate/.test(rows.application.notes ?? ""), "noted");
}
const emailAndPhoneSame = planBpWrite(ki, k, { ...none, emailContact: { ...EXISTING, phone: "+16145309478" }, phoneContacts: [{ ...EXISTING, phone: "+16145309478" }] });
check("the reused contact is not flagged as sharing its own phone", emailAndPhoneSame.action === "create" && emailAndPhoneSame.phoneSharedWith.length === 0, "0");

/* ------------------------------------------------------------------------ */
console.log("\n=== 9. Idempotency and the 14 Sep migration overlap ===");
const dup = planBpWrite(ki, k, { ...none, dedupHit: { applicationId: "77777777-7777-4777-8777-777777777777" }, emailContact: EXISTING });
check("dedup key already recorded -> duplicate, whatever else is true", dup.action === "duplicate" && dup.applicationId === "77777777-7777-4777-8777-777777777777", dup.action);
const migratedSameDay = [{ id: "88888888-8888-4888-8888-888888888888", submittedAt: new Date("2026-09-14T00:00:00Z") }];
const sep14 = item(KIMBERLY, { receivedAt: new Date("2026-09-14T13:30:00Z") });
const twin = planBpWrite(sep14, k, { ...none, emailContact: EXISTING, migratedApps: migratedSameDay });
check("a 14 Sep lead the migration already loaded -> duplicate of THAT application", twin.action === "duplicate" && twin.applicationId === migratedSameDay[0].id, twin.action);
check("...and it says why", twin.action === "duplicate" && /14 Sep 2026 migration/.test(twin.reason), twin.action === "duplicate" ? twin.reason : "");
check("late evening ET on the 14th still matches (UTC-midnight date)", migratedTwin(new Date("2026-09-15T03:30:00Z"), migratedSameDay) !== null, "27.5h");
check("the same person a week later is a NEW enquiry", planBpWrite(ki, k, { ...none, emailContact: EXISTING, migratedApps: migratedSameDay }).action === "create", "create");
check("a migrated app with no date never matches", migratedTwin(AT, [{ id: "x", submittedAt: null }]) === null, "null");
check("the twin check needs a contact match (no match, no twin)", planBpWrite(sep14, k, { ...none, migratedApps: migratedSameDay }).action === "create", "create");

/* ------------------------------------------------------------------------ */
console.log("\n=== 10. The rows a new lead writes ===");
if (fresh.action === "create") {
  const ids = { contactId: "c0c0c0c0-0000-4000-8000-000000000001", applicationId: "a0a0a0a0-0000-4000-8000-000000000002", propertyId: "b0b0b0b0-0000-4000-8000-000000000003" };
  const r = buildBpRows(ki, k, fresh, ids, "backfill");
  check("contact: lead source biggerpockets", r.newContact?.leadSource === "biggerpockets", String(r.newContact?.leadSource));
  check("contact: tagged biggerpockets", JSON.stringify(r.newContact?.tags) === '["biggerpockets"]', JSON.stringify(r.newContact?.tags));
  check("contact: NO sms consent written", r.newContact !== null && !Object.keys(r.newContact).some((x) => /consent/i.test(x)), "none");
  check("contact: created at the email's time, not now", r.newContact?.createdAt.getTime() === AT.getTime(), String(r.newContact?.createdAt.toISOString()));
  check("contact: profile in external ids", (r.newContact?.externalIds as Record<string, string>).biggerpockets === k.profileUrl, "set");
  check("property: address, city, state, zip, price", r.property?.addressLine1 === "5050 Open Meadows Dr, Columbus OH" && r.property?.city === "Columbus" && r.property?.state === "OH" && r.property?.postalCode === "43068" && r.property?.purchasePrice === "159000", "all five");
  check("application: stage lead, source biggerpockets, channel biggerpockets", r.application.stage === "lead" && r.application.leadSource === "biggerpockets" && r.application.channel === "biggerpockets", "lead / biggerpockets");
  check("application: points at the property", r.application.propertyId === ids.propertyId, "linked");
  check("application: requested + down payment as numeric strings", r.application.requestedAmount === "130500" && r.application.downPayment === "28500", "130500 / 28500");
  check("application: LTC measured as the migration did (needed / target)", r.application.ltc === (130500 / 159000).toFixed(4) && r.application.bindingRatio === "ltc", String(r.application.ltc));
  check("application: submitted + stage-entered at the email's time", r.application.submittedAt.getTime() === AT.getTime() && r.application.stageEnteredAt.getTime() === AT.getTime(), "receivedAt");
  check("application: legacy source separates it from the migrated 96", r.application.legacySource === "biggerpockets:intake", r.application.legacySource);
  check("application: a HOUSE lead — no broker firm, no submitter", !("brokerFirmId" in r.application) && !("submittedByUserId" in r.application), "absent (null)");
  check("stage transition: the first one, into lead", r.transition.fromStage === null && r.transition.toStage === "lead" && r.transition.applicationId === ids.applicationId, "null -> lead");
  check("participant: borrower role", r.participant.role === "borrower" && r.participant.contactId === ids.contactId, "borrower");
  check("activity: form_submission from biggerpockets", r.activity.kind === "form_submission" && r.activity.source === "biggerpockets", "form_submission");
  check("activity: carries the dedup key (the idempotency lock)", r.activity.dedupKey === "bp:gmail:18f3a9c2d4e5b6a7", r.activity.dedupKey);
  check("activity: records how it arrived", r.activity.metadata.via === "backfill" && r.activity.metadata.gmailMessageId === "18f3a9c2d4e5b6a7", "backfill");
  check("activity: every BP field kept verbatim, N/A dropped", r.activity.metadata.bp.goal === "Fix & flip" && !("minPrice" in r.activity.metadata.bp), "kept");
}
const bare = item(parsed({ email: "only@email.com", messageId: "18f3a9c2d4e5b6c9" }));
const bareRec = buildBpRecord(bare.lead);
const barePlan = planBpWrite(bare, bareRec, none);
if (barePlan.action === "create") {
  const r = buildBpRows(bare, bareRec, barePlan, { contactId: "c", applicationId: "a", propertyId: "p" }, "live");
  check("no market, address or price -> no property row", r.property === null && r.application.propertyId === null, "none");
  check("no amounts -> no leverage invented", r.application.ltc === null && r.application.bindingRatio === null, "null");
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
