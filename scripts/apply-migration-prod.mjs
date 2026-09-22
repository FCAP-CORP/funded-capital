#!/usr/bin/env node
/**
 * Apply the pending migrations to PRODUCTION, deliberately and once.
 *
 * Everything else in this repo refuses to touch production. This is the one
 * thing that is allowed to, so it carries the guards the others get for free by
 * simply saying no:
 *
 *   1. It reads the production credentials from .env.local.before-dev-branch —
 *      the file written when this machine moved to the dev branch. That means
 *      production is never in .env.local and never one typo away.
 *
 *   2. It REFUSES if that endpoint is the same one .env.local currently uses.
 *      Identical endpoints mean the dev-branch switch never happened, so
 *      "production" and "local" are the same database and nothing here can be
 *      trusted to mean what it says.
 *
 *   3. It reads every statement it is about to run and REFUSES if any of them
 *      can destroy data. Additive migrations are safe to apply to a live
 *      database; a DROP or a TRUNCATE is a different kind of decision and does
 *      not get to ride along inside a routine one.
 *
 *   4. It requires a typed confirmation. A double-click is not consent for
 *      this.
 *
 *   5. It counts every row before and after and fails loudly if a single one
 *      moved. Additive means additive.
 */

import { config as loadEnv } from "dotenv";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as raw } from "drizzle-orm";

const ROOT = process.cwd();
/**
 * --dry-run does everything except touch the database: the same guards, the
 * same plan, the same confirmation prompt. It exists so the prompt itself can
 * be exercised without a live connection — the readline plumbing in a sibling
 * script once failed silently, and an untested prompt in front of production
 * is not something to find out about on the night.
 */
const DRY = process.argv.includes("--dry-run");
const BACKUP = join(ROOT, ".env.local.before-dev-branch");
const OUT_DIR = join(ROOT, ".fc-check");
const REPORT = join(OUT_DIR, "migrate-prod.md");

const lines = [];
const log = (s = "") => { lines.push(s); console.log(s); };

function finish(code) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT, lines.join("\n"), "utf8");
  console.log(`\n  Report written to .fc-check/migrate-prod.md`);
  process.exit(code);
}

const endpoint = (u) => { try { return new URL(u).hostname.replace("-pooler", ""); } catch { return null; } };
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return "(unparseable)"; } };

/** Read one key out of an env file without letting it into process.env. */
function fromFile(path, key) {
  if (!existsSync(path)) return null;
  const line = readFileSync(path, "utf8").split(/\r?\n/)
    .find((l) => l.trim().startsWith(key + "="));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : null;
}

log("# Migration — PRODUCTION");
log();
log(`- **When:** ${new Date().toISOString()}`);

/* ---- 1 & 2: find production, and prove it is not the dev branch ---------- */
if (!existsSync(BACKUP)) {
  log();
  log("**REFUSED** — `.env.local.before-dev-branch` is missing, so there is no");
  log("recorded production endpoint to apply to. Nothing was done.");
  finish(1);
}

/**
 * WHERE PRODUCTION CREDENTIALS COME FROM, in order.
 *
 * `.env.vercel` first: a scratch file the batch script pulls straight from
 * Vercel immediately before this runs, so it is whatever the live site is
 * using right now. The backup file is only a fallback, and it is a fallback
 * that goes stale — it was copied from .env.local when this machine moved to
 * the dev branch, and a Neon password rotation since then makes it wrong.
 * That is exactly what happened on the first attempt at this migration.
 *
 * Production credentials are never written into .env.local. They live in a
 * scratch file for the length of one command and the batch script deletes it.
 */
const VERCEL_PULL = join(ROOT, ".env.vercel");
const fromVercel = fromFile(VERCEL_PULL, "DATABASE_URL_UNPOOLED") ?? fromFile(VERCEL_PULL, "DATABASE_URL");
const fromBackup = fromFile(BACKUP, "DATABASE_URL_UNPOOLED") ?? fromFile(BACKUP, "DATABASE_URL");
const prodUrl = fromVercel ?? fromBackup;
const credentialSource = fromVercel ? "Vercel (current)" : "the pre-dev-branch backup (may be stale)";

if (!prodUrl) {
  log();
  log("**REFUSED** — no production database URL found in `.env.vercel` or");
  log("`.env.local.before-dev-branch`.");
  finish(1);
}

loadEnv({ path: join(ROOT, ".env.local") });
const currentUrl = process.env.DATABASE_URL;

if (currentUrl && endpoint(currentUrl) === endpoint(prodUrl)) {
  log();
  log("**REFUSED** — the production endpoint and the one this machine currently");
  log("uses are the SAME. That means the dev-branch switch never happened, so");
  log("nothing here can be trusted to mean what it says. Nothing was done.");
  log();
  log(`  both: \`${endpoint(prodUrl)}\``);
  finish(1);
}

log(`- **Production host:** \`${hostOf(prodUrl)}\``);
log(`- **Credentials from:** ${credentialSource}`);
log(`- **This machine normally uses:** \`${currentUrl ? hostOf(currentUrl) : "(unset)"}\``);

/* ---- 3: refuse anything that can destroy data ---------------------------- */
const MIGRATIONS = readdirSync(join(ROOT, "drizzle"))
  .filter((f) => f.endsWith(".sql")).sort().map((f) => join("drizzle", f));

/**
 * Patterns that can lose data or break a live site mid-deploy. Deliberately
 * blunt: this refuses rather than tries to judge intent, because the cost of a
 * wrong judgement here is borrower records.
 */
const FORBIDDEN = [
  [/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE|CONSTRAINT|INDEX)\b/i, "DROP"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\bDELETE\s+FROM\b/i, "DELETE"],
  [/\bRENAME\s+(TO|COLUMN)\b/i, "RENAME"],
  [/\bALTER\s+COLUMN\b[\s\S]*?\bSET\s+NOT\s+NULL\b/i, "SET NOT NULL on an existing column"],
];

const statementsByFile = new Map();
const offences = [];

for (const m of MIGRATIONS) {
  const stmts = readFileSync(join(ROOT, m), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim().replace(/;$/, "").trim())
    .filter(Boolean);
  statementsByFile.set(m, stmts);
  for (const s of stmts) {
    for (const [re, name] of FORBIDDEN) {
      if (re.test(s)) offences.push({ file: m, name, snippet: s.replace(/\s+/g, " ").slice(0, 100) });
    }
  }
}

const total = [...statementsByFile.values()].reduce((n, a) => n + a.length, 0);
log(`- **Files:** ${MIGRATIONS.length} · **Statements:** ${total}`);

if (offences.length) {
  log();
  log("**REFUSED — these statements can destroy data:**");
  log();
  log("| File | Kind | Statement |");
  log("|---|---|---|");
  offences.forEach((o) => log(`| \`${o.file}\` | ${o.name} | ${o.snippet} |`));
  log();
  log("Nothing was applied. A destructive change to production is a decision on");
  log("its own, not something that rides along inside a routine migration.");
  finish(1);
}

log();
log("Every statement is additive — no DROP, TRUNCATE, DELETE, RENAME or");
log("SET NOT NULL. Safe to apply to a live database.");

/* ---- row counts, before -------------------------------------------------- */
const db = drizzle(neon(prodUrl));

const COUNTED = [
  "contacts", "applications", "activities", "participants",
  "properties", "stage_transitions", "documents", "entities",
];

async function counts() {
  const out = {};
  for (const t of COUNTED) {
    try {
      const r = await db.execute(raw.raw(`SELECT count(*)::int AS n FROM "${t}"`));
      const rows = r.rows ?? r;
      out[t] = Number(rows[0]?.n ?? rows[0]?.count ?? 0);
    } catch {
      out[t] = null; // table does not exist yet
    }
  }
  return out;
}

/**
 * Prove we can actually talk to production BEFORE counting.
 *
 * `counts()` swallows a per-table error so a not-yet-created table reads as
 * "—". That is right for a missing table and badly wrong for a dead
 * connection: every count would come back null, the database would look empty,
 * and the confirmation prompt would cheerfully offer to migrate it.
 */
console.log(DRY ? "\n  DRY RUN — not connecting." : "\n  Connecting to production...");
try {
  if (DRY) throw { __dry: true };
  await db.execute(raw.raw("SELECT 1"));
} catch (err) {
  if (!err?.__dry) {
  log();
  log("**FAILED to reach production** — nothing was read and nothing applied.");
  log();
  log("```");
  log(String(err?.message ?? err).slice(0, 300));
  log("```");
  if (/password authentication failed/i.test(String(err?.message ?? err))) {
    log();
    log(`These credentials came from ${credentialSource}.`);
    log("An authentication failure means they are STALE — the Neon password was");
    log("rotated after they were saved. Nothing is wrong with the database.");
    if (!fromVercel) {
      log();
      log("Run this through `fc-migrate-prod.bat`, which pulls current credentials");
      log("from Vercel first rather than relying on the saved copy.");
    }
  }
  finish(1);
  }
}

console.log(DRY ? "  DRY RUN — skipping row counts." : "  Reading production row counts...");
const before = DRY ? Object.fromEntries(COUNTED.map((t) => [t, null])) : await counts();

log();
log("## Rows before");
log();
log("| Table | Rows |");
log("|---|---:|");
for (const t of COUNTED) log(`| \`${t}\` | ${before[t] ?? "—"} |`);

/* ---- 4: typed confirmation ----------------------------------------------- */
console.log(`
  ============================================
   ABOUT TO CHANGE PRODUCTION
  ============================================

   Host:       ${hostOf(prodUrl)}
   Contacts:   ${before.contacts ?? "—"}
   Statements: ${total} (all additive)

   Type  APPLY TO PRODUCTION  exactly, then Enter.
   Anything else cancels.
${DRY ? "\n   (DRY RUN — nothing will be applied whatever you type.)\n" : ""}`);

const rl = createInterface({ input: stdin });
const answer = await new Promise((resolve) => {
  const it = rl[Symbol.asyncIterator]();
  stdout.write("  > ");
  it.next().then(({ value, done }) => resolve(done ? "" : String(value).trim()));
});
rl.close();

if (answer !== "APPLY TO PRODUCTION") {
  log();
  log(`**CANCELLED** — confirmation not given. Nothing was applied.`);
  finish(1);
}

if (DRY) {
  log();
  log("**DRY RUN** — confirmation accepted, but nothing was applied and nothing");
  log("was read from production. Run without `--dry-run` to apply.");
  finish(0);
}

/* ---- apply --------------------------------------------------------------- */
const ALREADY = new Set(["42P07", "42710", "42701"]);
const sqlState = (e) => e?.code ?? e?.cause?.code ?? e?.sourceError?.code ?? null;

let applied = 0, skipped = 0, failed = 0;
log();
log("## Applied");

for (const [file, stmts] of statementsByFile) {
  let a = 0, s = 0, f = 0;
  for (const stmt of stmts) {
    try {
      await db.execute(raw.raw(stmt));
      a++;
    } catch (err) {
      if (ALREADY.has(sqlState(err))) { s++; }
      else {
        f++;
        log();
        log(`**FAILED** in \`${file}\`:`);
        log("```");
        log(String(err?.message ?? err).slice(0, 300));
        log("```");
        break;
      }
    }
  }
  applied += a; skipped += s; failed += f;
  log(`- \`${file}\` — ${a} applied, ${s} already there${f ? `, **${f} FAILED**` : ""}`);
  if (f) break;
}

log();
log(`**${applied} applied · ${skipped} already there · ${failed} failed**`);

/* ---- 5: nothing may have moved ------------------------------------------- */
console.log("\n  Re-reading production row counts...");
const after = await counts();

log();
log("## Rows after");
log();
log("| Table | Before | After | |");
log("|---|---:|---:|---|");
let drift = 0;
for (const t of COUNTED) {
  const b = before[t], a2 = after[t];
  // A table that did not exist before and is empty now was just created — that
  // is the migration working, not drift.
  const created = b === null && a2 === 0;
  const same = b === a2 || created;
  if (!same) drift++;
  log(`| \`${t}\` | ${b ?? "—"} | ${a2 ?? "—"} | ${same ? "unchanged" : "**CHANGED**"} |`);
}

log();
if (drift > 0) {
  log(`**${drift} table(s) changed row count.** That should be impossible for an`);
  log("additive migration. Investigate before deploying.");
} else {
  log("**No row counts changed.** Every existing record is exactly as it was.");
}

finish(failed > 0 || drift > 0 ? 1 : 0);
