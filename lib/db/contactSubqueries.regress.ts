/**
 * Regression suite for the Contacts list's per-person subqueries.
 *
 * WHY IT EXISTS. Until 24 Sep 2026 every row on /crm/contacts showed 0 deals
 * and "never" contacted. Drizzle writes a column in a single-table SELECT list
 * without its table name, so `${contacts.id}` inside a correlated subquery came
 * out as a bare "id" — which Postgres resolves to the INNER table's id. The
 * query ran, returned numbers, and every number was wrong.
 *
 * This renders the real select (no connection — drizzle.mock) and pins the
 * qualified form. Negative-tested: putting `${contacts.id}` back fails §2.
 */

import { drizzle } from "drizzle-orm/neon-http";
import { desc } from "drizzle-orm";
import { contacts } from "./schema";
import { CONTACT_ID, dealCount, lastContactAt, lastContactKind } from "./contactSubqueries";
import { PgDialect } from "drizzle-orm/pg-core";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const db = drizzle.mock();
const built = db
  .select({ id: contacts.id, deals: dealCount(), lastContactAt: lastContactAt(), dir: lastContactKind() })
  .from(contacts)
  .orderBy(desc(contacts.createdAt))
  .toSQL().sql;

const subqueries = built.match(/\(\s*SELECT[\s\S]*?\)(?=,| from)/g) ?? [];

console.log("\n=== 1. The id renders qualified ===");
check("CONTACT_ID is \"contacts\".\"id\"", new PgDialect().sqlToQuery(CONTACT_ID).sql === `"contacts"."id"`, new PgDialect().sqlToQuery(CONTACT_ID).sql);
check("three subqueries found in the select", subqueries.length === 3, String(subqueries.length));

console.log("\n=== 2. Every subquery correlates on the OUTER contact ===");
for (const [i, q] of subqueries.entries()) {
  check(`subquery ${i + 1} compares contact_id with "contacts"."id"`, /contact_id = "contacts"\."id"/.test(q), q.replace(/\s+/g, " ").slice(0, 90));
  check(`subquery ${i + 1} has no bare "id"`, !/= "id"/.test(q), "no bare id");
}

console.log("\n=== 3. Deals are counted once per application ===");
check("deal count is DISTINCT on application_id", /count\(DISTINCT p\.application_id\)/.test(built), "distinct");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
