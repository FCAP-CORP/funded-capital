/**
 * Regression suite for website lead field mapping.
 *
 * Covers the pure half of lib/leads/record.ts — the part that decides what a
 * submission MEANS.
 *
 * Field names AND every dropdown option below are copied verbatim from the live
 * forms (components/ApplyForm.tsx, components/ContactForm.tsx). That matters:
 * the first version of this suite invented plausible-looking values and passed,
 * while production quietly mapped every /contact lead to `product: unknown`.
 * /apply's `loanType` options are products; /contact's `subject` options are
 * TOPICS. If either form's options change, these tests must change with them.
 */

import { buildLeadRecord, type LeadInput } from "./record";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const AT = new Date("2026-09-14T12:00:00.000Z");
const base = (formType: string, payload: Record<string, string>, over: Partial<LeadInput> = {}): LeadInput => ({
  formType, payload, quarantined: false, smsConsent: false,
  consentVersion: "2026-07-27", consentAt: AT, ...over,
});

console.log("\n=== 1. /apply — the full field set ===");
const apply = buildLeadRecord(base("apply", {
  firstName: "Marcus", lastName: "Rivera", email: "Marcus@RiverviewHold.com",
  phone: "(305) 555-0101", borrowerType: "Investor", loanType: "Fix & Flip",
  propertyType: "Single Family", propertyAddress: "1329 Hamilton St, Allentown PA",
  purchasePrice: "$200,000", arv: "$370,000", loanAmount: "$234,000",
  creditScore: "740-759", experience: "3-5 deals", exitStrategy: "Sell",
  timeline: "1-3 months", additionalInfo: "Under contract, closing in 30 days",
}));
check("name split", apply.firstName === "Marcus" && apply.lastName === "Rivera", "Marcus / Rivera");
check("email lowercased", apply.email === "marcus@riverviewhold.com", apply.email ?? "null");
check("phone to E.164", apply.phone === "+13055550101", apply.phone ?? "null");
check("product from loanType", apply.product === "fix_and_flip", apply.product);
check("money parsed", apply.purchasePrice === 200000 && apply.arv === 370000 && apply.loanAmount === 234000, "200k / 370k / 234k");
check("credit band kept verbatim", apply.creditBand === "740-759", apply.creditBand ?? "null");
check("additionalInfo becomes the message", apply.message === "Under contract, closing in 30 days", "kept");
check("claimed experience goes to notes, not a verified field", (apply.notes ?? "").includes("claimed experience: 3-5 deals"), apply.notes ?? "null");

console.log("\n=== 2. /contact — different names for the same ideas ===");
const contact = buildLeadRecord(base("contact", {
  firstName: "Jared", lastName: "Shapiro", email: "jared@example.com",
  phone: "305-897-0483", subject: "Loan Inquiry", message: "Interested in a rental loan",
}));
check("subject is NOT read as a loan type", contact.product === "unknown", `product=${contact.product} — the contact form never asks`);
check("message is read as the message", contact.message === "Interested in a rental loan", "kept");
check("no property fields is fine", contact.propertyAddress === null && contact.arv === null, "null");
check("apply's field names are NOT read on a contact form", buildLeadRecord(base("contact", { loanType: "DSCR", additionalInfo: "x" })).product === "unknown", "unknown — correctly ignored");

console.log("\n=== 2b. EVERY real /contact subject VALUE (slugs, not labels) ===");
const CONTACT_SUBJECTS: [string, string][] = [
  ["loan-inquiry", "Loan Inquiry"],
  ["broker", "Broker Partnership"],
  ["existing-loan", "Existing Loan Question"],
  ["rates", "Rates & Programs"],
  ["other", "Other"],
];
for (const [value, label] of CONTACT_SUBJECTS) {
  const r = buildLeadRecord(base("contact", { email: "t@x.com", subject: value }));
  check(`value="${value}" is not mistaken for a product`, r.product === "unknown", `product=${r.product}`);
  check(`value="${value}" is stored as "${label}"`, r.inquiryTopic === label, r.inquiryTopic ?? "null");
}
check("subject=broker routes to the broker source",
  buildLeadRecord(base("contact", { email: "b@x.com", subject: "broker" })).leadSource === "broker", "broker");
check("subject=loan-inquiry stays a website lead",
  buildLeadRecord(base("contact", { email: "l@x.com", subject: "loan-inquiry" })).leadSource === "website", "website");

console.log("\n=== 2c. EVERY real /apply loanType VALUE ===");
const APPLY_LOAN_TYPES: [string, string][] = [
  ["fix-flip", "fix_and_flip"],
  ["dscr", "dscr"],
  ["construction", "ground_up"],
  ["multifamily", "multifamily"],
  ["unsure", "unknown"],
];
for (const [value, want] of APPLY_LOAN_TYPES) {
  const r = buildLeadRecord(base("apply", { email: "a@x.com", loanType: value }));
  check(`value="${value}" -> ${want}`, r.product === want, r.product);
}

console.log("\n=== 2d. EVERY real /apply borrowerType VALUE ===");
for (const [value, source] of [["investor","website"],["broker","broker"],["developer","website"],["other","website"]] as const) {
  const r = buildLeadRecord(base("apply", { email: "bt@x.com", borrowerType: value }));
  check(`borrowerType="${value}" -> ${source}`, r.leadSource === source, r.leadSource);
}
check("borrowerType is stored readably",
  buildLeadRecord(base("apply", { email: "bt@x.com", borrowerType: "broker" })).borrowerType
    === "Mortgage Broker (submitting on behalf of borrower)", "readable label");

console.log("\n=== 2e. EVERY real /apply propertyType VALUE ===");
for (const [value, label] of [["sfr","Single Family Residence"],["2-4","2–4 Units"],["multifamily","5+ Units (Multifamily)"],["condo","Condo / Townhome"],["commercial","Commercial"],["land","Land / Lot"]] as const) {
  const r = buildLeadRecord(base("apply", { email: "pt@x.com", propertyType: value }));
  check(`propertyType="${value}" reads as "${label}"`, (r.notes ?? "").includes(`property type: ${label}`), r.notes ?? "null");
}
const unsureMF = buildLeadRecord(base("apply", { email: "m@x.com", loanType: "unsure", propertyType: "multifamily" }));
check("'unsure' + a multifamily property infers multifamily", unsureMF.product === "multifamily", unsureMF.product);
check("...and is marked low confidence", unsureMF.productConfident === false, "confident=false");

console.log("\n=== 2f. The dedicated /broker-program/register form ===");
const reg = buildLeadRecord(base("broker", {
  firstName: "Dana", lastName: "Reyes", email: "dana@brokerage.com", phone: "305-555-0199",
}));
check("formType=broker routes to the broker source", reg.leadSource === "broker", reg.leadSource);
check("no product is invented for a partner", reg.product === "unknown", reg.product);

console.log("\n=== 3. Leverage from what the borrower typed ===");
check("all three ratios available to the caller", apply.loanAmount !== null && apply.purchasePrice !== null && apply.arv !== null, "loan/cost/ARV present");

console.log("\n=== 4. Quarantined leads are still built, and say so ===");
const held = buildLeadRecord(base("apply", { firstName: "Bot", email: "bot@x.com" }, {
  quarantined: true, quarantineReason: "BotID: not a verified browser",
}));
check("record is still produced", held.firstName === "Bot", "Bot — never dropped");
check("notes carry the hold reason", (held.notes ?? "").startsWith("HELD FOR REVIEW —"), held.notes ?? "null");
check("reason is preserved verbatim", (held.notes ?? "").includes("BotID: not a verified browser"), "included");

console.log("\n=== 5. Advisory flags ride along without deciding anything ===");
const flagged = buildLeadRecord(base("apply", { firstName: "Ann", email: "a@b.com" }, {
  advisoryFlags: ["fast submit", "disposable domain"],
}));
check("flags recorded in notes", (flagged.notes ?? "").includes("flags: fast submit, disposable domain"), flagged.notes ?? "null");
check("flags do NOT mark it held", !(flagged.notes ?? "").includes("HELD FOR REVIEW"), "not held — advisory only");

console.log("\n=== 6. Sparse and hostile input ===");
const sparse = buildLeadRecord(base("contact", { email: "only@email.com" }));
check("missing name is null, not empty string", sparse.firstName === null, "null");
check("missing phone is null", sparse.phone === null && sparse.phoneRaw === null, "null");
check("no product to infer -> unknown", sparse.product === "unknown", "unknown");
check("notes stay null when there is nothing to note", sparse.notes === null, "null");

const badPhone = buildLeadRecord(base("apply", { email: "x@y.com", phone: "000-000-0000" }));
check("unusable phone -> null, raw preserved", badPhone.phone === null && badPhone.phoneRaw === "000-000-0000", "raw kept for recovery");

console.log("\n=== 7. Products Funded Capital does not lend on ===");
check("a HELOC exit strategy on /apply is labelled, not silently accepted",
  buildLeadRecord(base("apply", { email: "h@x.com", loanType: "DSCR / Rental", exitStrategy: "HELOC" })).product === "not_our_product",
  "not_our_product");
check("New Construction -> ground_up",
  buildLeadRecord(base("apply", { email: "g@x.com", loanType: "New Construction" })).product === "ground_up", "ground_up");

console.log("\n=== 8. Ambiguity is flagged, never guessed silently ===");
const ambiguous = buildLeadRecord(base("apply", { email: "a@x.com", loanType: "Fix & flip or bridge loans" }));
check("low-confidence inference is marked", ambiguous.productConfident === false, `product=${ambiguous.product}, confident=false`);
check("a clear one is marked confident", apply.productConfident === true, "confident=true");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
