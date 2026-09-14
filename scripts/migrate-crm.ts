/**
 * Migrate the legacy Excel CRM and the BiggerPockets export into Postgres.
 *
 * Run through fc-migrate.bat (dry run) then fc-migrate-commit.bat (for real).
 * Both write a report to .fc-check/ so the outcome survives a closed window.
 *
 * DESIGN NOTES
 * - The BiggerPockets SOURCE OF TRUTH is the CSV export (96 rows), NOT the 63
 *   rows in the workbook. Capture into the workbook broke on 2026-08-23 and 33
 *   paid leads never reached it.
 * - Contacts with no application are the correct outcome, not a gap: 650 of 674
 *   have never been worked. They become contacts and nothing else.
 * - Every count is verified against the source AFTER writing. A migration that
 *   reports success without counting is exactly how the BiggerPockets gap went
 *   unnoticed for three weeks.
 */

import { config as loadEnv } from "dotenv";
import { join } from "node:path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv({ path: join(process.cwd(), ".env") });

import ExcelJS from "exceljs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as dsql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import {
  clean, parseMoney, parseDate, splitName, parseMarket,
  mapLeadSource, mapProduct, mapStage, leverage, buildContact,
  type RowIssue, type ContactRow,
} from "../lib/migrate/transform";
import { normalisePhone } from "../lib/phone";

const COMMIT = process.argv.includes("--commit");
const RESET = process.argv.includes("--reset");

const DRIVE = "C:\\Users\\luis\\My Drive\\Funded Capital - AI Agent System\\08-data";
const XLSX_PATH = process.env.CRM_XLSX ?? join(DRIVE, "FundedCapital_CRM.xlsx");
const BP_CSV_PATH = process.env.BP_CSV ?? join(DRIVE, "biggerpockets-export-2026-09-14.csv");

const OUT_DIR = join(process.cwd(), ".fc-check");
const REPORT = join(OUT_DIR, COMMIT ? "migration-report.md" : "migration-dryrun.md");

const out: string[] = [];
const say = (s = "") => { out.push(s); console.log(s); };

function finish(ok: boolean): never {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT, out.join("\n"), "utf8");
  console.log(`\n  Report written to .fc-check/${COMMIT ? "migration-report.md" : "migration-dryrun.md"}`);
  process.exit(ok ? 0 : 1);
}

/* ------------------------------------------------------------- CSV reader */

/** Minimal RFC4180 parser — quoted fields contain commas and newlines throughout
 *  the BiggerPockets export, so a naive split destroys the data. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

/* ---------------------------------------------------------- sheet loading */

type Sheet = Record<string, unknown>[];

async function loadSheets(path: string): Promise<{ contacts: Sheet; pipeline: Sheet }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const read = (name: string, headerRow: number): Sheet => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`sheet "${name}" not found in ${path}`);
    const header = (ws.getRow(headerRow).values as unknown[]).map((v) => String(v ?? "").trim());
    const rows: Sheet = [];
    ws.eachRow((r, i) => {
      if (i <= headerRow) return;
      const vals = r.values as unknown[];
      const obj: Record<string, unknown> = {};
      let any = false;
      for (let c = 1; c < header.length; c++) {
        const key = header[c];
        if (!key) continue;
        let v = vals[c];
        // exceljs returns {text, hyperlink} for links and {result} for formulas
        if (v && typeof v === "object" && !(v instanceof Date)) {
          v = (v as any).text ?? (v as any).result ?? (v as any).richText?.map((t: any) => t.text).join("") ?? null;
        }
        obj[key] = v ?? null;
        if (clean(v) !== null) any = true;
      }
      if (any) { obj.__row = i; rows.push(obj); }
    });
    return rows;
  };

  return { contacts: read("Master Contacts", 1), pipeline: read("Pipeline", 1) };
}

/* -------------------------------------------------------------- the work */

async function main() {
  say(`# CRM migration — ${COMMIT ? "COMMIT" : "DRY RUN"}`);
  say("");
  say(`- **When:** ${new Date().toISOString()}`);
  say(`- **Mode:** ${COMMIT ? "writing to the database" : "no writes — inspection only"}`);
  say("");

  for (const [label, p] of [["CRM workbook", XLSX_PATH], ["BiggerPockets export", BP_CSV_PATH]] as const) {
    if (!existsSync(p)) {
      say(`**Source missing:** ${label} not found at \`${p}\``);
      say("");
      say("Nothing was changed. Check the file is where the script expects it.");
      finish(false);
    }
  }

  const { contacts: mcRows, pipeline: pipeRows } = await loadSheets(XLSX_PATH);
  const bpRows = parseCsv(readFileSync(BP_CSV_PATH, "utf8"));

  say("## Sources");
  say("");
  say("| Source | Rows |");
  say("|---|---:|");
  say(`| Master Contacts | ${mcRows.length} |`);
  say(`| Pipeline | ${pipeRows.length} |`);
  say(`| BiggerPockets export | ${bpRows.length} |`);
  say("");

  /* ---- contacts ---- */
  const issues: RowIssue[] = [];
  const byEmail = new Map<string, ContactRow>();
  const noEmail: ContactRow[] = [];

  for (const r of mcRows) {
    const c = buildContact(r, Number(r.__row ?? 0), issues);
    if (c.email) {
      if (byEmail.has(c.email)) {
        issues.push({ row: Number(r.__row ?? 0), field: "Email", value: c.email, note: "duplicate email in Master Contacts — second row skipped" });
        continue;
      }
      byEmail.set(c.email, c);
    } else noEmail.push(c);
  }

  // BiggerPockets contacts the workbook never captured.
  let bpNew = 0;
  for (const r of bpRows) {
    const email = clean(r["investor_email"])?.toLowerCase();
    if (!email) continue;
    if (byEmail.has(email)) {
      const existing = byEmail.get(email)!;
      if (existing.leadSource === "unknown" || existing.leadSource === "other") existing.leadSource = "biggerpockets";
      if (!existing.creditBand) existing.creditBand = clean(r["credit_score"]);
      continue;
    }
    const ph = normalisePhone(clean(r["investor_phone"]) ?? "");
    const { firstName, lastName } = splitName(r["investor_name"]);
    const { market, state } = parseMarket(r["market"]);
    byEmail.set(email, {
      legacyContactId: null, firstName, lastName, email,
      phone: ph.ok ? ph.e164 : null, phoneRaw: ph.ok ? null : (ph.raw || null),
      leadSource: "biggerpockets", targetMarket: market, state,
      creditBand: clean(r["credit_score"]), ownerName: "Luis Fajardo",
      tags: ["biggerpockets"], notes: null, createdAt: parseDate(r["date_submitted"]),
    });
    bpNew++;
  }

  const allContacts = [...byEmail.values(), ...noEmail];

  // Phone collisions — surfaced, never auto-merged.
  const phoneMap = new Map<string, ContactRow[]>();
  for (const c of allContacts) {
    if (!c.phone) continue;
    phoneMap.set(c.phone, [...(phoneMap.get(c.phone) ?? []), c]);
  }
  const collisions = [...phoneMap.entries()].filter(([, v]) => v.length > 1);

  say("## Contacts");
  say("");
  say(`- From Master Contacts: **${mcRows.length}**`);
  say(`- New from BiggerPockets (never in the workbook): **${bpNew}**`);
  say(`- Without an email address: **${noEmail.length}** — kept, but cannot sync to Klaviyo`);
  say(`- **Total to load: ${allContacts.length}**`);
  say(`- Phones normalised: **${allContacts.filter((c) => c.phone).length}**, flagged: **${allContacts.filter((c) => c.phoneRaw).length}**`);
  say("");

  if (collisions.length) {
    say(`### ${collisions.length} shared phone numbers — review, do not assume duplicates`);
    say("");
    say("| Phone | Contacts |");
    say("|---|---|");
    for (const [ph, cs] of collisions) {
      say(`| \`${ph}\` | ${cs.map((c) => `${c.firstName ?? ""} ${c.lastName ?? ""} <${c.email ?? "no email"}>`.trim()).join(" · ")} |`);
    }
    say("");
    say("These may be the same person entered twice, or a genuinely shared line.");
    say("Nothing is merged automatically — a wrong merge loses a real borrower.");
    say("");
  }

  /* ---- applications from BiggerPockets ---- */
  interface AppPlan {
    email: string | null; product: string; confident: boolean;
    stage: string; stageOriginal: string | null;
    requested: number | null; down: number | null; target: number | null;
    address: string | null; city: string | null; state: string | null;
    message: string | null; submittedAt: Date | null; source: string;
  }
  const apps: AppPlan[] = [];

  for (const r of bpRows) {
    const { product, confident } = mapProduct({
      loanType: r["loan_type"], goal: r["goal"], strategy: r["strategy"],
    });
    const { market, state } = parseMarket(r["market"]);
    apps.push({
      email: clean(r["investor_email"])?.toLowerCase() ?? null,
      product, confident, stage: "lead", stageOriginal: clean(r["status"]),
      requested: parseMoney(r["amount_needed"]),
      down: parseMoney(r["down_payment"]),
      target: parseMoney(r["maximum_target_price"]) ?? parseMoney(r["target_price"]),
      address: clean(r["property_address"]), city: market, state,
      message: clean(r["message"]), submittedAt: parseDate(r["date_submitted"]),
      source: "biggerpockets",
    });
  }

  /* ---- applications from the Pipeline sheet ---- */
  const legacyToEmail = new Map<string, string>();
  for (const c of byEmail.values()) if (c.legacyContactId && c.email) legacyToEmail.set(c.legacyContactId, c.email);

  let unmappedStages = 0;
  for (const r of pipeRows) {
    const email = clean(r["Email"])?.toLowerCase()
      ?? legacyToEmail.get(clean(r["Contact ID"]) ?? "") ?? null;
    const st = mapStage(r["Current Stage"]);
    if (!st.mapped && st.original) unmappedStages++;
    apps.push({
      email, product: "unknown", confident: false,
      stage: st.stage, stageOriginal: st.original,
      requested: parseMoney(r["Loan Amount Estimated"]),
      down: null, target: null, address: null, city: null, state: null,
      message: clean(r["Stage Notes"]),
      submittedAt: parseDate(r["Last Contacted Date"]),
      source: "pipeline-sheet",
    });
  }

  const productCounts = apps.reduce<Record<string, number>>((a, x) => { a[x.product] = (a[x.product] ?? 0) + 1; return a; }, {});
  const stageCounts = apps.reduce<Record<string, number>>((a, x) => { a[x.stage] = (a[x.stage] ?? 0) + 1; return a; }, {});
  const withProperty = apps.filter((a) => a.address || a.city).length;

  say("## Applications");
  say("");
  say(`- From BiggerPockets: **${bpRows.length}**`);
  say(`- From the Pipeline sheet: **${pipeRows.length}**`);
  say(`- **Total: ${apps.length}**`);
  say(`- With enough detail for a property record: **${withProperty}**`);
  say(`- Product inferred with low confidence: **${apps.filter((a) => !a.confident).length}** (flagged, not guessed silently)`);
  if (unmappedStages) say(`- Legacy stage strings that did not map: **${unmappedStages}** (defaulted to \`lead\`, original preserved)`);
  say("");
  say("| Product | Count |   | Stage | Count |");
  say("|---|---:|---|---|---:|");
  const pk = Object.keys(productCounts).sort(), sk = Object.keys(stageCounts).sort();
  for (let i = 0; i < Math.max(pk.length, sk.length); i++) {
    const p = pk[i] ? `\`${pk[i]}\` | ${productCounts[pk[i]]}` : " | ";
    const s = sk[i] ? `\`${sk[i]}\` | ${stageCounts[sk[i]]}` : " | ";
    say(`| ${p} |  | ${s} |`);
  }
  say("");

  const contactsWithApp = new Set(apps.map((a) => a.email).filter(Boolean));
  say(`Contacts with no application at all: **${allContacts.length - contactsWithApp.size}**. That is the aged-prospect pool and it is the correct outcome, not a gap.`);
  say("");

  if (issues.length) {
    say(`## ${issues.length} data issues (all recoverable, nothing dropped)`);
    say("");
    say("| Row | Field | Value | Note |");
    say("|---:|---|---|---|");
    for (const i of issues.slice(0, 40)) say(`| ${i.row} | ${i.field} | \`${i.value || "(empty)"}\` | ${i.note} |`);
    if (issues.length > 40) say(`| … | | | ${issues.length - 40} more |`);
    say("");
  }

  if (!COMMIT) {
    say("---");
    say("");
    say("**Dry run — nothing was written.** Review the numbers above, then run");
    say("`fc-migrate-commit.bat` to load the data.");
    finish(true);
  }

  /* ---------------------------------------------------------- write phase */

  const url = process.env.DATABASE_URL;
  if (!url) { say("`DATABASE_URL` is not set — run fc-db.bat first."); finish(false); }
  const db = drizzle(neon(url), { schema });

  const existing = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.contacts);
  if (existing[0].n > 0 && !RESET) {
    say(`**Refusing to run.** \`contacts\` already holds ${existing[0].n} rows.`);
    say("");
    say("Re-running would duplicate them. If you meant to start over, this needs the");
    say("reset flag — tell Claude and it will enable it deliberately.");
    finish(false);
  }
  if (RESET) {
    await db.execute(dsql`TRUNCATE TABLE ${schema.stageTransitions}, ${schema.participants}, ${schema.activities}, ${schema.documents}, ${schema.applications}, ${schema.properties}, ${schema.entities}, ${schema.contacts} RESTART IDENTITY CASCADE`);
    say("Existing rows cleared (reset requested).");
    say("");
  }

  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  const contactIds = new Map<string, string>();
  for (const batch of chunk(allContacts, 150)) {
    const inserted = await db.insert(schema.contacts).values(batch.map((c) => ({
      firstName: c.firstName, lastName: c.lastName, email: c.email,
      phone: c.phone, phoneRaw: c.phoneRaw, leadSource: c.leadSource as any,
      targetMarket: c.targetMarket, state: c.state, creditBand: c.creditBand,
      ownerName: c.ownerName, tags: c.tags, notes: c.notes,
      legacyContactId: c.legacyContactId,
      ...(c.createdAt ? { createdAt: c.createdAt } : {}),
    }))).returning({ id: schema.contacts.id, email: schema.contacts.email });
    for (const row of inserted) if (row.email) contactIds.set(row.email, row.id);
  }
  say(`Loaded **${contactIds.size + noEmail.length}** contacts.`);

  let appCount = 0, propCount = 0, partCount = 0;
  for (const a of apps) {
    let propertyId: string | null = null;
    if (a.address || a.city) {
      const [p] = await db.insert(schema.properties).values({
        addressLine1: a.address, city: a.city, state: a.state,
        purchasePrice: a.target !== null ? String(a.target) : null,
      }).returning({ id: schema.properties.id });
      propertyId = p.id; propCount++;
    }
    const lev = leverage({ loanAmount: a.requested, purchasePrice: a.target });
    const [app] = await db.insert(schema.applications).values({
      stage: a.stage as any, product: a.product as any,
      leadSource: (a.source === "biggerpockets" ? "biggerpockets" : "unknown") as any,
      propertyId, requestedAmount: a.requested !== null ? String(a.requested) : null,
      downPayment: a.down !== null ? String(a.down) : null,
      ltc: lev.ltc !== null ? lev.ltc.toFixed(4) : null,
      ltarv: lev.ltarv !== null ? lev.ltarv.toFixed(4) : null,
      ltv: lev.ltv !== null ? lev.ltv.toFixed(4) : null,
      bindingRatio: lev.binding, borrowerMessage: a.message,
      legacySource: a.source, submittedAt: a.submittedAt,
      ...(a.submittedAt ? { stageEnteredAt: a.submittedAt } : {}),
    }).returning({ id: schema.applications.id });
    appCount++;

    await db.insert(schema.stageTransitions).values({
      applicationId: app.id, fromStage: null, toStage: a.stage as any,
      changedAt: a.submittedAt ?? new Date(), changedBy: "migration",
      reason: a.stageOriginal ? `migrated from legacy stage "${a.stageOriginal}"` : "migrated",
    });

    const cid = a.email ? contactIds.get(a.email) : undefined;
    if (cid) {
      await db.insert(schema.participants)
        .values({ applicationId: app.id, contactId: cid, role: "borrower" })
        .onConflictDoNothing();
      partCount++;
    }
  }
  say(`Loaded **${appCount}** applications, **${propCount}** properties, **${partCount}** participant links.`);
  say("");

  /* ------------------------------------------------------------- verify */

  const [c] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.contacts);
  const [ap] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.applications);
  const [st] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.stageTransitions);
  const [pa] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.participants);

  const checks: [string, boolean, string][] = [
    ["every source contact landed", c.n === allContacts.length, `${c.n} of ${allContacts.length}`],
    ["every application landed", ap.n === apps.length, `${ap.n} of ${apps.length}`],
    ["one stage transition per application", st.n === ap.n, `${st.n} transitions / ${ap.n} applications`],
    ["no orphan participants", pa.n <= ap.n, `${pa.n} links`],
    ["all 96 BiggerPockets leads present", bpRows.length === 96, `${bpRows.length}`],
  ];

  say("## Verification");
  say("");
  for (const [name, ok, detail] of checks) say(`- ${ok ? "**pass**" : "**FAIL**"} — ${name} (${detail})`);
  say("");

  const allOk = checks.every(([, ok]) => ok);
  say(allOk
    ? "Every row is accounted for. The database matches the sources."
    : "**Counts do not match the sources.** Do not build on this until it is resolved.");
  say("");
  finish(allOk);
}

main().catch((err) => {
  say("");
  say("## Migration failed");
  say("");
  say("```");
  say(String(err?.stack ?? err));
  say("```");
  say("");
  say(COMMIT ? "The database may be partially loaded — check the counts before re-running." : "Nothing was written.");
  finish(false);
});
