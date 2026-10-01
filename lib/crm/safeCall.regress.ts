/** safeCall — a thrown or malformed server-action result becomes an ordinary failure. */
import { OFFLINE_MESSAGE, errorOf, safeCall } from "./safeCall";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

async function main() {
  console.log("\n=== safeCall ===");
  const ok = await safeCall(async () => ({ ok: true as const }));
  check("a success passes through", ok.ok === true);
  const no = await safeCall(async () => ({ ok: false as const, error: "Deal not found." }));
  check("a refusal passes through with its own words", !no.ok && (no as { error: string }).error === "Deal not found.");
  const threw = await safeCall(async (): Promise<{ ok: boolean }> => { throw new Error("Failed to fetch"); });
  check("a thrown request becomes a failure, never a crash", !threw.ok && (threw as { error: string }).error === OFFLINE_MESSAGE);
  const voided = await safeCall(async () => undefined as unknown as { ok: boolean });
  check("an empty answer is a failure, not a silent success", !voided.ok);
  check("errorOf reads error, then message", errorOf({ ok: false, error: "a" }) === "a" && errorOf({ ok: false, message: "b" }) === "b" && errorOf({ ok: false }) === OFFLINE_MESSAGE);
  console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
