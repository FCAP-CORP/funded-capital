/**
 * Put ONE fabricated broker submission through the real write path, against the
 * dev branch, and read back what actually landed.
 *
 * WHY NOT SUBMIT THROUGH THE PORTAL:
 * The live form also posts to the Google Apps Script, which creates a real
 * folder in Drive intake and emails the team. A first test should not manufacture
 * a fake deal inside the systems people actually work from. This calls
 * `recordBrokerApplication` directly — the same function the route calls — so
 * everything under test is real except the HTTP hop and Drive.
 *
 * IT REFUSES TO RUN AGAINST PRODUCTION. Same check as db-preflight: if this
 * machine's database is the one it used before the dev branch existed, it stops.
 *
 * The rows it writes are obvious: a reserved .invalid email that can never
 * reach a real inbox, a name that says TEST, and no phone number at all, so
 * nothing here can be texted, emailed or mistaken for a lead.
 */

import { config as loadEnv } from "dotenv";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, asc } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { recordBrokerApplication } from "../lib/broker/record";
import { CONSENT_VERSION } from "../lib/consent";

const ROOT = process.cwd();
loadEnv({ path: join(ROOT, ".env.local") });
loadEnv({ path: join(ROOT, ".env") });

const OUT_DIR = join(ROOT, ".fc-check");
const REPORT = join(OUT_DIR, "test-submission.md");

const lines: string[] = [];
const log = (s = "") => { lines.push(s); console.log(s); };

function finish(code: number): never {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT, lines.join("\n"), "utf8");
  console.log(`\n  Report written to .fc-check/test-submission.md`);
  process.exit(code);
}

const endpoint = (u: string) => { try { return new URL(u).hostname.replace("-pooler", ""); } catch { return null; } };

/**
 * Wrapped in main() rather than using top-level await: tsx compiles a .ts
 * file in this project to CommonJS, where top-level await is a build error.
 * scripts/migrate-crm.ts does the same.
 */
async function main() {
  log("# Test broker submission");
  log();

  const url = process.env.DATABASE_URL;
  if (!url) { log("**FAILED** — DATABASE_URL is not set."); finish(1); }

  /* ---- refuse to touch production ------------------------------------------ */
  const BACKUP = join(ROOT, ".env.local.before-dev-branch");
  if (!existsSync(BACKUP)) {
    log("**REFUSED** — `.env.local.before-dev-branch` is missing, so there is no way");
    log("to prove this is not production. Nothing was written.");
    finish(1);
  }
  const prev = readFileSync(BACKUP, "utf8").split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL="));
  const prevUrl = prev ? prev.slice(prev.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
  if (endpoint(prevUrl) && endpoint(prevUrl) === endpoint(url)) {
    log("**REFUSED** — this is the endpoint this machine used BEFORE the dev branch.");
    log("That is production. Nothing was written.");
    finish(1);
  }
  log(`- **Host:** \`${new URL(url).hostname}\``);
  log(`- **When:** ${new Date().toISOString()}`);
  log();

  /* ---- the fabricated submission ------------------------------------------- */
  // .invalid is reserved by RFC 2606 and can never resolve, so these addresses
  // cannot reach a real person even if something later tries to mail them.
  const STAMP = Date.now();
  const BROKER_EMAIL = `test.broker.${STAMP}@funded-capital-test.invalid`;
  const BORROWER_EMAIL = `test.borrower.${STAMP}@funded-capital-test.invalid`;
  const CLERK_ID = `user_TEST_${STAMP}`;

  const result = await recordBrokerApplication({
    clerkUserId: CLERK_ID,
    brokerEmail: BROKER_EMAIL,
    brokerName: "TEST Broker (automated)",
    submissionName: `TEST SUBMISSION — DO NOT WORK — ${STAMP}`,
    summary: "Automated test of the broker portal write path. Not a real deal.",
    application: {
      program: "DSCR / Rental",
      purpose: "cash_out_refi",
      borrower: "TEST Borrower DoNotContact",
      entity: "TEST Holdings LLC",
      email: BORROWER_EMAIL,
      // No phone at all. A test row must not be textable under any circumstance.
      fico: "731",
      propertyAddress: "1 Test Street, Nowhere IL 60000",
      loanAmount: "750000",
      propertyValue: "1000000",
      notes: "AUTOMATED TEST ROW — safe to delete.",
    },
    // Three properties, to exercise the portfolio schedule and the join table.
    properties: [
      { address: "1 Test Street, Nowhere IL", value: "400000", monthlyRent: "3200", annualTaxes: "6000", annualInsurance: "1400", annualHoa: "0", estimatedPayoff: "180000" },
      { address: "2 Test Street, Nowhere IL", value: "350000", monthlyRent: "2900", annualTaxes: "5200", annualInsurance: "1300", annualHoa: "0", estimatedPayoff: "160000" },
      { address: "3 Test Street, Nowhere IL", value: "250000", monthlyRent: "2100", annualTaxes: "3900", annualInsurance: "1100", annualHoa: "0", estimatedPayoff: "90000" },
      {}, // a blank row, as a ten-row form would produce — must be dropped
    ],
    isPortfolio: true,
    submittedAt: new Date(),
    fileCount: 0,
    smsConsent: true,
    consentVersion: CONSENT_VERSION,
  });

  if (!result.ok) {
    log(`**THE WRITE FAILED** — nothing to read back.`);
    log();
    log("```");
    log(result.error);
    log("```");
    finish(1);
  }

  log(`Write reported success. Application \`${result.applicationId}\`.`);
  log();

  /* ---- read back what actually landed --------------------------------------- */
  const db = drizzle(neon(url), { schema });

  const [app] = await db.select().from(schema.applications)
    .where(eq(schema.applications.id, result.applicationId));

  const props = await db
    .select({
      position: schema.applicationProperties.position,
      address: schema.properties.addressLine1,
      purchasePrice: schema.properties.purchasePrice,
      asIsValue: schema.properties.asIsValue,
      rent: schema.properties.monthlyRent,
      taxes: schema.properties.annualTaxes,
      payoff: schema.properties.estimatedPayoff,
    })
    .from(schema.applicationProperties)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.applicationProperties.propertyId))
    .where(eq(schema.applicationProperties.applicationId, result.applicationId))
    .orderBy(asc(schema.applicationProperties.position));

  const parts = await db
    .select({ role: schema.participants.role, name: schema.contacts.firstName, email: schema.contacts.email })
    .from(schema.participants)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.participants.contactId))
    .where(eq(schema.participants.applicationId, result.applicationId));

  const trans = await db.select().from(schema.stageTransitions)
    .where(eq(schema.stageTransitions.applicationId, result.applicationId));

  const acts = await db.select().from(schema.activities)
    .where(eq(schema.activities.applicationId, result.applicationId));

  const [brokerRow] = await db.select().from(schema.brokerUsers)
    .where(eq(schema.brokerUsers.clerkUserId, CLERK_ID));

  /* ---- assertions ----------------------------------------------------------- */
  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean, detail: string) => {
    cond ? pass++ : fail++;
    lines.push(`| ${cond ? "PASS" : "**FAIL**"} | ${name} | ${detail} |`);
    console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
  };

  log("| | Check | Detail |");
  log("|---|---|---|");

  check("application row exists", Boolean(app), app ? app.id : "missing");
  check("stamped with the submitting broker", app?.submittedByUserId === CLERK_ID, app?.submittedByUserId ?? "null");
  check("unassigned broker means no firm", app?.brokerFirmId === null, String(app?.brokerFirmId));
  check("product mapped from the label", app?.product === "dscr", String(app?.product));
  check("loan purpose stored", app?.loanPurpose === "cash_out_refi", String(app?.loanPurpose));
  check("marked as a portfolio", app?.isPortfolio === true, String(app?.isPortfolio));
  check("property count excludes the blank row", app?.propertyCount === 3, String(app?.propertyCount));
  check("lead source is broker", app?.leadSource === "broker", String(app?.leadSource));
  check("stage is lead", app?.stage === "lead", String(app?.stage));

  check("three properties attached", props.length === 3, String(props.length));
  check("in the order entered", props.map((p) => p.position).join(",") === "0,1,2", props.map((p) => p.position).join(","));
  check(
    "a refinance files as-is value, not purchase price",
    props.every((p) => p.asIsValue !== null && p.purchasePrice === null),
    props.map((p) => p.asIsValue).join(" / "),
  );
  check("per-property carrying costs stored", props.every((p) => p.taxes !== null), props.map((p) => p.taxes).join(" / "));
  check("per-property payoff stored", props.every((p) => p.payoff !== null), props.map((p) => p.payoff).join(" / "));

  // 750,000 against 1,000,000 of collateral = 0.75. Against only the first
  // property it would read 1.875 — the bug this check exists to catch.
  check("LTV is against the WHOLE schedule", app?.ltv === "0.7500", String(app?.ltv));
  check("binding ratio named", app?.bindingRatio === "ltv", String(app?.bindingRatio));

  check("borrower attached", parts.some((p) => p.role === "borrower"), String(parts.length));
  check("broker attached as a participant", parts.some((p) => p.role === "broker"), parts.map((p) => p.role).join(","));
  check("exactly one stage transition", trans.length === 1, String(trans.length));
  check("history starts at lead", trans[0]?.toStage === "lead", String(trans[0]?.toStage));
  check("submission recorded as an activity", acts.length === 1, String(acts.length));

  check("broker_users row created", Boolean(brokerRow), brokerRow?.id ?? "missing");
  check("broker arrives unassigned", brokerRow?.firmId === null, String(brokerRow?.firmId));
  check("broker role defaults to member", brokerRow?.role === "member", String(brokerRow?.role));
  check("broker SMS consent recorded", Boolean(brokerRow?.smsConsentAt), String(brokerRow?.smsConsentAt));
  check("consent version stored", brokerRow?.smsConsentVersion === CONSENT_VERSION, String(brokerRow?.smsConsentVersion));

  // The borrower must NOT have consent — a broker cannot give it for them.
  const borrower = await db.select({ c: schema.contacts.smsConsentAt })
    .from(schema.contacts).where(eq(schema.contacts.email, BORROWER_EMAIL));
  check("borrower has NO SMS consent", borrower[0]?.c === null, String(borrower[0]?.c));

  log();
  log(`**${pass} passed, ${fail} failed**`);
  log();
  log("## Rows written (dev branch only)");
  log();
  log(`- application \`${result.applicationId}\``);
  log(`- broker_users \`${result.brokerUserId}\``);
  log(`- contacts: \`${BORROWER_EMAIL}\`, \`${BROKER_EMAIL}\``);
  log();
  log("Search the CRM for **TEST SUBMISSION** to see it, and delete when done.");

  finish(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  log();
  log("**THE TEST CRASHED**");
  log();
  log("```");
  log(String(err instanceof Error ? err.stack ?? err.message : err).slice(0, 1200));
  log("```");
  finish(1);
});
