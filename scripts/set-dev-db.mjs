#!/usr/bin/env node
/**
 * Point local development at a Neon DEVELOPMENT BRANCH instead of production.
 *
 * WHY THIS EXISTS:
 * Every database credential in this repo is scoped "Production, Preview, and
 * Development", so a laptop running `drizzle-kit push` or `migrate-crm.ts` is
 * talking to the live database holding real borrower contacts. `migrate-crm.ts`
 * has a `--reset` flag that truncates. Nothing stands between a mistyped command
 * and 700-odd real records except remembering not to type it.
 *
 * A Neon branch is a copy-on-write clone with its own credentials. Once these
 * two keys point at it, the only thing that can reach production is the deployed
 * site, which is how it should have been from the start.
 *
 * WHY NODE AND NOT A .BAT:
 * Connection strings contain & ? = and % — all of which cmd.exe mangles when
 * echoed into a file. Node treats them as ordinary text.
 *
 * Nothing here is sent anywhere. It reads and writes one local file.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const ROOT = process.cwd();
const TARGET = join(ROOT, ".env.local");
const BACKUP = join(ROOT, ".env.local.before-dev-branch");

const KEYS = ["DATABASE_URL", "DATABASE_URL_UNPOOLED"];

function fail(msg) {
  console.error("\n  " + msg + "\n");
  process.exit(1);
}

/** Show enough to confirm the right database, never the password. */
function describe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(could not be parsed)";
  }
}

if (!existsSync(TARGET)) {
  fail(".env.local not found. Double-click fc-db.bat first to create it.");
}

const before = readFileSync(TARGET, "utf8");
const lines = before.split(/\r?\n/);

/** What it points at right now, so the change is visible rather than assumed. */
console.log("\n  Local database right now:");
for (const key of KEYS) {
  const line = lines.find((l) => l.trim().startsWith(key + "="));
  const value = line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
  console.log(`    ${key.padEnd(24)} ${value ? describe(value) : "(not set)"}`);
}

console.log(`
  Paste the two connection strings from your Neon DEV branch.
  In the Neon console: open the branch, then "Connect to your database".
  Take the POOLED string for the first and the DIRECT / unpooled one for the second.
`);

/**
 * Read one line at a time from a plain line iterator rather than readline's
 * promise-based question(). question() never resolves once a non-terminal stdin
 * reaches end of input, so the script would exit having printed the prompts and
 * written nothing — looking, from the outside, exactly like "I ran it and
 * nothing happened". The iterator ends cleanly instead and we can say so.
 */
const rl = createInterface({ input: stdin });
const lines = rl[Symbol.asyncIterator]();

async function ask(prompt) {
  stdout.write(prompt);
  const { value, done } = await lines.next();
  if (done) {
    stdout.write("\n");
    fail("No input was received, so nothing was changed. Run it again and paste the string when prompted.");
  }
  return String(value).trim().replace(/^["']|["']$/g, "");
}

const answers = {};

for (const key of KEYS) {
  const label = key === "DATABASE_URL" ? "pooled" : "direct / unpooled";
  const value = await ask(`  ${key} (${label}): `);

  if (!value) fail(`No value given for ${key}. Nothing was changed.`);
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    fail(`${key} does not look like a Postgres connection string. Nothing was changed.`);
  }
  answers[key] = value;
}

rl.close();

// A branch whose host matches what is already there is almost certainly the
// production string pasted twice — the exact mistake this script exists to stop.
if (describe(answers.DATABASE_URL) === describe(answers.DATABASE_URL_UNPOOLED)) {
  console.log("\n  NOTE: both strings point at the same host. That is normal on some");
  console.log("  Neon plans, but check you did not paste the same one twice.\n");
}

copyFileSync(TARGET, BACKUP);

const out = [];
const seen = new Set();
for (const line of lines) {
  const key = KEYS.find((k) => line.trim().startsWith(k + "="));
  if (key) {
    out.push(`${key}=${answers[key]}`);
    seen.add(key);
  } else {
    out.push(line);
  }
}
for (const key of KEYS) {
  if (!seen.has(key)) out.push(`${key}=${answers[key]}`);
}

writeFileSync(TARGET, out.join("\n"), "utf8");

console.log("\n  Local database is now:");
for (const key of KEYS) console.log(`    ${key.padEnd(24)} ${describe(answers[key])}`);
console.log(`
  Previous .env.local saved as .env.local.before-dev-branch

  Vercel is untouched — the deployed site still uses production.
  fc-db.bat will NOT overwrite these: merge-env keeps keys already present.
`);
