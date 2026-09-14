/**
 * Guard: the CRM's label maps must cover the database enums exactly.
 *
 * This is the bug that has already shipped three times on this project in
 * different costumes — a value the database stores that the code does not
 * recognise. Each time it typechecked, built cleanly, and lost data silently:
 * every New Construction lead mapped to `unknown` for weeks because a form
 * posted the slug `construction` while the matcher looked for the label.
 *
 * The same shape applies to the grid. A stage in the schema with no entry in
 * STAGE_ORDER is a stage the dropdown will not offer, so any deal sitting in it
 * can be moved out but never back in — and a stage in STAGE_ORDER that the
 * database rejects is a dropdown option that throws when chosen.
 *
 * So the check is two-directional and mechanical, against the enums themselves
 * rather than a list retyped here. Adding a stage to schema.ts and forgetting
 * the label fails this suite instead of reaching production.
 */

import { stageEnum, leadSourceEnum, productEnum } from "../db/schema";
import { STAGE_LABEL, STAGE_ORDER, GATE_STAGES, PRODUCT_LABEL, SOURCE_LABEL } from "./view";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

/** Compare both directions and name the offending values, not just a count. */
function bothWays(what: string, dbValues: readonly string[], uiValues: readonly string[]) {
  const missing = dbValues.filter((v) => !uiValues.includes(v));
  const extra = uiValues.filter((v) => !dbValues.includes(v));
  check(
    `every ${what} in the database is known to the UI`,
    missing.length === 0,
    missing.length ? `MISSING: ${missing.join(", ")}` : `${dbValues.length} values`,
  );
  check(
    `the UI invents no ${what} the database would reject`,
    extra.length === 0,
    extra.length ? `NOT IN DB: ${extra.join(", ")}` : "none",
  );
}

console.log("\n=== 1. Stages ===");
const dbStages = stageEnum.enumValues;
bothWays("stage", dbStages, STAGE_ORDER);
bothWays("stage", dbStages, Object.keys(STAGE_LABEL));

check(
  "STAGE_ORDER lists each stage once",
  new Set(STAGE_ORDER).size === STAGE_ORDER.length,
  `${STAGE_ORDER.length} entries, ${new Set(STAGE_ORDER).size} distinct`,
);
check(
  "no stage label is blank",
  STAGE_ORDER.every((s) => (STAGE_LABEL[s] ?? "").trim().length > 0),
  "all labelled",
);
check(
  "conversion gates are real stages",
  [...GATE_STAGES].every((g) => dbStages.includes(g as (typeof dbStages)[number])),
  [...GATE_STAGES].join(", "),
);

console.log("\n=== 2. Products ===");
bothWays("product", productEnum.enumValues, Object.keys(PRODUCT_LABEL));

console.log("\n=== 3. Lead sources ===");
bothWays("lead source", leadSourceEnum.enumValues, Object.keys(SOURCE_LABEL));

console.log("\n=== 4. The two escape hatches stay escape hatches ===");
// `unknown` renders as a dash on purpose: an unclassified lead must look
// unclassified, not like a product called "Unknown" that nobody sells.
check("unknown product renders as a dash", PRODUCT_LABEL.unknown === "—", PRODUCT_LABEL.unknown);
check("unknown source renders as a dash", SOURCE_LABEL.unknown === "—", SOURCE_LABEL.unknown);
check(
  "not_our_product is named, not dashed",
  PRODUCT_LABEL.not_our_product === "Not our product",
  PRODUCT_LABEL.not_our_product,
);

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
