/**
 * Bring the broker submissions that only exist in the Google Sheet into the CRM.
 *
 * The broker portal wrote to a Sheet until 22 Sep 2026. Those deals are real —
 * documents in Drive, borrowers, amounts — and the CRM knows nothing about
 * them. This puts them in.
 *
 * THE ROWS ARE EMBEDDED, VERBATIM, BELOW. They were read from
 * "Broker Portal Submissions" (Drive id 1Nslgi...) on 22 Sep 2026 and are
 * written out here rather than fetched, so that what this script inserts can be
 * read and checked before it runs. A backfill that reads a live sheet is a
 * backfill nobody can review.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   - It creates no `broker_users` rows. That table is keyed by Clerk user id
 *     and the Sheet only has email addresses; inventing an id would produce a
 *     second, conflicting row the day that broker actually signs in. The
 *     submitting broker is recorded as a CONTACT with the `broker` role on the
 *     application instead, which is true and is enough for a later step to
 *     claim these deals by email once firms exist.
 *
 *   - It therefore leaves `submitted_by_user_id` and `broker_firm_id` NULL.
 *     These deals appear in Luis's CRM immediately; they will appear on a
 *     broker's own dashboard only once that broker is linked to a firm.
 *
 * Idempotent: every row carries a dedup key built from its Drive folder id, and
 * a row whose key is already present is skipped. Re-running changes nothing.
 */

import { config as loadEnv } from "dotenv";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, sql as raw } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { PROGRAM_LABEL_TO_PRODUCT } from "../lib/broker/record";

const ROOT = process.cwd();
loadEnv({ path: join(ROOT, ".env.local") });
loadEnv({ path: join(ROOT, ".env") });

const DRY = process.argv.includes("--dry-run");
const PROD = process.argv.includes("--production");

const OUT_DIR = join(ROOT, ".fc-check");
const REPORT = join(OUT_DIR, "backfill-broker-sheet.md");

const lines: string[] = [];
const log = (s = "") => { lines.push(s); console.log(s); };
function finish(code: number): never {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT, lines.join("\n"), "utf8");
  console.log(`\n  Report written to .fc-check/backfill-broker-sheet.md`);
  process.exit(code);
}

/* ---- the rows, exactly as the Sheet holds them --------------------------- */
interface SheetRow {
  timestamp: string;       // as written in the Sheet, US format
  brokerEmail: string;
  borrower: string;
  program: string;         // the label, mapped through PROGRAM_LABEL_TO_PRODUCT
  property: string;
  loanAmount: number;
  driveFolder: string;
  notes: string;
}

const ROWS: SheetRow[] = [
  {
    timestamp: "7/20/2026 16:09:50", brokerEmail: "luis@fundedcapital.com",
    borrower: "Mario Nava", program: "Fix & Flip", property: "Concord 123 Ln",
    loanAmount: 750000, driveFolder: "https://drive.google.com/drive/folders/1zIVdF2DscKAL2sHxnjCW0kRMpNNMwZSS",
    notes: "",
  },
  {
    timestamp: "7/22/2026 12:38:06", brokerEmail: "processing@legacyhml.com",
    borrower: "Luisa Montoya", program: "DSCR / Rental", property: "123 Main St",
    loanAmount: 400000, driveFolder: "https://drive.google.com/drive/folders/1WDHFZ0Koy8fBu_Vdmh9XZTzxDQ2iBy8N",
    notes: "Rush for 7/30 closing",
  },
  {
    timestamp: "8/3/2026 10:43:10", brokerEmail: "jasson@legacyhml.com",
    borrower: "Elizabeth Morquecho", program: "DSCR / Rental",
    property: "2013 17th St, Galena Park, TX 77547",
    loanAmount: 165000, driveFolder: "https://drive.google.com/drive/folders/15SFV_c5_qXkgzNCOeWOlrQwo1SSq0dWA",
    notes: "",
  },
  {
    timestamp: "8/10/2026 9:45:32", brokerEmail: "hector@legacyhml.com",
    borrower: "Jose Nunez", program: "New Construction (Ground-Up)",
    property: "0 E Raleigh Ave, Liberty, NC 27298",
    loanAmount: 183320, driveFolder: "https://drive.google.com/drive/folders/1BrCUNpy-1aqldRwRmMBUz0Js0VzUgLNI",
    notes: "Rush Process - Closing Date of Contract is Aug 19th. LLC's name on purchase contract will change so I'll share the amendment asap and entity docs",
  },
  {
    timestamp: "8/18/2026 12:21:19", brokerEmail: "wilson@legacyhml.com",
    borrower: "Darwin Yanza", program: "Fix & Flip",
    property: "69 Main St, Sparrow Bush, NY 12780",
    loanAmount: 228500, driveFolder: "https://drive.google.com/drive/folders/1JSwTbfP_N3W-_NpjNAlzP1b71lmjGRyi",
    notes: "",
  },
  {
    timestamp: "8/28/2026 16:14:39", brokerEmail: "jasson@legacyhml.com",
    borrower: "Edar David Valle", program: "New Construction (Ground-Up)",
    property: "2505 Druid Hills Way, Charlotte, NC 28206",
    loanAmount: 455000, driveFolder: "https://drive.google.com/drive/folders/1odERlgVyYZfQ7Nctp_Wf44P7upqMQRHm",
    notes: "Borrower has prior Fix & Flip and New Construction experience under DID Drive Wealth Empire LLC:  Fix & Flip: 5211 Snow White Ln, Charlotte, NC 28213 1509 Keystone Dr, Salisbury, NC 28147 206 Legrand St, Cheraw, SC 29520  New Construction: 602 N Elm St, Cherryville, NC 28021",
  },
];

/** "7/20/2026 16:09:50" — US month/day, which Date() would read differently. */
function parseSheetDate(s: string): Date {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`unparseable timestamp: ${s}`);
  const [, mo, d, y, h, mi, sec] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec));
}

const folderId = (url: string) => url.split("/").pop() ?? url;
const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length <= 1
    ? { first: parts[0] ?? null, last: null }
    : { first: parts[0], last: parts.slice(1).join(" ") };
};

const endpoint = (u: string) => { try { return new URL(u).hostname.replace("-pooler", ""); } catch { return null; } };

async function main() {
  log("# Backfill — broker submissions from the Google Sheet");
  log();
  log(`- **When:** ${new Date().toISOString()}`);
  log(`- **Rows in the sheet with data:** ${ROWS.length}`);
  log(`- **Mode:** ${DRY ? "DRY RUN" : PROD ? "PRODUCTION" : "dev branch"}`);

  /* ---- pick the database, and refuse to guess ---------------------------- */
  const BACKUP = join(ROOT, ".env.local.before-dev-branch");
  const VERCEL = join(ROOT, ".env.vercel");
  const fromFile = (p: string, k: string) => {
    if (!existsSync(p)) return null;
    const l = readFileSync(p, "utf8").split(/\r?\n/).find((x) => x.trim().startsWith(k + "="));
    return l ? l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : null;
  };

  let url: string | null | undefined;
  if (PROD) {
    url = fromFile(VERCEL, "DATABASE_URL") ?? fromFile(BACKUP, "DATABASE_URL");
    if (!url) {
      log();
      log("**REFUSED** — no production credentials. Run this through the batch file,");
      log("which pulls current ones from Vercel.");
      finish(1);
    }
  } else {
    url = process.env.DATABASE_URL;
    const prod = fromFile(BACKUP, "DATABASE_URL");
    if (url && prod && endpoint(url) === endpoint(prod)) {
      log();
      log("**REFUSED** — .env.local points at the SAME endpoint as production, so");
      log("this would not be a dev-branch run. Pass --production if that is the");
      log("intent. Nothing was written.");
      finish(1);
    }
  }
  if (!url) { log(); log("**FAILED** — no DATABASE_URL."); finish(1); }
  log(`- **Host:** \`${new URL(url).hostname}\``);

  const db = drizzle(neon(url), { schema });

  if (!DRY) {
    try { await db.execute(raw.raw("SELECT 1")); }
    catch (err) {
      log(); log("**FAILED to reach the database** — nothing was written.");
      log(); log("```"); log(String((err as Error)?.message ?? err).slice(0, 300)); log("```");
      finish(1);
    }
  }

  /* ---- which rows are already in ----------------------------------------- */
  const keys = ROWS.map((r) => `broker-portal-sheet:${folderId(r.driveFolder)}`);
  const present = DRY ? [] : await db
    .select({ k: schema.activities.dedupKey })
    .from(schema.activities)
    .where(inArray(schema.activities.dedupKey, keys));
  const already = new Set(present.map((p) => p.k));

  const todo = ROWS.filter((r) => !already.has(`broker-portal-sheet:${folderId(r.driveFolder)}`));

  log();
  log("## Plan");
  log();
  log("| Date | Broker | Borrower | Program | Amount | |");
  log("|---|---|---|---|---:|---|");
  for (const r of ROWS) {
    const done = already.has(`broker-portal-sheet:${folderId(r.driveFolder)}`);
    const mapped = PROGRAM_LABEL_TO_PRODUCT[r.program];
    log(`| ${r.timestamp.split(" ")[0]} | ${r.brokerEmail} | ${r.borrower} | ${mapped ?? "**UNMAPPED**"} | ${r.loanAmount.toLocaleString()} | ${done ? "already in" : "will insert"} |`);
  }

  const unmapped = ROWS.filter((r) => !PROGRAM_LABEL_TO_PRODUCT[r.program]);
  if (unmapped.length) {
    log();
    log(`**REFUSED** — ${unmapped.length} row(s) have a program this CRM cannot store:`);
    unmapped.forEach((r) => log(`- ${r.borrower}: "${r.program}"`));
    finish(1);
  }

  if (todo.length === 0) {
    log();
    log("**Nothing to do — every row is already in the CRM.**");
    finish(0);
  }

  if (DRY) {
    log();
    log(`**DRY RUN** — ${todo.length} row(s) would be inserted. Nothing was written.`);
    finish(0);
  }

  /* ---- confirm ------------------------------------------------------------ */
  if (PROD) {
    console.log(`
  ============================================
   ABOUT TO WRITE ${todo.length} DEAL(S) TO PRODUCTION
  ============================================

   Type  BACKFILL  exactly, then Enter. Anything else cancels.
`);
    const rl = createInterface({ input: stdin });
    const answer = await new Promise<string>((resolve) => {
      const it = rl[Symbol.asyncIterator]();
      stdout.write("  > ");
      it.next().then(({ value, done }) => resolve(done ? "" : String(value).trim()));
    });
    rl.close();
    if (answer !== "BACKFILL") {
      log(); log("**CANCELLED** — nothing was written.");
      finish(1);
    }
  }

  /* ---- insert ------------------------------------------------------------- */
  log();
  log("## Inserted");
  let ok = 0, failed = 0;

  for (const r of todo) {
    try {
      const at = parseSheetDate(r.timestamp);
      const product = PROGRAM_LABEL_TO_PRODUCT[r.program];
      const brokerEmail = r.brokerEmail.trim().toLowerCase();
      const names = splitName(r.borrower);

      // Borrower and broker contacts, matched on email where we have one. The
      // Sheet never captured a borrower email, so a borrower is matched on name
      // only — and a new contact is created when there is no match, which is
      // the safe direction: a duplicate contact is fixable, a merged one is not.
      const existingBroker = await db.select({ id: schema.contacts.id })
        .from(schema.contacts).where(eq(schema.contacts.email, brokerEmail)).limit(1);

      const brokerContactId = existingBroker.length ? existingBroker[0].id : crypto.randomUUID();
      const contactId = crypto.randomUUID();
      const propertyId = crypto.randomUUID();
      const applicationId = crypto.randomUUID();

      type Stmt = Parameters<typeof db.batch>[0][number];
      const stmts: Stmt[] = [];

      if (!existingBroker.length) {
        const bn = splitName(brokerEmail.split("@")[0]);
        stmts.push(db.insert(schema.contacts).values({
          id: brokerContactId, firstName: bn.first, lastName: null, email: brokerEmail,
          leadSource: "broker", ownerName: "Luis Fajardo", tags: ["broker", "partner", "from-sheet"],
        }));
      }

      stmts.push(db.insert(schema.contacts).values({
        id: contactId, firstName: names.first, lastName: names.last,
        leadSource: "broker", ownerName: "Luis Fajardo", tags: ["broker", "broker-portal", "from-sheet"],
        // No SMS consent: a broker never gave it and could not give it for them.
      }));

      stmts.push(db.insert(schema.properties).values({
        id: propertyId, addressLine1: r.property,
      }));

      stmts.push(db.insert(schema.applications).values({
        id: applicationId, stage: "lead", product: product as never,
        leadSource: "broker", channel: "broker-portal", ownerName: "Luis Fajardo",
        propertyId,
        requestedAmount: String(r.loanAmount),
        notes: r.notes || null,
        // Left NULL on purpose — see the file docblock. We do not know these
        // brokers' Clerk ids, and inventing one would break the day they sign in.
        submittedByUserId: null,
        brokerFirmId: null,
        legacySource: "broker-portal-sheet",
        submittedAt: at, stageEnteredAt: at,
      }));

      stmts.push(db.insert(schema.stageTransitions).values({
        applicationId, fromStage: null, toStage: "lead",
        changedAt: at, changedBy: "backfill",
        reason: "submitted through the broker portal (backfilled from the Google Sheet)",
      }));

      stmts.push(db.insert(schema.participants)
        .values({ applicationId, contactId, role: "borrower" }).onConflictDoNothing());
      stmts.push(db.insert(schema.participants)
        .values({ applicationId, contactId: brokerContactId, role: "broker" }).onConflictDoNothing());

      stmts.push(db.insert(schema.activities).values({
        contactId, applicationId, kind: "form_submission", occurredAt: at,
        source: "broker-portal", subject: `${r.borrower} - ${r.property}`,
        body: r.notes || null,
        metadata: {
          brokerEmail, driveFolder: r.driveFolder, programLabel: r.program,
          backfilledFrom: "Broker Portal Submissions (Google Sheet)",
          backfilledAt: new Date().toISOString(),
        },
        dedupKey: `broker-portal-sheet:${folderId(r.driveFolder)}`,
      }).onConflictDoNothing());

      await db.batch(stmts as [Stmt, ...Stmt[]]);
      ok++;
      log(`- ${r.borrower} — ${product}, ${r.loanAmount.toLocaleString()} (${brokerEmail})`);
    } catch (err) {
      failed++;
      log(`- **FAILED** ${r.borrower}: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    }
  }

  log();
  log(`**${ok} inserted · ${failed} failed**`);
  log();
  log("These appear in /crm now. They will NOT appear on a broker's own dashboard");
  log("until that broker is linked to a firm — the deals carry no Clerk user id,");
  log("only the broker's email on the `broker` participant.");

  finish(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  log();
  log("**THE BACKFILL CRASHED**");
  log();
  log("```");
  log(String(err instanceof Error ? err.stack ?? err.message : err).slice(0, 1200));
  log("```");
  finish(1);
});
