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
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
loadEnv({ path: join(ROOT, ".env.local") });
loadEnv({ path: join(ROOT, ".env") });

const DRY = process.argv.includes("--dry-run");
const fileArg = process.argv.find((a) => a.endsWith(".sql"));
const MIGRATION = fileArg ?? join("drizzle", "0001_broker_firms.sql");

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

if (!existsSync(MIGRATION)) {
  log(`# Migration — FAILED\n\nFile not found: \`${MIGRATION}\``);
  finish(1);
}

/**
 * drizzle-kit separates statements with its own marker rather than plain
 * semicolons, which matters because a function body or a quoted default can
 * contain a semicolon that is not a statement boundary.
 */
const statements = readFileSync(MIGRATION, "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim().replace(/;$/, "").trim())
  .filter(Boolean);

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
export function sqlState(err) {
  return err?.code ?? err?.cause?.code ?? err?.sourceError?.code ?? null;
}
function isAlreadyThere(err) {
  return ALREADY.has(sqlState(err));
}

log(`# Migration — \`${MIGRATION}\``);
log();
log(`- **When:** ${new Date().toISOString()}`);
log(`- **Statements:** ${statements.length}`);
log(`- **Mode:** ${DRY ? "DRY RUN — nothing was executed" : "applied"}`);

const url = process.env.DATABASE_URL_UNPOOLED;
if (!DRY && !url) {
  log();
  log("**FAILED** — `DATABASE_URL_UNPOOLED` is not set in .env.local.");
  finish(1);
}
if (url) {
  try { log(`- **Host:** \`${new URL(url).hostname}\``); } catch { /* ignore */ }
}

/** Built here, BEFORE the self-check below uses it — `const` is not hoisted. */
const db = DRY ? null : drizzle(neon(url));

/**
 * Prove the execution path works before using it on schema.
 *
 * The first attempt at this migration died on statement 1 with "sql.query is
 * not a function" — a wrong API, not a database problem. A no-op through the
 * identical code path turns that class of mistake into a clean stop with a
 * clear message, instead of a half-understood failure partway through a
 * migration.
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
    // A TypeError or a ReferenceError here is always a fault in THIS FILE —
    // a wrong driver method, or something used before it was declared. Saying
    // "connection problem" for those sends the reader hunting the database for
    // a bug that is in the script, which is exactly what happened on attempt 2.
    const scriptBug = err instanceof TypeError || err instanceof ReferenceError;
    log(scriptBug
      ? `This is a ${err.constructor.name}, which means the fault is in this script, not in your database or your connection. Nothing about the database needs changing.`
      : "This looks like a connection or permission problem rather than a script bug.");
    finish(1);
  }
}

log();
log("| # | Statement | Result |");
log("|---:|---|---|");

let applied = 0, skipped = 0, failed = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const name = label(stmt);

  if (DRY) {
    log(`| ${i + 1} | ${name} | would run |`);
    continue;
  }

  try {
    await db.execute(raw.raw(stmt));
    applied++;
    log(`| ${i + 1} | ${name} | applied |`);
  } catch (err) {
    if (isAlreadyThere(err)) {
      skipped++;
      log(`| ${i + 1} | ${name} | already there |`);
    } else {
      failed++;
      log(`| ${i + 1} | ${name} | **FAILED** — ${String(err?.message ?? err).slice(0, 160)} |`);
      // Stop at the first real failure. Continuing past a broken CREATE TABLE
      // just produces a cascade of misleading errors from its indexes.
      break;
    }
  }
}

log();
log(`**${applied} applied · ${skipped} already there · ${failed} failed**`);

if (failed > 0) {
  log();
  log("Stopped at the first failure. Nothing after it was attempted.");
}

finish(failed > 0 ? 1 : 0);
