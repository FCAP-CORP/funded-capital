/**
 * Regression suite for broker update emails (lib/crm/brokerUpdates.ts).
 * What must never happen:
 *   §1 a broker is emailed about a move they cannot see (same broker label),
 *      a step backwards, or an internal stage;
 *   §2 an email quotes a rate, an amount, a guarantee or why a deal was lost,
 *      or carries an HTML entity or a line break in the subject;
 *   §3 the term-sheet email and the document list arrive as two emails.
 */
import { NOTIFY_STAGES, STAGE_ORDER, dealName, docsEmail, firstNameOf, stageEmail, stageWorthEmail } from "./brokerUpdates";
import { STAGE_LABEL } from "./view";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`); };

console.log("\n=== 1. Which moves email the broker ===");
check("every CRM stage is in the order list", Object.keys(STAGE_LABEL).every((s) => (STAGE_ORDER as readonly string[]).includes(s)), "");
check("qualified → term sheet issued: yes", stageWorthEmail("qualified", "term_sheet_issued"));
check("lead → qualified: no (internal)", !stageWorthEmail("lead", "qualified"));
check("term sheet issued → signed: no (they signed it)", !stageWorthEmail("term_sheet_issued", "term_sheet_signed"));
check("signed → application in: yes", stageWorthEmail("term_sheet_signed", "application_in"));
check("application in → underwriting: no (same 'In underwriting' to the broker)", !stageWorthEmail("application_in", "underwriting"));
check("underwriting → conditionally approved → clearing → clear to close → docs out: yes each", stageWorthEmail("underwriting", "conditional_approval") && stageWorthEmail("conditional_approval", "conditions_clearing") && stageWorthEmail("conditions_clearing", "clear_to_close") && stageWorthEmail("clear_to_close", "docs_out"));
check("docs out → funded: yes", stageWorthEmail("docs_out", "funded"));
check("funded → active / draw cycle: no (still 'Funded')", !stageWorthEmail("funded", "active") && !stageWorthEmail("active", "draw_cycle"));
check("a step backwards is silent (underwriting → term sheet issued)", !stageWorthEmail("underwriting", "term_sheet_issued"));
check("any open stage → closed lost: yes", stageWorthEmail("underwriting", "closed_lost") && stageWorthEmail("lead", "closed_lost"));
check("closed lost → closed lost: no", !stageWorthEmail("closed_lost", "closed_lost"));
check("reopened from closed lost into term sheet: yes", stageWorthEmail("closed_lost", "term_sheet_issued"));
check("every notify stage has copy", NOTIFY_STAGES.every((s) => stageEmail({ to: s, brokerName: "Alice Broker", deal: { borrower: "Tony Esposito", property: "358 Cozart Ave SW" }, applicationId: "a", openDocs: [] }) !== null));

console.log("\n=== 2. What the emails say ===");
const deal = { borrower: "Tony Esposito", property: "358 Cozart Ave SW" };
const all = NOTIFY_STAGES.map((s) => stageEmail({ to: s, brokerName: "Alice Broker", deal, applicationId: "7f1c2e9a-1b2c-4d5e-8f90-123456789abc", openDocs: [{ label: "Bank statements, last 2 months", note: null }] })!);
all.push(docsEmail({ brokerName: "Alice", deal, applicationId: "x", docs: [{ label: "HOA estoppel letter", note: "From the association" }], added: true })!);
const text = all.map((e) => `${e.subject}\n${e.body}`).join("\n");
check("no rate, amount or percentage", !/\d+(\.\d+)?\s?%|\$\s?\d|\b\d+(\.\d+)?\s?(points?|bps)\b/i.test(text), "");
check("no guarantee language", !/guarantee|guaranteed|locked|pre-?approved|will fund|certain/i.test(text), "");
check("no homebuyer language", !/homebuyer|first home|primary residence|mortgage for your home/i.test(text), "");
check("no subject has an HTML entity or a line break", all.every((e) => !/&(?:[a-z]+|#\d+);/i.test(e.subject) && !/[\r\n]/.test(e.subject)), "");
check("subjects are short", all.every((e) => e.subject.length <= 150), "");
check("greets the broker by first name", all[0].body.startsWith("Hi Alice,"), all[0].body.split("\n")[0]);
check("a nameless broker gets a plain 'Hi,'", stageEmail({ to: "funded", brokerName: null, deal, applicationId: "a", openDocs: [] })!.body.startsWith("Hi,"), "");
const lost = stageEmail({ to: "closed_lost", brokerName: "Alice", deal, applicationId: "a", openDocs: [{ label: "x", note: null }] })!;
check("the lost email never gives a reason and never asks for documents", !/because|reason|declin|denied|credit|appraisal/i.test(lost.body) && !/need/.test(lost.body), lost.body.split("\n")[2]);
check("the lost email offers to pick it back up", /pick it back up/.test(lost.body), "");
const funded = stageEmail({ to: "funded", brokerName: "Alice", deal, applicationId: "a", openDocs: [{ label: "x", note: null }] })!;
check("the funded email does not ask for documents", !/need/.test(funded.body), "");
check("deal name joins borrower and property", dealName(deal) === "Tony Esposito - 358 Cozart Ave SW", dealName(deal));
check("deal name falls back politely", dealName({ borrower: null, property: null }) === "your deal", "");
check("first name: odd input gives none", firstNameOf("  ") === null && firstNameOf("J.") === null && firstNameOf("María José") === "María", String(firstNameOf("María José")));

console.log("\n=== 3. One email, not two ===");
const ts = stageEmail({ to: "term_sheet_issued", brokerName: "Alice", deal, applicationId: "7f1c2e9a-1b2c-4d5e-8f90-123456789abc", openDocs: [{ label: "Entity documents", note: null }, { label: "Photo ID for each guarantor", note: null }] })!;
check("the term-sheet email carries the document list", /we still need 2 documents/.test(ts.body) && /- Entity documents/.test(ts.body) && /- Photo ID/.test(ts.body), "");
check("...and the upload link to the deal page", /https:\/\/www\.fundedcapital\.com\/broker-portal\/deal\/7f1c2e9a-1b2c-4d5e-8f90-123456789abc/.test(ts.body), "");
check("docs email: one added item reads 'One more document'", /One more document on/.test(all[all.length - 1].body) && /\(From the association\)/.test(all[all.length - 1].body), "");
check("docs email: nothing to ask for → no email", docsEmail({ brokerName: null, deal, applicationId: "a", docs: [], added: false }) === null, "");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
