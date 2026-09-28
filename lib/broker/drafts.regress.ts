/**
 * Regression suite for saved broker applications (lib/broker/drafts.ts).
 *
 * What must never happen:
 *   §1  a file, or anything the form does not have, gets stored in a draft;
 *   §2  junk from the browser breaks the form on resume;
 *   §3  an empty form is saved over and over as a "draft".
 */
import { MAX_PORTFOLIO_PROPERTIES } from "@/lib/pricing";
import {
  MAX_FIELD, MAX_NOTES, blankDraft, draftHasContent, draftLabel, isDraftId, parseDraft, savedAgo, stepLabel,
} from "./drafts";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. Only the form, never files ===");
const withFiles = parseDraft({
  form: { product: "fix_and_flip", purpose: "purchase", borrower: "Tony", email: "t@x.com", files: ["x"] },
  schedule: [{ address: "358 Cozart Ave SW", value: "250000", evil: "<script>" }],
  files: [{ name: "bank.pdf", data: "JVBERi0xLjQ..." }],
  step: 4,
  isPortfolio: false,
  brokerFirmId: "someone-elses-firm",
});
const stored = JSON.stringify(withFiles.ok ? withFiles.value : {});
check("parses", withFiles.ok, "");
check("files are never kept", !/files|bank\.pdf|JVBERi0/.test(stored), stored.slice(0, 120));
check("unknown keys are dropped (form, row and top level)", !/evil|script|brokerFirmId|someone-elses-firm/.test(stored), "");
check("known values survive", withFiles.ok && withFiles.value.form.borrower === "Tony" && withFiles.value.schedule[0].address === "358 Cozart Ave SW" && withFiles.value.step === 4, "");

console.log("\n=== 2. Junk in, a usable form out ===");
check("not an object → refused", !parseDraft("hello").ok && !parseDraft(null).ok && !parseDraft([1, 2]).ok, "");
const junk = parseDraft({ form: { product: "crypto_loan", purpose: "buy_a_home", fico: 712, borrower: { a: 1 } }, schedule: "nope", step: 99, isPortfolio: "yes" });
check("unknown product → DSCR default", junk.ok && junk.value.form.product === "dscr", junk.ok ? junk.value.form.product : "");
check("unknown purpose → purchase", junk.ok && junk.value.form.purpose === "purchase", "");
check("a number where text belongs is kept as text", junk.ok && junk.value.form.fico === "712", "");
check("an object where text belongs → blank", junk.ok && junk.value.form.borrower === "", "");
check("no schedule → one blank row", junk.ok && junk.value.schedule.length === 1 && junk.value.schedule[0].address === "", "");
check("step clamped to 5", junk.ok && junk.value.step === 5, "");
check("isPortfolio only true when true", junk.ok && junk.value.isPortfolio === false, "");
check("step 0 → 1, NaN → 1", parseDraft({ step: 0 }).ok && (parseDraft({ step: 0 }) as { value: { step: number } }).value.step === 1 && (parseDraft({ step: "x" }) as { value: { step: number } }).value.step === 1, "");
const long = parseDraft({ form: { borrower: "x".repeat(5000), notes: "n".repeat(9000) }, schedule: Array.from({ length: 40 }, () => ({ address: "a".repeat(999) })) });
check(`fields capped at ${MAX_FIELD}, notes at ${MAX_NOTES}`, long.ok && long.value.form.borrower.length === MAX_FIELD && long.value.form.notes.length === MAX_NOTES && long.value.schedule[0].address.length === MAX_FIELD, "");
check(`schedule capped at ${MAX_PORTFOLIO_PROPERTIES} properties`, long.ok && long.value.schedule.length === MAX_PORTFOLIO_PROPERTIES, long.ok ? String(long.value.schedule.length) : "");
check("a saved draft is well under the database's 60 KB limit at every maximum", long.ok && JSON.stringify(long.value).length < 60_000, long.ok ? String(JSON.stringify(long.value).length) : "");

console.log("\n=== 3. When a draft is worth saving ===");
check("a blank form is not saved", !draftHasContent(blankDraft()), "");
check("picking a program alone is not saved", !draftHasContent({ ...blankDraft(), form: { ...blankDraft().form, product: "fix_and_flip" } }), "");
check("a borrower name is", draftHasContent({ ...blankDraft(), form: { ...blankDraft().form, borrower: "Tony" } }), "");
check("an address alone is", draftHasContent({ ...blankDraft(), schedule: [{ ...blankDraft().schedule[0], address: "1 Main St" }] }), "");
check("whitespace alone is not", !draftHasContent({ ...blankDraft(), form: { ...blankDraft().form, borrower: "   " } }), "");

console.log("\n=== 4. Labels ===");
check("label: borrower · address", draftLabel({ ...blankDraft(), form: { ...blankDraft().form, borrower: "Tony Esposito" }, schedule: [{ ...blankDraft().schedule[0], address: "358 Cozart Ave SW" }] }) === "Tony Esposito · 358 Cozart Ave SW", "");
check("label with nothing yet", draftLabel(blankDraft()) === "Unnamed borrower · no property yet", draftLabel(blankDraft()));
check("step label", stepLabel(3) === "Step 3 of 5 · Property" && stepLabel(9) === "Step 5 of 5 · Review", stepLabel(3));
const now = new Date("2026-09-29T14:00:00Z");
check("saved ago", savedAgo("2026-09-29T13:59:40Z", now) === "just now" && savedAgo("2026-09-29T13:48:00Z", now) === "12 minutes ago" && savedAgo("2026-09-27T10:00:00Z", now) === "2 days ago" && savedAgo(null, now) === "", "");
check("draft ids are uuids only", isDraftId("7f1c2e9a-1b2c-4d5e-8f90-123456789abc") && !isDraftId("1; DROP TABLE") && !isDraftId(null), "");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
