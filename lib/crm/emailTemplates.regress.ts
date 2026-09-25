/**
 * Regression suite for the record card's email templates: the brand rules as
 * tests, so a template added later cannot quietly break them.
 */
import { EMAIL_TEMPLATES, fillTemplate, greetingName, templateByKey } from "./emailTemplates";
import { parseEmailDraft } from "../comms/email";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const full = { firstName: "Tony", street: "358 Cozart Ave SW", address: "358 Cozart Ave SW, Concord NC", program: "Fix & Flip", senderFirstName: "Luis" };
const empty = { firstName: null, street: null, address: null, program: null, senderFirstName: null };

console.log("\n=== 1. Names ===");
for (const [raw, want] of [["JOHN VAUGHN", "John"], ["tony esposito", "Tony"], ["McKay Smith", "McKay"], ["mary-ann lee", "Mary-Ann"], ["o'neil", "O'Neil"], ["(no name)", null], ["", null], [null, null]] as const) {
  check(`greetingName(${JSON.stringify(raw)}) → ${JSON.stringify(want)}`, greetingName(raw) === want, String(greetingName(raw)));
}

console.log("\n=== 2. Every template, with full and with empty details ===");
const keys = new Set<string>();
for (const t of EMAIL_TEMPLATES) {
  check(`${t.key}: unique key`, !keys.has(t.key), t.key);
  keys.add(t.key);
  for (const [label, vars] of [["full", full], ["empty", empty]] as const) {
    const f = fillTemplate(t, vars);
    const all = `${f.subject}\n${f.body}`;
    check(`${t.key} (${label}): no placeholder left`, !/\{\w+\}/.test(all), "");
    check(`${t.key} (${label}): no double spaces or "undefined"/"null"`, !/ {2}|undefined|null/.test(all), JSON.stringify(f.subject));
    check(`${t.key} (${label}): subject has no HTML entity`, !/&(?:[a-z]+|#\d+);/i.test(f.subject), f.subject);
    if (t.key !== "blank") check(`${t.key} (${label}): passes the send rules as filled`, parseEmailDraft(f.subject, f.body).ok, "");
  }
  const text = `${t.subject}\n${t.body}`.toLowerCase();
  check(`${t.key}: quotes no rate, amount or percentage`, !/\d+(\.\d+)?\s?%|\$\s?\d|\brate of\b|\binterest rate\b/.test(text), "");
  check(`${t.key}: no guarantee or approval language`, !/guarantee|pre-?approved|approved for|we will fund|will close/.test(text), "");
  check(`${t.key}: no homebuyer language`, !/homebuyer|first home|primary residence|mortgage for your home/.test(text), "");
  check(`${t.key}: no sign-off name (the signature follows)`, !/\n(luis|luis fajardo|funded capital)\s*$/i.test(t.body.trim()), "");
}

console.log("\n=== 3. Fill-ins read naturally ===");
const first = fillTemplate(templateByKey("first-reply")!, full);
check("first reply: subject names the program with a literal &", first.subject === "Your Fix & Flip loan request", first.subject);
check("first reply: greets by first name", first.body.startsWith("Hi Tony,"), "");
check("first reply: names the property", first.body.includes("the property at 358 Cozart Ave SW, Concord NC"), "");
const bare = fillTemplate(templateByKey("first-reply")!, empty);
check("first reply, no details: 'Your loan request'", bare.subject === "Your loan request", bare.subject);
check("…'Hi there,'", bare.body.startsWith("Hi there,"), "");
check("…'your project'", bare.body.includes("about your project."), "");
const docs = fillTemplate(templateByKey("documents")!, full);
check("documents: short subject uses the street", docs.subject === "Next step on 358 Cozart Ave SW: a few documents", docs.subject);

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
