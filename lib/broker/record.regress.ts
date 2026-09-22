/**
 * Regression suite for broker portal submissions.
 *
 * The failure this suite exists to prevent has already happened on this project
 * in another costume: a form posting one spelling of a value while the code that
 * reads it expects another. Every New Construction lead landed as `unknown` for
 * weeks because /apply sent a slug and the matcher wanted a label. The broker
 * form does the mirror image — it sends the LABEL — so the same bug is one
 * careless line away.
 *
 * Section 1 is therefore not a normal unit test. It reads the live RATE_CONFIG
 * and the live database enum and asserts that the mapping between them is total
 * in both directions. Rename a product in pricing.ts and this suite fails
 * rather than production quietly mis-filing deals.
 */

import {
  buildBrokerRecord,
  buildPortfolioProperties,
  portfolioTotals,
  brokerConsentPatch,
  PROGRAM_LABEL_TO_PRODUCT,
} from "./record";
import { CONSENT_VERSION, BROKER_SMS_CONSENT_TEXT, SMS_CONSENT_TEXT } from "../consent";
import { RATE_CONFIG, LOAN_PURPOSE_OPTIONS, MAX_PORTFOLIO_PROPERTIES } from "../pricing";
import { productEnum } from "../db/schema";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. The mapping matches the REAL form and the REAL database ===");

const liveLabels = Object.values(RATE_CONFIG.products).map((p) => p.label);
const mappedLabels = Object.keys(PROGRAM_LABEL_TO_PRODUCT);

const unmapped = liveLabels.filter((l) => !mappedLabels.includes(l));
check(
  "every product the broker form can post is mapped",
  unmapped.length === 0,
  unmapped.length ? `UNMAPPED: ${unmapped.join(", ")}` : `${liveLabels.length} labels`,
);

const stale = mappedLabels.filter((l) => !liveLabels.includes(l));
check(
  "the mapping invents no label the form cannot post",
  stale.length === 0,
  stale.length ? `NOT IN RATE_CONFIG: ${stale.join(", ")}` : "none",
);

const dbProducts: readonly string[] = productEnum.enumValues;
const bogus = Object.values(PROGRAM_LABEL_TO_PRODUCT).filter((v) => !dbProducts.includes(v));
check(
  "every mapped product is a value the database accepts",
  bogus.length === 0,
  bogus.length ? `REJECTED BY DB: ${bogus.join(", ")}` : "all valid",
);

console.log("\n=== 2. A real submission, mapped ===");
// Field names and shapes copied from what ApplyClient.tsx actually posts.
const real = buildBrokerRecord({
  program: "Fix & Flip",
  borrower: "Marcus Rivera",
  entity: "Riverview Holdings LLC",
  email: "Marcus@RiverviewHold.com",
  phone: "(305) 555-0101",
  fico: "742",
  propertyAddress: "4900 W Harrison St, Chicago IL 60644",
  loanAmount: "$234,000",
  purpose: "purchase",
  propertyValue: "320000",
  notes: "Under contract, closing in 30 days",
});

check("program label maps to the product slug", real.product === "fix_and_flip", real.product);
check("product is marked confident", real.productConfident, "confident");
check("name split", real.borrowerFirstName === "Marcus" && real.borrowerLastName === "Rivera", "Marcus / Rivera");
check("email lowercased", real.email === "marcus@riverviewhold.com", real.email ?? "null");
check("phone to E.164", real.phone === "+13055550101", real.phone ?? "null");
check("money parsed", real.loanAmount === 234000, "234k requested");
check("FICO kept verbatim, not banded", real.creditBand === "742", real.creditBand ?? "null");
check("entity captured", real.entityName === "Riverview Holdings LLC", real.entityName ?? "null");
check("broker notes preserved", (real.notes ?? "").includes("Under contract"), "kept");
check("entity also noted on the application", (real.notes ?? "").includes("Riverview Holdings LLC"), "noted");

console.log("\n=== 3. Each live program label, end to end ===");
for (const label of liveLabels) {
  const r = buildBrokerRecord({ program: label, borrower: "A B", email: "a@b.com" });
  check(
    `"${label}"`,
    r.productConfident && dbProducts.includes(r.product),
    `-> ${r.product}`,
  );
}
// A stabilized bridge priced off DSCR is still a bridge loan. Filing it as
// `dscr` would make the bridge book under-report.
check(
  "stabilized bridge files as bridge, not dscr",
  buildBrokerRecord({ program: "DSCR / Stabilized Bridge" }).product === "bridge",
  "bridge",
);

console.log("\n=== 4. An unknown program is never guessed ===");
const weird = buildBrokerRecord({ program: "Something We Do Not Offer", borrower: "X Y" });
check("falls back to unknown", weird.product === "unknown", weird.product);
check("and is NOT marked confident", !weird.productConfident, "not confident");
check(
  "the broker's actual choice is preserved in the notes",
  (weird.notes ?? "").includes("Something We Do Not Offer"),
  weird.notes ?? "null",
);

console.log("\n=== 5. Missing and messy input never throws ===");
const empty = buildBrokerRecord({});
check("empty object", empty.product === "unknown" && empty.email === null, "unknown / null");
check("empty is not confident", !empty.productConfident, "not confident");
const blank = buildBrokerRecord({ program: "", borrower: "   ", email: "  ", loanAmount: "" });
check("whitespace-only fields become null", blank.borrowerFirstName === null && blank.email === null, "null");
check("unparseable money is null, not 0", blank.loanAmount === null, String(blank.loanAmount));
check(
  "a single-word borrower name keeps a null surname",
  buildBrokerRecord({ borrower: "Cher" }).borrowerLastName === null,
  "null surname",
);
check(
  "a multi-part surname stays whole",
  buildBrokerRecord({ borrower: "Maria De La Cruz" }).borrowerLastName === "De La Cruz",
  "De La Cruz",
);

console.log("\n=== 6. A phone that will not normalise is kept raw, not dropped ===");
// Same rule as the rest of the CRM: a number that cannot be texted must still
// be visible, or it never gets fixed.
const badPhone = buildBrokerRecord({ phone: "call the office" });
check("phone null when not E.164", badPhone.phone === null, "null");
check("raw kept for a human to fix", badPhone.phoneRaw === "call the office", badPhone.phoneRaw ?? "null");
const goodPhone = buildBrokerRecord({ phone: "305-555-0101" });
check("good phone sets phone and clears raw", goodPhone.phone === "+13055550101" && goodPhone.phoneRaw === null, "clean");

console.log("\n=== 6b. Purchase vs refinance decides WHICH figure was asked for ===");
// The same box on the form means two different things. Filing a purchase price
// as an as-is value measures the deal against the wrong denominator — and on a
// Fix & Flip, LTC against price is the ratio that binds.
const purchase = buildBrokerRecord({ purpose: "purchase", propertyValue: "400000", loanAmount: "300000" });
check("purchase fills purchasePrice", purchase.purchasePrice === 400000, String(purchase.purchasePrice));
check("purchase leaves asIsValue null", purchase.asIsValue === null, "null");

for (const refi of ["rate_term_refi", "cash_out_refi"]) {
  const r = buildBrokerRecord({ purpose: refi, propertyValue: "400000", loanAmount: "300000" });
  check(`${refi} fills asIsValue`, r.asIsValue === 400000, String(r.asIsValue));
  check(`${refi} leaves purchasePrice null`, r.purchasePrice === null, "null");
}

check(
  "every purpose the pricing engine offers is accepted",
  LOAN_PURPOSE_OPTIONS.every((o) => buildBrokerRecord({ purpose: o.key }).loanPurpose === o.key),
  `${LOAN_PURPOSE_OPTIONS.length} purposes`,
);

const noPurpose = buildBrokerRecord({ propertyValue: "400000", loanAmount: "300000" });
check("a missing purpose files NEITHER figure", noPurpose.purchasePrice === null && noPurpose.asIsValue === null, "both null");
check("and the purpose is null, not guessed", noPurpose.loanPurpose === null, "null");
check(
  "but the number the broker typed is still visible in the notes",
  (noPurpose.notes ?? "").includes("400000"),
  noPurpose.notes ?? "null",
);

const badPurpose = buildBrokerRecord({ purpose: "refi", propertyValue: "400000" });
check("an unrecognised purpose is not coerced", badPurpose.loanPurpose === null, "null");
check(
  "and is recorded verbatim for a human",
  (badPurpose.notes ?? "").includes("unrecognised loan purpose: refi"),
  "noted",
);

console.log("\n=== 6c. Portfolio schedules ===");
const row = (address: string, value: string) => ({ address, value });

const three = buildPortfolioProperties(
  [row("1 A St", "100000"), row("2 B St", "200000"), row("3 C St", "300000")],
  "purchase",
);
check("three rows kept", three.properties.length === 3, String(three.properties.length));
check("nothing dropped", three.dropped === 0, "0");
check(
  "leverage sums the WHOLE schedule",
  portfolioTotals(three.properties).purchasePrice === 600000,
  String(portfolioTotals(three.properties).purchasePrice),
);
check("and files nothing as as-is on a purchase", portfolioTotals(three.properties).asIsValue === null, "null");

// A broker who fills three lines of a ten-line form has a three-property deal.
// Writing seven empty properties would make propertyCount a lie.
const withBlanks = buildPortfolioProperties(
  [row("1 A St", "100000"), {}, { address: "  " }, row("2 B St", "200000"), {}],
  "purchase",
);
check("blank rows are dropped, not written", withBlanks.properties.length === 2, String(withBlanks.properties.length));
check("count reflects what was actually entered", portfolioTotals(withBlanks.properties).purchasePrice === 300000, "300000");

const tooMany = buildPortfolioProperties(
  Array.from({ length: MAX_PORTFOLIO_PROPERTIES + 3 }, (_, i) => row(`${i} St`, "100000")),
  "cash_out_refi",
);
check(`capped at ${MAX_PORTFOLIO_PROPERTIES}`, tooMany.properties.length === MAX_PORTFOLIO_PROPERTIES, String(tooMany.properties.length));
check("the overflow is REPORTED, not silently swallowed", tooMany.dropped === 3, String(tooMany.dropped));
check("refi schedule files as as-is value", portfolioTotals(tooMany.properties).asIsValue === MAX_PORTFOLIO_PROPERTIES * 100000, "summed");
check("and nothing as purchase price", portfolioTotals(tooMany.properties).purchasePrice === null, "null");

const full = buildPortfolioProperties([{
  address: "9 Rent Rd", value: "250000", rehabBudget: "20000", sunkCosts: "5000",
  estimatedPayoff: "120000", arv: "310000", monthlyRent: "2400",
  annualTaxes: "4200", annualInsurance: "1800", annualHoa: "600",
}], "rate_term_refi");
const f = full.properties[0];
check("every per-property field is parsed", f.rehabBudget === 20000 && f.sunkCosts === 5000 && f.estimatedPayoff === 120000, "budget/sunk/payoff");
check("DSCR carrying costs parsed", f.annualTaxes === 4200 && f.annualInsurance === 1800 && f.annualHoa === 600, "taxes/ins/hoa");
check("ARV and rent parsed", f.arv === 310000 && f.monthlyRent === 2400, "arv/rent");

check("no schedule is an empty schedule, not an error", buildPortfolioProperties(undefined, "purchase").properties.length === 0, "0");
check("an all-blank schedule writes nothing", buildPortfolioProperties([{}, {}], "purchase").properties.length === 0, "0");
check("totals of nothing are null, not zero", portfolioTotals([]).purchasePrice === null, "null");

console.log("\n=== 7. Broker SMS consent — inbound only, never cleared ===");
const AT = new Date("2026-09-22T16:00:00.000Z");

const granted = brokerConsentPatch(true, CONSENT_VERSION, AT);
check("ticking the box stamps a timestamp", "smsConsentAt" in granted, "stamped");
check(
  "and records WHICH wording they saw",
  (granted as { smsConsentVersion?: string }).smsConsentVersion === CONSENT_VERSION,
  CONSENT_VERSION,
);

// The critical one. An unticked box is the absence of a new grant, NOT a
// revocation. Returning a patch here would clear consent given earlier — and
// would silently overwrite a STOP recorded by Quo.
const notTicked = brokerConsentPatch(false, CONSENT_VERSION, AT);
check("an unticked box writes NOTHING", Object.keys(notTicked).length === 0, "{}");
check(
  "an unticked box cannot clear a timestamp",
  !("smsConsentAt" in notTicked),
  "no smsConsentAt key",
);
check(
  "an unticked box cannot clear a version",
  !("smsConsentVersion" in notTicked),
  "no smsConsentVersion key",
);

console.log("\n=== 8. The consent wording is real and broker-specific ===");
check("broker wording is non-empty", BROKER_SMS_CONSENT_TEXT.length > 80, `${BROKER_SMS_CONSENT_TEXT.length} chars`);
check(
  "broker wording is NOT the borrower wording",
  BROKER_SMS_CONSENT_TEXT !== SMS_CONSENT_TEXT,
  "distinct",
);
check(
  "it describes what a broker actually receives",
  BROKER_SMS_CONSENT_TEXT.includes("applications I submit"),
  "mentions their submissions",
);
// A2P 10DLC requires all four of these in the opt-in language.
for (const required of ["Consent is not a condition", "STOP", "HELP", "Message and data rates"]) {
  check(`required phrase present: "${required}"`, BROKER_SMS_CONSENT_TEXT.includes(required), "present");
}
check("a version is set", CONSENT_VERSION.length > 0, CONSENT_VERSION);

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
