/**
 * Regression suite for the ⌘K search's pure logic (lib/crm/search.ts) and the
 * shape of the SQL it sends (lib/crm/searchSql.ts, rendered — never run — here).
 *
 * The SQL itself was run against a real Postgres 16 built from drizzle/*.sql
 * when this shipped; see the hand-off notes. This suite pins what can be
 * pinned without a database: what a query means, what is escaped, that every
 * value is a bound parameter, and that no list is ever longer than 20.
 *
 * Run: npx tsx lib/crm/search.regress.ts
 */

import { PgDialect } from "drizzle-orm/pg-core";
import {
  CONTACT_SLOTS, SEARCH_LIMIT, SEARCH_MAX_LENGTH, escapeLike, mergeResults, parseSearchQuery,
  toContactResult, toDealResult,
} from "./search";
import { contactSearchSql, dealSearchSql } from "./searchSql";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. What counts as a search ===");
check("one character is not a search", !parseSearchQuery("m").ok, "ok:false");
check("two characters is", parseSearchQuery("ma").ok, "ok:true");
check("whitespace does not count toward the minimum", !parseSearchQuery("  m  ").ok, "ok:false");
check("null / number / array are refused", !parseSearchQuery(null).ok && !parseSearchQuery(12).ok && !parseSearchQuery(["ab"]).ok, "ok:false");
check(`over ${SEARCH_MAX_LENGTH} characters is refused`, !parseSearchQuery("x".repeat(SEARCH_MAX_LENGTH + 1)).ok, "ok:false");
const ws = parseSearchQuery("  Marcus \n  Rivera ");
check("inner whitespace collapses", ws.ok && ws.text === "Marcus Rivera", ws.ok ? ws.text : "-");
const nul = parseSearchQuery("ab\u0000cd");
check("a NUL byte is removed (Postgres would reject the parameter)", nul.ok && !nul.text.includes("\u0000"), nul.ok ? JSON.stringify(nul.text) : "-");

console.log("\n=== 2. LIKE wildcards are the person's characters, not ours ===");
check("% is escaped", escapeLike("100%") === "100\\%", escapeLike("100%"));
check("_ is escaped", escapeLike("a_b") === "a\\_b", escapeLike("a_b"));
check("\\ is escaped first", escapeLike("a\\b") === "a\\\\b", escapeLike("a\\b"));
const pct = parseSearchQuery("%%");
check("a query of only wildcards matches literally, not everything", pct.ok && pct.pattern === "%\\%\\%%", pct.ok ? pct.pattern : "-");
const riv = parseSearchQuery("Rivera");
check("the pattern wraps the text", riv.ok && riv.pattern === "%Rivera%", riv.ok ? riv.pattern : "-");

console.log("\n=== 3. Phone searches ===");
const ph = parseSearchQuery("(305) 555-0101");
check("a formatted number searches its digits", ph.ok && ph.digits === "3055550101" && ph.digitsPattern === "%3055550101%", ph.ok ? ph.digitsPattern : "-");
const tail = parseSearchQuery("0101");
check("four digits is a phone search", tail.ok && tail.digitsPattern === "%0101%", tail.ok ? tail.digitsPattern : "-");
const addr = parseSearchQuery("123 Main St");
check("an address with a number is NOT a phone search", addr.ok && addr.digitsPattern === "", addr.ok ? JSON.stringify(addr.digitsPattern) : "-");
const two = parseSearchQuery("12");
check("two digits is too few for a phone search", two.ok && two.digitsPattern === "", two.ok ? JSON.stringify(two.digitsPattern) : "-");

console.log("\n=== 4. The SQL: bound parameters, four tables, capped ===");
const dialect = new PgDialect();
const inj = parseSearchQuery("'; DROP TABLE contacts; --");
if (!inj.ok) throw new Error("setup");
const deals = dialect.sqlToQuery(dealSearchSql(inj));
const people = dialect.sqlToQuery(contactSearchSql(inj));
check("the typed text never appears in the deal statement", !deals.sql.includes("DROP TABLE"), "parameterised");
check("the typed text never appears in the contact statement", !people.sql.includes("DROP TABLE"), "parameterised");
check("...it travels as a parameter instead", deals.params.includes("%'; DROP TABLE contacts; --%"), `${deals.params.length} params`);
check("the deal statement uses numbered placeholders", /\$1\b/.test(deals.sql) && /\$\d+::text/.test(deals.sql), "$n::text");
// "JOIN LATERAL (" is a subquery, not a table — skip the keyword.
const words = (s: string) =>
  [...s.matchAll(/\b(?:FROM|JOIN)\s+(?!LATERAL\b)([a-z_]+)/gi)].map((m) => m[1].toLowerCase());
const tables = new Set([...words(deals.sql), ...words(people.sql)]);
check("only applications, participants, contacts and properties are read",
  [...tables].every((t) => ["applications", "participants", "contacts", "properties"].includes(t)) && tables.size === 4,
  [...tables].sort().join(", "));
check("the deal statement picks ONE contact per application (LATERAL … LIMIT 1)",
  /LEFT JOIN LATERAL[\s\S]*?LIMIT 1\s*\)\s*c ON true/.test(deals.sql), "lateral");
check("...borrower first, then oldest attachment, as getPipeline does",
  deals.sql.includes("ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, ct.id ASC"), "same order");
check(`both statements end LIMIT ${SEARCH_LIMIT}`,
  new RegExp(`LIMIT ${SEARCH_LIMIT}\\s*$`).test(deals.sql.trim()) && new RegExp(`LIMIT ${SEARCH_LIMIT}\\s*$`).test(people.sql.trim()),
  `LIMIT ${SEARCH_LIMIT}`);
check("the limit is a constant, not a parameter someone could raise", !deals.params.includes(SEARCH_LIMIT), "constant");
check("nothing in either statement writes", !/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i.test(deals.sql + people.sql), "read-only");

console.log("\n=== 5. Results: shaped, de-duplicated, never more than 20 ===");
const deal = (i: number, contactId: string | null = `c${i}`) => ({
  application_id: `a${i}`, contact_id: contactId, first_name: "Deal", last_name: String(i),
  email: `d${i}@x.com`, phone: null, stage: "lead", requested_amount: "250000.00",
  address_line1: "12 Palm Ave", city: "Miami", state: "FL",
});
const person = (i: number, deals = 0) => ({
  contact_id: `c${i}`, first_name: "Person", last_name: String(i), email: i % 2 ? `p${i}@x.com` : null,
  phone: i % 2 ? null : "+13055550101", phone_raw: null, deals,
});
const d0 = toDealResult(deal(1));
check("a deal result carries its application id and address", d0.applicationId === "a1" && d0.address === "12 Palm Ave, Miami, FL", JSON.stringify(d0));
check("an unlinked deal is named (unlinked)", toDealResult({ ...deal(2, null), first_name: null, last_name: null }).name === "(unlinked)", "(unlinked)");
const p1 = toContactResult(person(1));
check("a contact is looked up by email when it has one", p1.lookup === "p1@x.com", p1.lookup);
check("...by phone when it does not", toContactResult(person(2)).lookup === "+13055550101", toContactResult(person(2)).lookup);
check("...and by name when it has neither", toContactResult({ ...person(2), phone: null }).lookup === "Person 2", "Person 2");

const lots = mergeResults(Array.from({ length: 20 }, (_, i) => deal(i + 100)), Array.from({ length: 20 }, (_, i) => person(i)));
check(`never more than ${SEARCH_LIMIT}`, lots.length === SEARCH_LIMIT, String(lots.length));
check(`${CONTACT_SLOTS} places kept for people when deals would fill the list`,
  lots.filter((r) => r.kind === "contact").length === CONTACT_SLOTS, String(lots.filter((r) => r.kind === "contact").length));
check("deals come first", lots[0].kind === "deal" && lots[lots.length - 1].kind === "contact", "deal…contact");
const fewPeople = mergeResults(Array.from({ length: 20 }, (_, i) => deal(i + 100)), [person(1)]);
check("when few people match, deals take the room", fewPeople.length === 20 && fewPeople.filter((r) => r.kind === "deal").length === 19, "19 + 1");
const dup = mergeResults([deal(1)], [person(1, 1), person(2)]);
check("the borrower already shown on a deal is not listed again as a contact", dup.length === 2 && dup.every((r) => r.kind === "deal" || r.contactId !== "c1"), dup.map((r) => r.kind).join(","));
check("a limit above 20 is still 20", mergeResults(Array.from({ length: 30 }, (_, i) => deal(i)), [], 500).length === 20, "20");
check("nothing in, nothing out", mergeResults([], []).length === 0, "0");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
