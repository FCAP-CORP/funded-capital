#!/usr/bin/env node
/**
 * Refuse to run a schema change unless this machine is demonstrably on the dev
 * branch — and prove it from the credentials themselves, not from memory.
 *
 * WHY THIS EXISTS:
 * Both branches hold the same 711 contacts and answer to valid connection
 * strings, so "am I on dev?" cannot be answered by looking at the data. It can
 * only be answered by comparing hosts. Three checks, all cheap, all mechanical:
 *
 *   1. DATABASE_URL and DATABASE_URL_UNPOOLED point at the SAME endpoint.
 *      Copying the pooled string from one branch and the direct string from
 *      another is a real hazard of the two-copy dance in the Neon console, and
 *      it is the unpooled one that schema changes travel over — the one nothing
 *      else exercises, so the mistake would stay hidden until this moment.
 *
 *   2. That endpoint DIFFERS from the one in .env.local.before-dev-branch,
 *      which is the production endpoint this machine used to point at.
 *
 *   3. Both parse as real Postgres URLs.
 *
 * No password is ever printed. Hosts only.
 */

import { config as loadEnv } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BACKUP = join(ROOT, ".env.local.before-dev-branch");

loadEnv({ path: join(ROOT, ".env.local") });

let failed = false;
const say = (s = "") => console.log(s);
function bad(msg) {
  failed = true;
  say(`  REFUSED  ${msg}`);
}

/** Endpoint identity, ignoring the pooler suffix. Never includes credentials. */
function endpoint(url) {
  try {
    return new URL(url).hostname.replace("-pooler", "");
  } catch {
    return null;
  }
}
function hostOf(url) {
  try { return new URL(url).hostname; } catch { return "(unparseable)"; }
}

const pooled = process.env.DATABASE_URL;
const direct = process.env.DATABASE_URL_UNPOOLED;

say();
say("  Checking which database this machine is pointed at");
say("  --------------------------------------------------");

if (!pooled || !direct) {
  bad("DATABASE_URL or DATABASE_URL_UNPOOLED is missing from .env.local.");
  say();
  process.exit(1);
}

const epPooled = endpoint(pooled);
const epDirect = endpoint(direct);

say(`  pooled   ${hostOf(pooled)}`);
say(`  direct   ${hostOf(direct)}`);
say();

if (!epPooled || !epDirect) {
  bad("One of the two values is not a valid Postgres URL.");
} else if (epPooled !== epDirect) {
  bad("The two connection strings point at DIFFERENT branches.");
  say();
  say("  The pooled and direct strings must come from the same branch. Re-copy");
  say("  both from the Neon Connect panel without changing the branch selector");
  say("  in between, then run fc-use-dev-db.bat again.");
}

// --- check 2: did it actually change from production? ----------------------
if (!existsSync(BACKUP)) {
  bad(".env.local.before-dev-branch is missing, so there is nothing to compare");
  say("           against. Run fc-use-dev-db.bat first — it writes that backup.");
} else {
  const prev = readFileSync(BACKUP, "utf8");
  const line = prev.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  const prevUrl = line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
  const epPrev = endpoint(prevUrl);

  if (!epPrev) {
    say("  NOTE: the previous DATABASE_URL could not be parsed, so the");
    say("        before/after comparison was skipped.");
  } else if (epPrev === epPooled) {
    bad("This is the SAME endpoint this machine used before the switch.");
    say();
    say(`  previously  ${epPrev}`);
    say("  That is production. The dev branch strings were not applied — most");
    say("  likely the Neon branch selector still said 'main' when they were");
    say("  copied. Nothing has been changed.");
  } else {
    say(`  was        ${epPrev}   (production)`);
    say(`  now        ${epPooled}   (different — good)`);
  }
}

say();
if (failed) {
  say("  ==================================================");
  say("   PREFLIGHT FAILED - no schema change was attempted");
  say("  ==================================================");
  say();
  process.exit(1);
}

say("  Preflight passed. Safe to apply the schema change.");
say();
process.exit(0);
