/**
 * Regression suite for CRM access control.
 *
 * The cases that matter here are the ones where a mistake reads as "it works":
 * an unset allowlist quietly admitting everyone, a trailing space or a capital
 * letter in an address turning a real staff member away, and a substring match
 * letting someone in because their address contains a permitted one.
 *
 * This suite covers the pure matcher only. It cannot prove the gate is CALLED —
 * that is what the reviewer checks: every /crm page and every server action.
 */

import { emailAllowed } from "./access";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const LIST = "luis@fundedcapital.com, ops@fundedcapital.com";

console.log("\n=== 1. It FAILS CLOSED — this is the whole point ===");
check("undefined list admits nobody", !emailAllowed("luis@fundedcapital.com", undefined), "denied");
check("empty list admits nobody", !emailAllowed("luis@fundedcapital.com", ""), "denied");
check("whitespace-only list admits nobody", !emailAllowed("luis@fundedcapital.com", "  ,  , "), "denied");
check("a list of commas admits nobody", !emailAllowed("luis@fundedcapital.com", ",,,"), "denied");

console.log("\n=== 2. No email means no access ===");
check("null email", !emailAllowed(null, LIST), "denied");
check("undefined email", !emailAllowed(undefined, LIST), "denied");
check("empty email", !emailAllowed("", LIST), "denied");
check("whitespace email", !emailAllowed("   ", LIST), "denied");

console.log("\n=== 3. Staff get in ===");
check("exact match", emailAllowed("luis@fundedcapital.com", LIST), "allowed");
check("second entry", emailAllowed("ops@fundedcapital.com", LIST), "allowed");
check("uppercase in", emailAllowed("Luis@FundedCapital.com", LIST), "allowed");
check("padded with spaces", emailAllowed("  luis@fundedcapital.com  ", LIST), "allowed");
check("uppercase in the LIST", emailAllowed("luis@fundedcapital.com", "LUIS@FUNDEDCAPITAL.COM"), "allowed");
check("single entry, no commas", emailAllowed("luis@fundedcapital.com", "luis@fundedcapital.com"), "allowed");

console.log("\n=== 4. Everyone else stays out ===");
check("a broker with an account", !emailAllowed("broker@somebrokerage.com", LIST), "denied");
check("similar domain", !emailAllowed("luis@fundedcapital.co", LIST), "denied");
check("lookalike domain", !emailAllowed("luis@funded-capital.com", LIST), "denied");

// A `includes()` on the joined string rather than on the parsed array would
// admit all three of these. That is the classic allowlist bug.
check("SUBSTRING of a permitted address", !emailAllowed("uis@fundedcapital.com", LIST), "denied");
check("permitted address as a PREFIX", !emailAllowed("luis@fundedcapital.com.evil.net", LIST), "denied");
check("permitted address as a SUFFIX", !emailAllowed("notluis@fundedcapital.com", LIST), "denied");
check("empty-ish email against a list", !emailAllowed(" ", "luis@fundedcapital.com"), "denied");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
