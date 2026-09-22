#!/usr/bin/env node
/**
 * Merge database credentials from Vercel into .env.local WITHOUT clobbering it.
 *
 * WHY THIS EXISTS:
 * `vercel env pull .env.local` overwrites the whole file. That is wrong here:
 * local development deliberately uses Clerk DEV keys against a separate user
 * list, while Vercel holds the PRODUCTION keys. Overwriting would silently point
 * local dev at live Clerk users, and would delete any purely-local variable that
 * does not exist in Vercel at all.
 *
 * So fc-db.bat pulls to a scratch file and this merges across only the keys the
 * database actually needs. Secrets never leave the machine.
 *
 * TWO MODES, because "merge" and "refresh" are different jobs:
 *
 *   default    — add MISSING database keys, leave existing ones alone.
 *                This is what fc-db.bat wants: fill in what is absent without
 *                disturbing a machine that is deliberately pointed elsewhere.
 *
 *   --replace  — overwrite the database keys with what Vercel holds.
 *                This is what fc-refresh-env.bat wants after a Neon password
 *                rotation, and until 22 Sep 2026 it did not exist. The refresh
 *                script called the default mode, which kept the stale password
 *                and reported it as "left untouched" — so the refresh could
 *                never actually refresh anything. The first production
 *                migration failed on those stale credentials.
 *
 * --replace REFUSES to move a machine between databases. If .env.local points
 * at a different endpoint from the one Vercel holds — a Neon dev branch, say —
 * then replacing would quietly put local development back onto the production
 * database. That is the opposite of why the dev branch exists, and it would
 * happen without anyone noticing until something wrote to the wrong place.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE = join(ROOT, ".env.vercel");
const TARGET = join(ROOT, ".env.local");
const REPLACE = process.argv.includes("--replace");

/** Only database credentials cross over. Everything else stays as it is. */
const WANTED = /^(DATABASE_URL|DATABASE_URL_UNPOOLED|POSTGRES_|PG(HOST|USER|PASSWORD|DATABASE)|NEON_)/;

function parse(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    out.set(trimmed.slice(0, eq).trim(), line);
  }
  return out;
}

const valueOf = (line) => (line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "");
/** Endpoint identity, ignoring the pooler suffix. Never includes credentials. */
const endpoint = (url) => { try { return new URL(url).hostname.replace("-pooler", ""); } catch { return null; } };

function cleanup() {
  // The scratch file holds production secrets. It does not linger.
  try {
    if (existsSync(SOURCE)) {
      unlinkSync(SOURCE);
      console.log("  Removed the temporary .env.vercel file.");
    }
  } catch {
    console.error("  WARNING: could not delete .env.vercel — delete it by hand, it contains secrets.");
  }
}

if (!existsSync(SOURCE)) {
  console.error("  .env.vercel not found — the credential pull did not produce a file.");
  process.exit(1);
}

const pulled = parse(readFileSync(SOURCE, "utf8"));
const existingText = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
const existing = parse(existingText);

/* ---- the guard that makes --replace safe -------------------------------- */
if (REPLACE) {
  const here = endpoint(valueOf(existing.get("DATABASE_URL")));
  const there = endpoint(valueOf(pulled.get("DATABASE_URL")));

  if (here && there && here !== there) {
    console.error(`
  ============================================================
    REFUSED - this machine is on a DIFFERENT database
  ============================================================

    .env.local:   ${here}
    Vercel holds: ${there}

    Replacing would move local development onto Vercel's database
    - production - which is exactly what the Neon dev branch
    exists to prevent. Nothing was changed.

    If you rotated the password and your DEV BRANCH credentials
    are now stale, re-copy them from the Neon console instead:
    double-click fc-use-dev-db.bat.
`);
    cleanup();
    process.exit(1);
  }
}

/* ---- do the merge -------------------------------------------------------- */
const added = [];
const replaced = [];
const kept = [];

let text = existingText;

for (const [key, line] of pulled) {
  if (!WANTED.test(key)) continue;

  if (!existing.has(key)) { added.push(line); continue; }

  if (!REPLACE) { kept.push(key); continue; }

  const oldLine = existing.get(key);
  if (oldLine === line) { kept.push(key); continue; }

  // Replace IN PLACE so the file keeps its shape and its comments.
  text = text.split(/\r?\n/).map((l) => (l === oldLine ? line : l)).join("\n");
  replaced.push(key);
}

if (added.length) {
  const sep = text.length && !text.endsWith("\n") ? "\n" : "";
  text = text +
    `${sep}\n# --- Neon database, pulled from Vercel ${new Date().toISOString().slice(0, 10)} ---\n` +
    added.join("\n") + "\n";
}

if (added.length || replaced.length) writeFileSync(TARGET, text, "utf8");

if (replaced.length) console.log(`  Replaced ${replaced.length} database key(s): ${replaced.join(", ")}`);
if (added.length) console.log(`  Added ${added.length} database key(s): ${added.map((l) => l.split("=")[0]).join(", ")}`);
if (kept.length) {
  console.log(
    REPLACE
      ? `  Left ${kept.length} key(s) alone — already identical: ${kept.join(", ")}`
      : `  Left ${kept.length} existing key(s) untouched: ${kept.join(", ")}`,
  );
}
if (!added.length && !replaced.length) {
  console.log(REPLACE ? "  Nothing needed replacing." : "  Nothing to add.");
  if (!REPLACE && kept.length) {
    console.log("  NOTE: this mode never replaces. If a password rotation made these");
    console.log("        stale, use fc-refresh-env.bat, which replaces them.");
  }
}
console.log(`  Every other variable in .env.local was preserved (${existing.size} key(s) total before merge).`);

cleanup();

if (!parse(existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "").has("DATABASE_URL")) {
  console.error("\n  DATABASE_URL is still missing. The database may not be connected to this project in Vercel.");
  process.exit(1);
}
