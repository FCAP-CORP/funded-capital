/**
 * Regression suite for the migration transforms.
 *
 * Every case below is drawn from the ACTUAL legacy data, not invented — the
 * "$25,252,525" target price, the "Fix & flip or bridge loans" ambiguity, the
 * "Qualified" / "Qualifying" drift, "N/A" as the empty convention. A migration
 * that mis-maps a product or swallows a stage is not visibly broken; it just
 * produces a CRM full of quietly wrong records.
 */

import {
  clean, parseMoney, parseDate, splitName, parseMarket, parseTags,
  mapLeadSource, mapProduct, mapStage, leverage, buildContact, type RowIssue,
} from "./transform";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. 'N/A' is the sheets' empty convention, not a value ===");
check("N/A becomes null", clean("N/A") === null, "null");
check("blank becomes null", clean("   ") === null, "null");
check("a real value survives", clean("  Marcus  ") === "Marcus", "Marcus");
check("N/A money is null, not 0", parseMoney("N/A") === null, "null");
check("absent money is null, not 0", parseMoney("") === null, "null — a real 0 must stay distinguishable");

console.log("\n=== 2. Money as BiggerPockets actually writes it ===");
check("$1,500,000", parseMoney("$1,500,000") === 1500000, "1500000");
check("$25,252,525 (the outsized one)", parseMoney("$25,252,525") === 25252525, "25252525");
check("$0 is zero, not null", parseMoney("$0") === 0, "0");
check("$15 (a suspicious real row)", parseMoney("$15") === 15, "15 — preserved, flagged elsewhere");
check("bare number", parseMoney("365000") === 365000, "365000");

console.log("\n=== 3. Dates from two different sources ===");
const d = parseDate("09/14/2026");
check("US slash format", d?.toISOString().slice(0, 10) === "2026-09-14", d?.toISOString().slice(0, 10) ?? "null");
const xl = parseDate(new Date(Date.UTC(2026, 7, 23)));
check("Excel Date object passes through", xl?.toISOString().slice(0, 10) === "2026-08-23", xl?.toISOString().slice(0, 10) ?? "null");
check("garbage is null, not Invalid Date", parseDate("not a date") === null, "null");

console.log("\n=== 4. Names and markets ===");
check("two-part name", JSON.stringify(splitName("Marcus Rivera")) === JSON.stringify({ firstName: "Marcus", lastName: "Rivera" }), "Marcus / Rivera");
check("multi-part surname stays whole", splitName("Barbara Hsusenfluck Gronbach").lastName === "Hsusenfluck Gronbach", "Hsusenfluck Gronbach");
check("single token is a FIRST name", splitName("Hunter").firstName === "Hunter" && splitName("Hunter").lastName === null, "Hunter / null");
const mk = parseMarket("Warrensville Heights, OH");
check("market splits from state", mk.market === "Warrensville Heights" && mk.state === "OH", `${mk.market} / ${mk.state}`);
check("no state suffix is tolerated", parseMarket("Florida").state === null, "null state, market kept");

console.log("\n=== 5. Tags — 139 distinct, comma-separated in one cell ===");
check("splits and lowercases", JSON.stringify(parseTags("fix-flip, Miami, active")) === JSON.stringify(["fix-flip", "miami", "active"]), "3 tags");
check("deduplicates", parseTags("investor, Investor, investor").length === 1, "1 tag");
check("empty becomes []", parseTags("N/A").length === 0, "[]");

console.log("\n=== 6. Lead source ===");
check("BiggerPockets", mapLeadSource("BiggerPockets") === "biggerpockets", "biggerpockets");
check("Cold Email", mapLeadSource("Cold Email") === "cold_email", "cold_email");
check("blank is unknown, not other", mapLeadSource("") === "unknown", "unknown — distinguishes 'never recorded' from 'recorded as Other'");
check("unrecognised falls back to other", mapLeadSource("Trade Show") === "other", "other");

console.log("\n=== 7. Product — where the legacy hints disagree ===");
const p = (o: Parameters<typeof mapProduct>[0]) => mapProduct(o).product;
check("HELOC is NOT our product", p({ goal: "HELOC", loanType: "N/A" }) === "not_our_product", "not_our_product");
check("HELOC beats a DSCR loan_type", p({ goal: "HELOC", loanType: "DSCR loans" }) === "not_our_product", "not_our_product — the goal wins");
check("conventional is not ours", p({ loanType: "Conventional loans" }) === "not_our_product", "not_our_product");
check("home equity strategy is not ours", p({ strategy: "Get a home equity loan (investment property)" }) === "not_our_product", "not_our_product");
check("DSCR loans", p({ loanType: "DSCR loans" }) === "dscr", "dscr");
check("F&F+bridge with a flip goal -> fix_and_flip", p({ loanType: "Fix & flip or bridge loans", goal: "Fix & flip" }) === "fix_and_flip", "fix_and_flip");
check("F&F+bridge with no goal -> bridge", p({ loanType: "Fix & flip or bridge loans" }) === "bridge", "bridge");
check("that ambiguous case is marked NOT confident", mapProduct({ loanType: "Fix & flip or bridge loans" }).confident === false, "confident=false");
check("strategy 'Finance a fix and flip'", p({ strategy: "Finance a fix and flip" }) === "fix_and_flip", "fix_and_flip");
check("strategy 'Finance a long-term rental'", p({ strategy: "Finance a long-term rental" }) === "dscr", "dscr");
check("New Construction -> ground_up", p({ loanType: "New Construction" }) === "ground_up", "ground_up");
check("'Multiple' is preserved, not guessed", p({ loanType: "Multiple" }) === "multiple", "multiple — 523 of 674 rows say this");
check("nothing at all -> unknown", p({}) === "unknown", "unknown");

console.log("\n=== 8. Stage — the drifted legacy vocabulary ===");
check("'New Lead' -> lead", mapStage("New Lead").stage === "lead", "lead");
check("'Qualified' -> qualified", mapStage("Qualified").stage === "qualified", "qualified");
check("'Qualifying' -> lead, NOT qualified", mapStage("Qualifying").stage === "lead", "lead — the drift is resolved deliberately");
check("'Term Sheet Issued'", mapStage("Term Sheet Issued").stage === "term_sheet_issued", "term_sheet_issued");
check("'Application Sent' -> application_in", mapStage("Application Sent").stage === "application_in", "application_in");
check("'Closed-Lost'", mapStage("Closed-Lost").stage === "closed_lost", "closed_lost");
check("original string is preserved", mapStage("Cold").original === "Cold", "Cold — kept on the transition row");
check("unknown string is flagged, not dropped", mapStage("Snoozed").mapped === false && mapStage("Snoozed").stage === "lead", "lead, mapped=false");

console.log("\n=== 9. Leverage — all three, and which one binds ===");
const lv = leverage({ loanAmount: 234000, purchasePrice: 200000, rehabBudget: 60000, arv: 370000 });
check("LTC computed on purchase+rehab", Math.abs((lv.ltc ?? 0) - 234000 / 260000) < 1e-9, `${((lv.ltc ?? 0) * 100).toFixed(1)}%`);
check("LTARV computed on ARV", Math.abs((lv.ltarv ?? 0) - 234000 / 370000) < 1e-9, `${((lv.ltarv ?? 0) * 100).toFixed(1)}%`);
check("the most conservative ratio binds", lv.binding === "ltc", `binding=${lv.binding} (90.0% LTC vs 63.2% LTARV)`);
const noLoan = leverage({ loanAmount: null, arv: 500000 });
check("no loan amount -> all null", noLoan.ltc === null && noLoan.binding === null, "null");
const arvOnly = leverage({ loanAmount: 100000, arv: 200000 });
check("ARV alone still yields LTARV", arvOnly.ltarv === 0.5 && arvOnly.binding === "ltarv", "50% ltarv");

console.log("\n=== 10. buildContact on real-shaped rows ===");
const issues: RowIssue[] = [];
const c = buildContact({
  "Contact ID": "FC-001", "First Name": "Marcus", "Last Name": "Rivera",
  "Email": "Marcus@RiverviewHold.com", "Phone": "305-555-0101",
  "Lead Source": "BiggerPockets", "Target State/Market": "Miami, FL",
  "Assigned To": "Luis Fajardo", "Tags": "fix-flip, miami",
  "Notes": "N/A", "Date Added": new Date(Date.UTC(2026, 3, 19)),
}, 2, issues);
check("email lowercased for matching", c.email === "marcus@riverviewhold.com", c.email ?? "null");
check("phone normalised to E.164", c.phone === "+13055550101", c.phone ?? "null");
check("phoneRaw empty when clean", c.phoneRaw === null, "null");
check("N/A note becomes null", c.notes === null, "null");
check("no issues raised on a good row", issues.length === 0, `${issues.length} issues`);

const bad: RowIssue[] = [];
const c2 = buildContact({ "Contact ID": "FC-999", "First Name": "Test", "Phone": "000-000-0000" }, 99, bad);
check("bad phone -> null, raw preserved", c2.phone === null && c2.phoneRaw === "000-000-0000", "raw kept");
check("missing email is flagged", bad.some((i) => i.field === "Email"), `${bad.length} issues raised`);
check("bad phone is flagged", bad.some((i) => i.field === "Phone"), "flagged with a reason");
check("contact is still built, not dropped", c2.legacyContactId === "FC-999", "FC-999 — never silently discarded");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
