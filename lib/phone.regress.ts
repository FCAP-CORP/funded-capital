/**
 * Regression suite for phone normalisation.
 *
 * Follows the house pattern from lib/pricing.regress.ts: plain script, PASS /
 * **FAIL** lines, exit code. Discovered and run automatically by fc-check.bat.
 */

import { normalisePhone, formatPhone } from "./phone";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};
const e164 = (s: string | null | undefined) => normalisePhone(s).e164;

console.log("\n=== 1. The shape every number in the legacy CRM is stored in ===");
check("dashed 10-digit normalises", e164("305-555-0101") === "+13055550101", `-> ${e164("305-555-0101")}`);
check("parenthesised normalises", e164("(808) 224-6692") === "+18082246692", `-> ${e164("(808) 224-6692")}`);
check("bare 10-digit normalises", e164("4049044439") === "+14049044439", `-> ${e164("4049044439")}`);
check("dotted normalises", e164("512.555.8080") === "+15125558080", `-> ${e164("512.555.8080")}`);
check("spaced normalises", e164(" 786 301 1794 ") === "+17863011794", `-> ${e164(" 786 301 1794 ")}`);

console.log("\n=== 2. Country code handling ===");
check("leading 1 is stripped", e164("1-702-752-0420") === "+17027520420", `-> ${e164("1-702-752-0420")}`);
check("already E.164 is unchanged", e164("+13055550101") === "+13055550101", `-> ${e164("+13055550101")}`);
check("non-NANP international is kept verbatim", e164("+442071838750") === "+442071838750", `-> ${e164("+442071838750")}`);

console.log("\n=== 3. Extensions must not inflate the digit count ===");
const ext = normalisePhone("305-555-0101 x12");
check("extension is stripped, not concatenated", ext.e164 === "+13055550101", `-> ${ext.e164}`);
check("'ext.' form also handled", e164("(305) 555-0101 ext. 4") === "+13055550101", `-> ${e164("(305) 555-0101 ext. 4")}`);

console.log("\n=== 4. Nothing is silently discarded — bad input is flagged, raw kept ===");
for (const [input, why] of [["", "empty"], ["N/A", "the sheet's own empty convention"], ["555-0101", "7 digits"], ["abc", "no digits"]] as const) {
  const r = normalisePhone(input);
  check(`rejects ${JSON.stringify(input)} (${why})`, r.ok === false && r.e164 === null && r.raw === input.trim(),
    `reason "${r.ok ? "-" : r.reason}", raw preserved`);
}

console.log("\n=== 5. Right length, still not dialable ===");
check("rejects 0 area code", normalisePhone("012-555-0101").ok === false, normalisePhone("012-555-0101").ok ? "accepted!" : "rejected");
check("rejects 1 exchange", normalisePhone("305-155-0101").ok === false, normalisePhone("305-155-0101").ok ? "accepted!" : "rejected");
check("rejects placeholder 1234567890", normalisePhone("1234567890").ok === false, "rejected");
check("accepts a real-looking number", normalisePhone("919-207-7040").ok === true, "+19192077040");

console.log("\n=== 6. Round trip to display and back ===");
const r = normalisePhone("9195155614");
check("formats for display", formatPhone(r.e164) === "(919) 515-5614", `-> ${formatPhone(r.e164)}`);
check("display form re-normalises to the same E.164", e164(formatPhone(r.e164)) === r.e164, `-> ${e164(formatPhone(r.e164))}`);
check("null formats to the fallback", formatPhone(null, "—") === "—", "—");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
