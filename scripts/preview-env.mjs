// Copies the Clerk DEVELOPMENT keys from .env.local into Vercel's Preview
// environment for the redesign-ledger branch, so preview links can render.
//
// Why dev keys: the live Clerk keys only work on fundedcapital.com. A preview
// runs on a *.vercel.app address, so it needs the development instance, the
// same one local dev uses. Production is not touched.
//
// Values are piped straight into the Vercel CLI and never printed.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const BRANCH = "redesign-ledger";
const NAMES = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"];
const PREFIX = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_", CLERK_SECRET_KEY: "sk_test_" };

let env;
try {
  env = readFileSync(".env.local", "utf8");
} catch {
  console.log("  >> .env.local not found. Nothing was changed.");
  process.exit(1);
}

const values = {};
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m || !NAMES.includes(m[1])) continue;
  values[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

for (const name of NAMES) {
  const v = values[name];
  if (!v) {
    console.log(`  >> ${name} is missing from .env.local. Nothing was changed.`);
    process.exit(1);
  }
  if (!v.startsWith(PREFIX[name])) {
    console.log(`  >> ${name} in .env.local is not a Clerk DEVELOPMENT key. Nothing was changed.`);
    process.exit(1);
  }
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
let failed = false;
for (const name of NAMES) {
  // Remove an old preview value for this branch first, if there is one.
  spawnSync(npx, ["--yes", "vercel", "env", "rm", name, "preview", BRANCH, "--yes"], {
    stdio: ["ignore", "ignore", "ignore"],
    shell: true,
  });
  const r = spawnSync(npx, ["--yes", "vercel", "env", "add", name, "preview", BRANCH], {
    input: values[name],
    stdio: ["pipe", "ignore", "pipe"],
    shell: true,
  });
  if (r.status === 0) {
    console.log(`  OK  ${name} added to Preview (${BRANCH})`);
  } else {
    failed = true;
    const err = String(r.stderr || "").split(/\r?\n/).filter(Boolean).slice(-2).join(" ");
    console.log(`  >>  ${name} could not be added. ${err}`);
  }
}
process.exit(failed ? 1 : 0);
