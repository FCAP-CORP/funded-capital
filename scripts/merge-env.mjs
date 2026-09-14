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
 * database actually needs, leaving every existing line untouched. Secrets never
 * leave the machine and nothing already in .env.local is modified.
 *
 * Re-running is safe: keys already present in .env.local are reported as kept,
 * not replaced.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE = join(ROOT, ".env.vercel");
const TARGET = join(ROOT, ".env.local");

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

if (!existsSync(SOURCE)) {
  console.error("  .env.vercel not found — the credential pull did not produce a file.");
  process.exit(1);
}

const pulled = parse(readFileSync(SOURCE, "utf8"));
const existingText = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
const existing = parse(existingText);

const toAdd = [];
const kept = [];
for (const [key, line] of pulled) {
  if (!WANTED.test(key)) continue;
  (existing.has(key) ? kept : toAdd).push(existing.has(key) ? key : line);
}

if (toAdd.length === 0) {
  console.log(`  Nothing to add. ${kept.length} database key(s) were already present.`);
} else {
  const sep = existingText.length && !existingText.endsWith("\n") ? "\n" : "";
  const block =
    `${sep}\n# --- Neon database, pulled from Vercel ${new Date().toISOString().slice(0, 10)} ---\n` +
    toAdd.join("\n") + "\n";
  writeFileSync(TARGET, existingText + block, "utf8");
  console.log(`  Added ${toAdd.length} database key(s): ${toAdd.map((l) => l.split("=")[0]).join(", ")}`);
}
if (kept.length) console.log(`  Left ${kept.length} existing key(s) untouched: ${kept.join(", ")}`);
console.log(`  Every other variable in .env.local was preserved (${existing.size} key(s) total before merge).`);

// The scratch file holds production secrets. It does not linger.
try {
  unlinkSync(SOURCE);
  console.log("  Removed the temporary .env.vercel file.");
} catch {
  console.error("  WARNING: could not delete .env.vercel — delete it by hand, it contains secrets.");
}

if (!parse(readFileSync(TARGET, "utf8")).has("DATABASE_URL")) {
  console.error("\n  DATABASE_URL is still missing. The database may not be connected to this project in Vercel.");
  process.exit(1);
}
console.log("  DATABASE_URL is present.");
