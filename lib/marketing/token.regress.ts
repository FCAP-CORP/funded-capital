/**
 * Regression suite for the marketing queue's bearer token.
 *
 * This guards a PUBLIC endpoint — `proxy.ts` does not put /api behind Clerk, so
 * this check is the only thing between the internet and the queue. Every test
 * below is about it failing in the safe direction.
 */

import { MIN_TOKEN_LENGTH, bearerFrom, checkToken, tokenOk } from "./token";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const GOOD = "k7Qw9ZrT2mNv8xLpJ4hB6cYd3sFgA1eU";          // exactly 32
const LONG = GOOD + "extra-characters-beyond-the-minimum";

check(`the fixture is exactly the minimum length`, GOOD.length === MIN_TOKEN_LENGTH, String(GOOD.length));

console.log("\n=== 1. It fails CLOSED when the server has no secret ===");
for (const [label, expected] of [["undefined", undefined], ["null", null], ["empty", ""], ["blank", "    "]] as const) {
  check(`  expected ${label} admits nobody`, !tokenOk(GOOD, expected), "refused");
}
// The one that matters most: a short token set during debugging is not a token.
check("a 4-character secret is refused outright", !tokenOk("test", "test"), "refused");
check(`...and so is one character short of ${MIN_TOKEN_LENGTH}`, !tokenOk(GOOD.slice(0, 31), GOOD.slice(0, 31)), "refused");
check("a correct secret at exactly the minimum works", tokenOk(GOOD, GOOD), "admitted");
check("...and a longer one works", tokenOk(LONG, LONG), "admitted");

console.log("\n=== 2. It refuses everything that is not the secret ===");
for (const [label, provided] of [
  ["undefined", undefined], ["null", null], ["empty", ""], ["blank", "   "],
  ["a wrong token of the same length", "WRONGw9ZrT2mNv8xLpJ4hB6cYd3sFgA1"],
  ["the secret with a trailing character", GOOD + "x"],
  ["the secret missing its last character", GOOD.slice(0, -1)],
  ["the secret in a different case", GOOD.toUpperCase()],
] as const) {
  check(`  ${label}`, !tokenOk(provided, GOOD), "refused");
}
check("surrounding whitespace is tolerated on a correct token", tokenOk(`  ${GOOD}  `, GOOD), "admitted");

console.log("\n=== 3. The Authorization header is parsed both ways ===");
check('"Bearer <token>"', bearerFrom(`Bearer ${GOOD}`) === GOOD, String(bearerFrom(`Bearer ${GOOD}`)));
check('"bearer <token>" lower case', bearerFrom(`bearer ${GOOD}`) === GOOD, String(bearerFrom(`bearer ${GOOD}`)));
check("a bare token, for curl at 2am", bearerFrom(GOOD) === GOOD, String(bearerFrom(GOOD)));
check("extra spaces after Bearer", bearerFrom(`Bearer    ${GOOD}`) === GOOD, String(bearerFrom(`Bearer    ${GOOD}`)));
for (const [label, header] of [["missing", null], ["empty", ""], ["whitespace", "   "], ["bare Bearer", "Bearer "]] as const) {
  check(`  ${label} header is null`, bearerFrom(header) === null, String(bearerFrom(header)));
}

console.log("\n=== 4. 503 means fix the server, 401 means fix the caller ===");
const noSecret = checkToken(GOOD, "");
check("unconfigured server is 503", !noSecret.ok && noSecret.status === 503, noSecret.ok ? "ok" : String(noSecret.status));
check("...and says so plainly, so Luis looks in Vercel", !noSecret.ok && /not configured/i.test(noSecret.reason), noSecret.ok ? "-" : noSecret.reason);
const wrong = checkToken("nope", GOOD);
check("wrong token is 401", !wrong.ok && wrong.status === 401, wrong.ok ? "ok" : String(wrong.status));
check("...and the refusal says nothing useful to a stranger", !wrong.ok && wrong.reason === "Not authorised.", wrong.ok ? "-" : wrong.reason);
check("a correct token passes", checkToken(GOOD, GOOD).ok, "ok");
// A short secret must read as unconfigured, not as a wrong password.
check("a too-short secret reports 503, not 401", (() => { const v = checkToken("test", "test"); return !v.ok && v.status === 503; })(), "503");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
