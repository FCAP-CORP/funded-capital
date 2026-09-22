/**
 * Regression suite for the broker-facing stage view.
 *
 * Section 1 is the important one and it is not a unit test: it reads the live
 * database enum and asserts every stage has been given a broker-facing meaning.
 * Add a stage to schema.ts without deciding what a broker sees and this fails,
 * rather than production quietly showing them "In review" for something else.
 */

import {
  BROKER_STAGE, brokerStage, isOpenForBroker, isFundedForBroker,
} from "./stageView";
import { stageEnum } from "../db/schema";
import { STAGE_LABEL } from "../crm/view";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const dbStages = stageEnum.enumValues;

console.log("\n=== 1. Every internal stage has a broker-facing meaning ===");
const missing = dbStages.filter((s) => !(s in BROKER_STAGE));
check(
  "no stage is left undecided",
  missing.length === 0,
  missing.length ? `MISSING: ${missing.join(", ")}` : `${dbStages.length} stages`,
);
const invented = Object.keys(BROKER_STAGE).filter((s) => !dbStages.includes(s as (typeof dbStages)[number]));
check(
  "no stage is invented that the database cannot store",
  invented.length === 0,
  invented.length ? `NOT IN DB: ${invented.join(", ")}` : "none",
);
check(
  "every broker label is non-empty",
  dbStages.every((s) => (BROKER_STAGE[s]?.label ?? "").trim().length > 0),
  "all labelled",
);

console.log("\n=== 2. Internal vocabulary does not leak ===");
// A broker should never see the CRM's own wording for the stages that describe
// how the desk works. Matching labels are fine where the word is the plain
// English one anyway (Funded), so only the revealing ones are checked.
for (const internal of ["application_in", "underwriting", "conditions_clearing", "draw_cycle", "closed_lost"]) {
  check(
    `${internal} is not shown as "${STAGE_LABEL[internal]}"`,
    BROKER_STAGE[internal].label !== STAGE_LABEL[internal],
    `shown as "${BROKER_STAGE[internal].label}"`,
  );
}
check(
  "a lost deal is NOT called declined",
  !/declin/i.test(BROKER_STAGE.closed_lost.label),
  BROKER_STAGE.closed_lost.label,
);

console.log("\n=== 3. Who the ball is with ===");
// These are the stages where nothing moves until the broker or their borrower
// acts. Getting this wrong in either direction is costly: a false alarm wastes
// their time, a missed one loses a deal to silence.
for (const s of ["term_sheet_issued", "conditional_approval", "conditions_clearing", "docs_out"]) {
  check(`${s} waits on the broker`, BROKER_STAGE[s].waitingOnBroker, "yes");
}
for (const s of ["lead", "qualified", "application_in", "underwriting", "clear_to_close", "funded", "closed_lost"]) {
  check(`${s} does NOT wait on the broker`, !BROKER_STAGE[s].waitingOnBroker, "no");
}

console.log("\n=== 4. Open, funded and closed ===");
check("a lead is open", isOpenForBroker("lead"), "open");
check("underwriting is open", isOpenForBroker("underwriting"), "open");
check("funded is still open (it is a live loan)", isOpenForBroker("funded"), "open");
check("a payoff is closed", !isOpenForBroker("payoff"), "closed");
check("a lost deal is closed", !isOpenForBroker("closed_lost"), "closed");

check("funded counts as funded", isFundedForBroker("funded"), "yes");
check("active counts as funded", isFundedForBroker("active"), "yes");
check("a drawing loan counts as funded", isFundedForBroker("draw_cycle"), "yes");
check("a paid-off loan still counts as funded", isFundedForBroker("payoff"), "yes");
check("a lost deal does NOT count as funded", !isFundedForBroker("closed_lost"), "no");
check("underwriting does not count as funded", !isFundedForBroker("underwriting"), "no");

console.log("\n=== 5. Unknown input fails safe ===");
// Never invent good news. An unrecognised stage must not read as funded, and
// must not read as lost either.
for (const bad of [null, undefined, "", "something_new"]) {
  const v = brokerStage(bad);
  check(
    `"${String(bad)}" -> in review, not funded or closed`,
    v.label === "In review" && v.tone === "progress" && !v.waitingOnBroker,
    v.label,
  );
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
