#!/usr/bin/env node
/**
 * Apply one generated migration file, statement by statement, and write a
 * report Claude can read afterwards.
 *
 * WHY NOT `drizzle-kit push`:
 * push compares schema.ts against the live database and decides for itself what
 * to change. On a purely additive change it does the right thing — but it is
 * deciding, and what it decides depends on drift it finds. The SQL in
 * drizzle/0001_broker_firms.sql was generated once, read line by line, and
 * contains nothing but CREATE TABLE, ADD COLUMN and CREATE INDEX. Running
 * exactly that is predictable in a way push is not, and predictability is the
 * whole point when the database holds 711 real borrower records.
 *
 * Re-running is safe: anything already present is reported as "already there"
 * rather than failing the run.
 *
 * Uses DATABASE_URL_UNPOOLED. Schema changes need a direct session; the pooler
 * produces confusing partial failures (see drizzle.config.ts).
 *
 * EXECUTION PATH: drizzle's db.execute(sql.raw(...)) over the neon-http driver.
 * NOT `neon(url).query(text)` — that method does not exist in the installed
 * @neondatabase/serverless 0.10.4, where neon() returns a tagged-template
 * function and nothing else. Calling it fails with "sql.query is not a
 * function" at the first statement, which is exactly what happened on the first
 * attempt at this migration.
 */

import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as raw } from "drizzle-orm";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
loadEnv({ path: join(ROOT, ".env.local") });
loadEnv({ path: join(ROOT, ".env") });

const DRY = process.argv.includes("--dry-run");
const fileArg = process.argv.find((a) => a.endsWith(".sql"));

/**
 * EVERY migration, in order — not a hardcoded one.
 *
 * This script used to default to `drizzle/0001_broker_firms.sql`. Once 0002
 * existed, every run re-applied 0001, found all fourteen statements already
 * present, reported "14 already there · 0 failed" and exited 0. The batch file
 * printed DONE. The database was three migrations behind and nothing said so.
 *
 * That is the worst shape a failure can take: silent, and dressed as success.
 * Applying the whole directory in filename order makes the runner idempotent
 * and complete — statements already present are skipped, new ones are applied,
 * and "up to date" is something the run PROVES rather than assumes.
 */
const MIGRATIONS = fileArg
  ? [fileArg]
  : readdirSync(join(ROOT, "drizzle"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join("drizzle", f));

const OUT_DIR = join(ROOT, ".fc-check");
const REPORT = join(OUT_DIR, "migrate-dev.md");

const lines = [];
const log = (s = "") => { lines.push(s); console.log(s); };

function finish(code) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT, lines.join("\n"), "utf8");
  console.log(`\n  Report written to .fc-check/migrate-dev.md`);
  process.exit(code);
}

/** First few words — enough to identify a statement without dumping the SQL. */
function label(sql) {
  const flat = sql.replace(/\s+/g, " ").trim();
  // Names arrive either bare or schema-qualified ("public"."broker_role"), so
  // take the LAST quoted segment — otherwise every enum reads as "public".
  const m = flat.match(/^(CREATE (?:UNIQUE )?INDEX|CREATE TABLE|CREATE TYPE|ALTER TABLE)\s+((?:"[\w]+"\.)*"?[\w]+"?)/i);
  if (m) m[2] = m[2].split(".").pop().replace(/"/g, "");
  if (!m) return flat.slice(0, 60);
  const rest = flat.match(/ADD COLUMN "?(\w+)"?|ADD CONSTRAINT "?(\w+)"?/i);
  return rest ? `${m[1]} ${m[2]} → ${rest[1] ?? rest[2]}` : `${m[1]} ${m[2]}`;
}

/** Postgres codes for "this object is already there". */
const ALREADY = new Set([
  "42P07", // duplicate_table (also index)
  "42710", // duplicate_object (type, constraint)
  "42701", // duplicate_column
]);

/**
 * Pull the SQLSTATE out of whatever the driver throws.
 *
 * The code can sit at any of three depths depending on whether drizzle wrapped
 * the driver's error, so check all of them. Getting this wrong turns a harmless
 * re-run into a reported failure — or worse, hides a real one.
 */
function sqlState(err) {
  return err?.code ?? err?.cause?.code ?? err?.sourceError?.code ?? null;
}
function isAlreadyThere(err) {
  return ALREADY.has(sqlState(err));
}

const url = process.env.DATABASE_URL_UNPOOLED;
if (!DRY && !url) {
  log("# Migration — FAILED");
  log();
  log("`DATABASE_URL_UNPOOLED` is not set in .env.local.");
  finish(1);
}

log("# Migration");
log();
log(`- **When:** ${new Date().toISOString()}`);
log(`- **Files:** ${MIGRATIONS.length}`);
log(`- **Mode:** ${DRY ? "DRY RUN — nothing was executed" : "applied"}`);
if (url) {
  try { log(`- **Host:** \`${new URL(url).hostname}\``); } catch { /* ignore */ }
}

const db = DRY ? null : drizzle(neon(url));

/**
 * Prove the execution path works before using it on schema. The first attempt
 * at migration 0001 died on statement 1 with "sql.query is not a function" — a
 * wrong API, not a database problem. A no-op through the identical code path
 * turns that class of mistake into a clean stop with a clear message.
 */
if (!DRY) {
  try {
    await db.execute(raw.raw("SELECT 1"));
    log();
    log("Connection and execution path verified (`SELECT 1`).");
  } catch (err) {
    log();
    log("**FAILED before any schema change** — could not execute a trivial");
    log("statement, so nothing was attempted.");
    log();
    log("```");
    log(String(err?.message ?? err).slice(0, 300));
    log("```");
    log();
    // A TypeError or a ReferenceError here is always a fault in THIS FILE.
    const scriptBug = err instanceof TypeError || err instanceof ReferenceError;
    log(scriptBug
      ? `This is a ${err.constructor.name}, which means the fault is in this script, not in your database or your connection.`
      : "This looks like a connection or permission problem rather than a script bug.");
    finish(1);
  }
}

let totalApplied = 0, totalSkipped = 0, totalFailed = 0;

for (const migration of MIGRATIONS) {
  if (!existsSync(migration)) {
    log();
    log(`## \`${migration}\` — NOT FOUND`);
    totalFailed++;
    break;
  }

  /**
   * drizzle-kit separates statements with its own marker rather than plain
   * semicolons, which matters because a quoted default can contain a semicolon
   * that is not a statement boundary.
   */
  const statements = readFileSync(migration, "utf8")
    .split("--> statement-breakpoint")
    .map((x) => x.trim().replace(/;$/, "").trim())
    .filter(Boolean);

  let applied = 0, skipped = 0, failed = 0;
  const rows = [];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const name = label(stmt);

    if (DRY) { rows.push(`| ${i + 1} | ${name} | would run |`); continue; }

    try {
      await db.execute(raw.raw(stmt));
      applied++;
      rows.push(`| ${i + 1} | ${name} | applied |`);
    } catch (err) {
      if (isAlreadyThere(err)) {
        skipped++;
        rows.push(`| ${i + 1} | ${name} | already there |`);
      } else {
        failed++;
        rows.push(`| ${i + 1} | ${name} | **FAILED** — ${String(err?.message ?? err).slice(0, 160)} |`);
        // Stop at the first real failure. Continuing past a broken CREATE TABLE
        // just produces a cascade of misleading errors from its indexes.
        break;
      }
    }
  }

  totalApplied += applied; totalSkipped += skipped; totalFailed += failed;

  const headline = DRY ? `${statements.length} statements`
    : applied > 0 ? `**${applied} applied**, ${skipped} already there`
    : failed > 0 ? `**${failed} FAILED**`
    : "already up to date";

  log();
  log(`## \`${migration}\` — ${headline}`);

  // Only spell out the statements when something actually happened. A run that
  // is already up to date should read as one line, not forty.
  if (DRY || applied > 0 || failed > 0) {
    log();
    log("| # | Statement | Result |");
    log("|---:|---|---|");
    rows.forEach((r) => log(r));
  }

  if (failed > 0) break;
}

log();
log(`**${totalApplied} applied · ${totalSkipped} already there · ${totalFailed} failed**`);

if (totalFailed > 0) {
  log();
  log("Stopped at the first failure. Nothing after it was attempted.");
} else if (totalApplied === 0 && !DRY) {
  log();
  log("Every migration in `drizzle/` was already present — the database is up to date.");
}

finish(totalFailed > 0 ? 1 : 0);
