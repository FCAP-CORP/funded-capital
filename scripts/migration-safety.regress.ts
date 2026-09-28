/**
 * The production migration guard (scripts/migration-safety.mjs).
 *
 * The guard exists so a DROP or TRUNCATE can never ride along inside a routine
 * migration. Its one exception — replacing a CHECK constraint in the same file —
 * is pinned here in both directions, and every real migration in drizzle/ is
 * run through it so the test can never pass on an empty list.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isCheckReplacement, offencesIn } from "./migration-safety.mjs";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const DROP = `ALTER TABLE "nurture_enrollments" DROP CONSTRAINT IF EXISTS "nurture_enrollments_program_check"`;
const ADD = `ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_program_check" CHECK ("program" IN ('a', 'b'))`;
type Offence = { name: string };
const names = (stmts: string[]) => (offencesIn(stmts) as Offence[]).map((o) => o.name).join(",");

console.log("\n§1 the one exception");
check("dropping a CHECK that the same file re-adds is allowed", offencesIn([DROP, ADD]).length === 0, names([DROP, ADD]));
check("...in either order within the file", offencesIn([ADD, DROP]).length === 0, "");
check("isCheckReplacement recognises it", isCheckReplacement(DROP, [DROP, ADD]), "");

console.log("\n§2 everything else is still refused");
check("a CHECK dropped and NOT re-added is refused", names([DROP]) === "DROP", names([DROP]));
check("re-added on a DIFFERENT table is refused", names([DROP, ADD.replace('"nurture_enrollments"', '"contacts"')]) === "DROP", "");
check("re-added under a different name is refused", names([DROP, ADD.replace("program_check\" CHECK", "other_check\" CHECK")]) === "DROP", "");
check("re-added as something other than a CHECK is refused",
  names([DROP, `ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_program_check" UNIQUE ("program")`]) === "DROP", "");
const fk = `ALTER TABLE "x" DROP CONSTRAINT IF EXISTS "x_contact_id_contacts_id_fk"`;
check("a foreign key drop is refused even if something is re-added", names([fk, `ALTER TABLE "x" ADD CONSTRAINT "x_contact_id_contacts_id_fk" CHECK (true)`]) === "DROP", "");
const noIfExists = `ALTER TABLE "nurture_enrollments" DROP CONSTRAINT "nurture_enrollments_program_check"`;
check("the exception needs IF EXISTS (exact form only)", names([noIfExists, ADD]) === "DROP", "");
const sneaky = `${DROP}; DROP TABLE contacts`;
check("a drop with anything after it is refused", names([sneaky, ADD]).includes("DROP"), names([sneaky, ADD]));
check("DROP TABLE refused", names(["DROP TABLE contacts"]) === "DROP", "");
check("DROP COLUMN refused", names([`ALTER TABLE contacts DROP COLUMN email`]) === "DROP", "");
check("TRUNCATE refused", names(["TRUNCATE contacts"]) === "TRUNCATE", "");
check("DELETE refused", names(["DELETE FROM contacts WHERE true"]) === "DELETE", "");
check("RENAME refused", names(["ALTER TABLE contacts RENAME TO people"]) === "RENAME", "");
check("SET NOT NULL refused", names(["ALTER TABLE contacts ALTER COLUMN email SET NOT NULL"]).startsWith("SET NOT NULL"), "");

console.log("\n§3 every real migration");
const dir = join(process.cwd(), "drizzle");
const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
check("found the migrations, including 0015", files.length >= 16 && files.includes("0015_nurture_contacts.sql"), `${files.length} files`);
for (const f of files) {
  const stmts = readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint").map((s) => s.trim().replace(/;$/, "").trim()).filter(Boolean);
  const o = offencesIn(stmts) as Offence[];
  check(`  ${f} passes the production guard`, o.length === 0, o.map((x) => x.name).join(",") || `${stmts.length} statements`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
