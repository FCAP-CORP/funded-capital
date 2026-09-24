/**
 * Regression suite for the CRM grid's presentation logic.
 *
 * The cases here are the ones that go wrong silently in every hand-built table:
 * nulls floating to the top of a descending sort, "$0" rendering as "—",
 * day counts drifting across a month boundary, and a phone search that fails
 * because the searcher typed the number differently from how it is stored.
 */

import {
  money, percent, shortDate, daysSince, ageLabel, phoneDigits, displayPhone,
  fullName, matchesSearch, compareValues, sortRows, facetCounts,
  label, STAGE_LABEL, PRODUCT_LABEL, STAGE_ORDER, GATE_STAGES,
  STAGE_TONE, stageTone,
} from "./view";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. Money — absent and zero are different ===");
check("plain number", money(234000) === "$234,000", money(234000));
check("numeric string from the DB", money("234000.00") === "$234,000", money("234000.00"));
check("ZERO renders as $0, not a dash", money(0) === "$0", money(0));
check("null renders as a dash", money(null) === "—", money(null));
check("empty string renders as a dash", money("") === "—", money(""));
check("junk does not render NaN", money("abc") === "—", money("abc"));

console.log("\n=== 2. Ratios stored as decimals ===");
check("0.9 -> 90.0%", percent(0.9) === "90.0%", percent(0.9));
check('"0.6324" -> 63.2%', percent("0.6324") === "63.2%", percent("0.6324"));
check("null -> dash", percent(null) === "—", percent(null));

console.log("\n=== 3. Dates and ageing ===");
check("ISO string formats", shortDate("2026-09-14T20:03:00Z") === "Sep 14, 2026", shortDate("2026-09-14T20:03:00Z"));
check("null -> dash", shortDate(null) === "—", shortDate(null));
check("invalid -> dash, never 'Invalid Date'", shortDate("nope") === "—", shortDate("nope"));

const NOW = new Date("2026-09-14T12:00:00Z");
check("same day is 0", daysSince("2026-09-14T23:59:00Z", NOW) === 0, String(daysSince("2026-09-14T23:59:00Z", NOW)));
check("yesterday is 1", daysSince("2026-09-13T00:01:00Z", NOW) === 1, String(daysSince("2026-09-13T00:01:00Z", NOW)));
check("ACROSS a month boundary", daysSince("2026-08-31T00:00:00Z", NOW) === 14, String(daysSince("2026-08-31T00:00:00Z", NOW)));
check("the oldest missed BP lead, 1 Jul", daysSince("2026-07-01T00:00:00Z", NOW) === 75, String(daysSince("2026-07-01T00:00:00Z", NOW)));
check("null -> null", daysSince(null, NOW) === null, "null");
check("late-evening row does not age a day early", daysSince("2026-09-14T23:30:00Z", new Date("2026-09-14T00:30:00Z")) === 0, "0");
check("ageLabel singular", ageLabel(1) === "1 day", ageLabel(1));
check("ageLabel plural", ageLabel(75) === "75 days", ageLabel(75));
check("ageLabel today", ageLabel(0) === "today", ageLabel(0));

console.log("\n=== 4. Phones — stored one way, searched another ===");
check("E.164 displays readably", displayPhone("+13055550101") === "(305) 555-0101", displayPhone("+13055550101"));
check("null -> dash", displayPhone(null) === "—", displayPhone(null));
check("non-NANP passes through", displayPhone("+442071838750") === "+442071838750", displayPhone("+442071838750"));
check("digits extracted", phoneDigits("(305) 555-0101") === "3055550101", phoneDigits("(305) 555-0101"));

const row = { name: "Marcus Rivera", email: "marcus@riverviewhold.com", phone: "+13055550101" };
const F: (keyof typeof row)[] = ["name", "email", "phone"];
check("name search", matchesSearch(row, "marcus", F), "matched");
check("case-insensitive", matchesSearch(row, "RIVERA", F), "matched");
check("email fragment", matchesSearch(row, "riverview", F), "matched");
check("phone typed with formatting finds E.164", matchesSearch(row, "(305) 555-0101", F), "matched");
check("phone typed as digits", matchesSearch(row, "3055550101", F), "matched");
check("partial phone", matchesSearch(row, "5550101", F), "matched");
check("non-match returns false", !matchesSearch(row, "zzzz", F), "no match");
check("empty query matches everything", matchesSearch(row, "   ", F), "matched");
check("a 2-digit query does not phone-match everything", !matchesSearch({ name: "Ann", email: "a@b.com", phone: "+13055550101" }, "zz", F), "no match");

console.log("\n=== 5. Sorting — empties go LAST in BOTH directions ===");
check("numbers ascending", compareValues(100, 200, "asc") < 0, "100 before 200");
check("numbers descending", compareValues(100, 200, "desc") > 0, "200 before 100");
check("null is last ascending", compareValues(null, 5, "asc") > 0, "null after 5");
check("null is last DESCENDING too", compareValues(null, 5, "desc") > 0, "null still after 5 — the classic bug");
check("empty string is last descending", compareValues("", "abc", "desc") > 0, "'' after 'abc'");
check("two empties tie", compareValues(null, "", "asc") === 0, "0");
check("strings compare case-insensitively", compareValues("apple", "Banana", "asc") < 0, "apple before Banana");
check("numeric strings sort numerically, not lexically", compareValues("9", "10", "asc") < 0, "9 before 10 — not '10' < '9'");

const rows = [
  { name: "Bea", amount: 500 },
  { name: "Al", amount: null as number | null },
  { name: "Cy", amount: 1500 },
];
const desc = sortRows(rows, "amount", "desc");
check("biggest first", desc[0].name === "Cy", desc.map((r) => r.name).join(", "));
check("null last, not first", desc[2].name === "Al", desc.map((r) => r.name).join(", "));
check("the input array is not mutated", rows[0].name === "Bea", "unmutated — React would miss the change");
check("no sort key returns the rows unchanged", sortRows(rows, null, "asc")[0].name === "Bea", "unchanged");

console.log("\n=== 6. Facet counts for the filter chips ===");
const facets = facetCounts(
  [{ s: "website" }, { s: "website" }, { s: "biggerpockets" }, { s: null as string | null }],
  "s",
);
check("most common first", facets[0].value === "website" && facets[0].count === 2, `${facets[0].value}=${facets[0].count}`);
check("nulls become 'unknown', not dropped", facets.some((f) => f.value === "unknown" && f.count === 1), "counted");
check("every row is accounted for", facets.reduce((n, f) => n + f.count, 0) === 4, "4 of 4");

console.log("\n=== 7. Labels and pipeline order ===");
check("stage label", label(STAGE_LABEL, "term_sheet_issued") === "Term Sheet Issued", label(STAGE_LABEL, "term_sheet_issued"));
check("product label", label(PRODUCT_LABEL, "ground_up") === "Ground-Up", label(PRODUCT_LABEL, "ground_up"));
check("unknown product shows a dash", label(PRODUCT_LABEL, "unknown") === "—", label(PRODUCT_LABEL, "unknown"));
check("an unmapped key passes through rather than vanishing", label(STAGE_LABEL, "brand_new") === "brand_new", "brand_new");
check("null -> dash", label(STAGE_LABEL, null) === "—", "—");
check("every stage in STAGE_ORDER has a label", STAGE_ORDER.every((s) => s in STAGE_LABEL), `${STAGE_ORDER.length} stages`);
check("every label has a stage in STAGE_ORDER", Object.keys(STAGE_LABEL).every((s) => STAGE_ORDER.includes(s)), "no orphans");
check("pipeline order starts at lead", STAGE_ORDER[0] === "lead", STAGE_ORDER[0]);
check("term sheet signed follows issued", STAGE_ORDER.indexOf("term_sheet_signed") === STAGE_ORDER.indexOf("term_sheet_issued") + 1, "adjacent");
check("gates are all real stages", [...GATE_STAGES].every((s) => STAGE_ORDER.includes(s)), `${GATE_STAGES.size} gates`);

console.log("\n=== 8. Names ===");
check("both parts", fullName("Marcus", "Rivera") === "Marcus Rivera", fullName("Marcus", "Rivera"));
check("first only", fullName("Hunter", null) === "Hunter", fullName("Hunter", null));
check("neither is labelled, not blank", fullName(null, null) === "(no name)", fullName(null, null));

console.log("\n=== 9. Stage tones (the status pills) ===");
check("every stage in STAGE_ORDER has a tone", STAGE_ORDER.every((s) => s in STAGE_TONE), `${STAGE_ORDER.length} stages`);
check("every tone belongs to a real stage", Object.keys(STAGE_TONE).every((s) => STAGE_ORDER.includes(s)), "no orphans");
check("both term-sheet gates are gold, as on the dashboard chart", stageTone("term_sheet_issued") === "gold" && stageTone("term_sheet_signed") === "gold", "gold");
check("funded is success", stageTone("funded") === "success", stageTone("funded"));
check("closed-lost is danger", stageTone("closed_lost") === "danger", stageTone("closed_lost"));
check("an unknown stage is neutral, not hidden", stageTone("brand_new") === "neutral", stageTone("brand_new"));
check("null is neutral", stageTone(null) === "neutral", stageTone(null));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
