/** Regression suite for the Pipeline page's deal-source switch (lib/crm/pipelineLens.ts). */
import { lensOf, inLens, lensCounts, parseLens, effectiveLastContact, LENS_LABEL, LENSES } from "./pipelineLens";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. Where a deal belongs ===");
check("portal submission (broker participant) → broker", lensOf({ viaBroker: true, leadSource: "broker" }) === "broker", "broker");
check("lead source broker without a participant → broker", lensOf({ viaBroker: false, leadSource: "broker" }) === "broker", "broker");
check("broker on a BiggerPockets-sourced deal → broker (the broker owns the conversation)", lensOf({ viaBroker: true, leadSource: "biggerpockets" }) === "broker", "broker");
check("website → website", lensOf({ viaBroker: false, leadSource: "website" }) === "website", "website");
check("BiggerPockets → biggerpockets", lensOf({ viaBroker: false, leadSource: "biggerpockets" }) === "biggerpockets", "bp");
check("referral → other", lensOf({ viaBroker: false, leadSource: "referral" }) === "other", "other");
check("unknown → other", lensOf({ viaBroker: false, leadSource: "unknown" }) === "other", "other");
check("all shows everything", inLens({ viaBroker: false, leadSource: "reia" }, "all"), "all");
check("broker lens hides a website lead", !inLens({ viaBroker: false, leadSource: "website" }, "broker"), "hidden");

console.log("\n=== 2. Counts add up ===");
const rows = [
  { viaBroker: true, leadSource: "broker" }, { viaBroker: true, leadSource: "biggerpockets" },
  { viaBroker: false, leadSource: "website" }, { viaBroker: false, leadSource: "biggerpockets" },
  { viaBroker: false, leadSource: "referral" },
];
const c = lensCounts(rows);
check("all = 5", c.all === 5, String(c.all));
check("broker = 2", c.broker === 2, String(c.broker));
check("parts sum to all", c.broker + c.website + c.biggerpockets + c.other === c.all, JSON.stringify(c));
check("every lens has a label", LENSES.every((l) => Boolean(LENS_LABEL[l])), "labels");

console.log("\n=== 3. ?view= is a closed list ===");
check("broker", parseLens("broker") === "broker", parseLens("broker"));
check("missing → all", parseLens(null) === "all", "all");
check("junk → all", parseLens("<script>") === "all", "all");
check("case matters (no surprises)", parseLens("Broker") === "all", "all");

console.log("\n=== 4. Last contact on a broker's deal ===");
const D = (d: string) => `2026-10-${d}T12:00:00Z`;
let e = effectiveLastContact({ lastContactAt: null, lastContactDirection: null, brokerContactAt: D("08") });
check("only the broker was contacted → broker's date, labelled", e.at === D("08") && e.viaBroker, JSON.stringify(e));
e = effectiveLastContact({ lastContactAt: D("09"), lastContactDirection: "email_in", brokerContactAt: D("08") });
check("borrower more recent → borrower's, direction kept", e.at === D("09") && !e.viaBroker && e.direction === "email_in", JSON.stringify(e));
e = effectiveLastContact({ lastContactAt: D("01"), lastContactDirection: "email_out", brokerContactAt: D("08") });
check("broker more recent → broker's", e.at === D("08") && e.viaBroker, JSON.stringify(e));
e = effectiveLastContact({ lastContactAt: null, lastContactDirection: null, brokerContactAt: null });
check("nobody → never", e.at === null && !e.viaBroker, JSON.stringify(e));
e = effectiveLastContact({ lastContactAt: D("05"), lastContactDirection: "call", brokerContactAt: null });
check("house lead unchanged", e.at === D("05") && e.direction === "call" && !e.viaBroker, JSON.stringify(e));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
