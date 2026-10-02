/**
 * Regression suite for the single definition of "has been contacted".
 *
 * WHY IT EXISTS. On 2026-09-23 four separate copies of this list were found in
 * lib/db/queries.ts, all saying email only. The visible consequence was the
 * dashboard reporting borrowers as never contacted after they had been phoned.
 * The tests below pin the list, prove the SQL renders as a literal rather than
 * a bound parameter, and — section 3 — fail if a second copy ever reappears.
 */

import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { CONTACT_KINDS, CONTACT_KIND_LIST, OUTREACH_WHERE, RESPONSE_WHERE, isOutreach, isResponse } from "./contactKinds";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const dialect = new PgDialect();
const rendered = dialect.sqlToQuery(sql`a.kind IN ${CONTACT_KINDS}`);

console.log("\n=== 1. The list itself ===");
check("email in counts", CONTACT_KIND_LIST.includes("email_in" as never), "yes");
check("email out counts", CONTACT_KIND_LIST.includes("email_out" as never), "yes");
check("a phone call counts", CONTACT_KIND_LIST.includes("call" as never), "yes");
check("an inbound text counts", CONTACT_KIND_LIST.includes("sms_in" as never), "yes");
check("an outbound text counts", CONTACT_KIND_LIST.includes("sms_out" as never), "yes");
check("a NOTE does not count as contact", !CONTACT_KIND_LIST.includes("note" as never), "excluded");
check("a stage change does not count", !CONTACT_KIND_LIST.includes("stage_change" as never), "excluded");
check("a field change does not count", !CONTACT_KIND_LIST.includes("field_change" as never), "excluded");
check("automation does not count", !CONTACT_KIND_LIST.includes("automation" as never), "excluded");
check("a form submission does not count", !CONTACT_KIND_LIST.includes("form_submission" as never), "excluded");
check("exactly five kinds", CONTACT_KIND_LIST.length === 5, String(CONTACT_KIND_LIST.length));

console.log("\n=== 2. It renders as literal SQL, not a bound parameter ===");
check("no parameters are produced", rendered.params.length === 0, `${rendered.params.length} params`);
check("the SQL has no placeholder", !rendered.sql.includes("$1"), rendered.sql);
check("every kind appears quoted in the SQL", CONTACT_KIND_LIST.every((k) => rendered.sql.includes(`'${k}'`)), rendered.sql);
check("it is a parenthesised list", /IN \('[a-z_]+'(, '[a-z_]+')*\)/.test(rendered.sql), rendered.sql);
check("note is nowhere in the rendered SQL", !rendered.sql.includes("'note'"), "absent");

console.log("\n=== 3. No second copy may reappear ===");
const queriesSrc = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
// Comments are stripped so that EXPLAINING the old list in prose is allowed
// while writing one in code is not.
const code = queriesSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const inlineLists = code.match(/kind\s+IN\s+\(/gi) ?? [];
check("queries.ts contains no inline kind list", inlineLists.length === 0, `${inlineLists.length} found`);
check("queries.ts imports the shared definition", /from\s+"\.\/contactKinds"/.test(code), "imported");
const uses = (code.match(/CONTACT_KINDS/g) ?? []).length;
check("and every contact lookup uses it", uses >= 6, `${uses} uses`);

console.log("\n=== their response vs our outreach (1 Oct 2026) ===");
{
  const cases: [string, { kind: string; metadata?: Record<string, unknown> | null }, boolean][] = [
    ["email from them", { kind: "email_in" }, true],
    ["text from them", { kind: "sms_in" }, true],
    ["call they placed (Quo)", { kind: "call", metadata: { direction: "incoming", answered: false } }, true],
    ["our call they answered (Quo)", { kind: "call", metadata: { direction: "outgoing", answered: true } }, true],
    ["call logged by hand: spoke with them", { kind: "call", metadata: { spoke: true } }, true],
    ["our unanswered call (Quo)", { kind: "call", metadata: { direction: "outgoing", answered: false } }, false],
    ["call logged by hand: no answer", { kind: "call", metadata: { spoke: false } }, false],
    ["call logged before the choice existed", { kind: "call", metadata: { by: "user_1" } }, false],
    ["call with no metadata at all", { kind: "call", metadata: null }, false],
    ["email we sent", { kind: "email_out" }, false],
    ["text we sent", { kind: "sms_out" }, false],
    ["a note", { kind: "note" }, false],
  ];
  for (const [name, a, resp] of cases) check(`${name}: ${resp ? "their response" : "not a response"}`, isResponse(a) === resp, "");
  check("outreach = our email/text/call that was not a conversation", isOutreach({ kind: "email_out" }) && isOutreach({ kind: "call", metadata: null }) && !isOutreach({ kind: "call", metadata: { answered: true } }) && !isOutreach({ kind: "note" }) && !isOutreach({ kind: "email_in" }), "");
  const r = (RESPONSE_WHERE as unknown as { queryChunks: { value: string[] }[] }).queryChunks.map((c) => c.value.join("")).join("");
  const o = (OUTREACH_WHERE as unknown as { queryChunks: { value: string[] }[] }).queryChunks.map((c) => c.value.join("")).join("");
  check("SQL: response reads direction, answered and spoke, null-safe", /COALESCE\(ac\.metadata->>'direction', ''\) = 'incoming'/.test(r) && /'answered'/.test(r) && /'spoke'/.test(r), r.slice(0, 80));
  check("SQL: outreach is our kinds AND NOT a response", o.includes("ac.kind IN ('email_out', 'sms_out', 'call') AND NOT ") && o.includes(r), "");
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
