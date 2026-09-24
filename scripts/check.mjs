#!/usr/bin/env node
/**
 * Funded Capital — one command that proves the repo is healthy.
 *
 * WHY THIS EXISTS:
 * Cowork sessions can read and write files in this repo but cannot run commands.
 * So instead of Luis copy-pasting terminal output back into a chat, this script
 * writes a report to .fc-check/report.md that Claude reads directly from disk.
 *
 * Run it with:   npm run check        (full — includes the production build)
 *                npm run check:fast   (typecheck + tests only, no build)
 * or double-click fc-check.bat.
 *
 * Exit code is 0 only if every step passed, so it is safe to chain before a push.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const OUT_DIR = join(ROOT, ".fc-check");
const REPORT = join(OUT_DIR, "report.md");

const FAST = process.argv.includes("--fast");
const SKIP_TESTS = process.argv.includes("--no-tests");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".fc-check", "out", "build", ".vercel"]);
const MAX_CAPTURE_LINES = 60;

/* ------------------------------------------------------------------ helpers */

function banner(text) {
  console.log("\n============================================");
  console.log(" " + text);
  console.log("============================================");
}

function run(command, { cwd = ROOT, timeoutMs = 15 * 60 * 1000 } = {}) {
  const started = Date.now();
  const res = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  return {
    ok: res.status === 0,
    code: res.status,
    output: (stdout + (stderr ? "\n" + stderr : "")).trim(),
    seconds: ((Date.now() - started) / 1000).toFixed(1),
    timedOut: res.error?.code === "ETIMEDOUT",
  };
}

/** npm's own chatter is never the reason a step failed. */
const NOISE = /^\s*npm (notice|warn|WARN|http)\b/;

/**
 * Colour codes have to come off before anything is matched.
 *
 * Turbopack wraps its error lines in ANSI escapes, so `/^\s*error\b/` never
 * matched them and the report showed only the "build failed with N errors"
 * summary — the one line that does not say what is wrong. That cost a full
 * round trip on 2026-09-14.
 */
const ANSI = /\u001b\[[0-9;]*m/g;

function meaningfulLines(text) {
  return text
    .replace(ANSI, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !NOISE.test(l));
}

/** Last N meaningful lines — failures put the useful part at the end. */
function tail(text, n = MAX_CAPTURE_LINES) {
  const lines = meaningfulLines(text);
  if (lines.length <= n) return lines.join("\n");
  return `… ${lines.length - n} earlier lines omitted …\n` + lines.slice(-n).join("\n");
}

/**
 * What actually went wrong. Compilers bury one real error under pages of help
 * text or progress output, so lift the error lines when we can recognise them
 * and fall back to the tail when we cannot.
 */
const ERROR_LINE =
  /(error TS\d+|^\s*error\b|Failed to compile|Module not found|Cannot find|SyntaxError|TypeError|ReferenceError|\*\*FAIL\*\*|✖|✘)/i;

function excerpt(text, n = MAX_CAPTURE_LINES) {
  const lines = meaningfulLines(text);
  const hits = lines.filter((l) => ERROR_LINE.test(l));
  if (hits.length === 0 || hits.length > n) return tail(text, n);
  const shown = hits.slice(0, n);
  const omitted = lines.length - shown.length;
  return shown.join("\n") + (omitted > 0 ? `\n\n… ${omitted} other line(s) not shown …` : "");
}

function findRegressSuites(dir = ROOT, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      findRegressSuites(full, found);
    } else if (entry.isFile() && /\.regress\.ts$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function rel(p) {
  return relative(ROOT, p).split(sep).join("/");
}

/* -------------------------------------------------------------- environment */

const env = {
  when: new Date().toISOString(),
  node: process.version,
  npm: run("npm --version").output.split("\n")[0] || "unknown",
  branch: run("git rev-parse --abbrev-ref HEAD").output || "unknown",
  sha: run("git rev-parse --short HEAD").output || "unknown",
  dirty: run("git status --porcelain").output,
};

const nodeMajor = Number(process.version.replace(/^v/, "").split(".")[0]);

/* ------------------------------------------------------------------- steps */

const steps = [];

function record(name, detail, result, { advice = null } = {}) {
  steps.push({ name, detail, advice, ...result });
  const mark = result.ok ? "PASS" : result.skipped ? "SKIP" : "FAIL";
  console.log(`  ${mark.padEnd(4)}  ${name}  (${result.seconds ?? "0.0"}s)`);
  if (!result.ok && !result.skipped && result.output) {
    console.log("\n" + excerpt(result.output, 20) + "\n");
  }
}

banner("FUNDED CAPITAL — REPO CHECK");
console.log(` node ${env.node}   npm ${env.npm}   branch ${env.branch} @ ${env.sha}`);
console.log(` mode: ${FAST ? "FAST (no production build)" : "FULL"}`);
console.log("");

/* 1 — dependencies present.
   Installs automatically when anything the later steps need is missing, so
   nobody ever has to open a terminal and run npm install by hand. */
banner("1. DEPENDENCIES");
const NODE_MODULES = join(ROOT, "node_modules");
// Every package package.json declares, not a fixed short list. With a fixed
// list, a newly added library (e.g. @dnd-kit/core, 24 Sep 2026) was never
// installed here, and the typecheck below failed on "Cannot find module" —
// on the machine that had just pulled the change that added it.
const declared = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    return Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
  } catch {
    return ["typescript", "tsx", "next"];
  }
})();
const missing = !existsSync(NODE_MODULES)
  ? ["node_modules"]
  : declared.filter((pkg) => !existsSync(join(NODE_MODULES, pkg, "package.json")));

if (missing.length > 0) {
  console.log(`  Missing: ${missing.join(", ")}`);
  console.log("  Installing now. The first run takes a few minutes — leave this window open.\n");
  record("npm install", `missing: ${missing.join(", ")}`, run("npm install"), {
    advice: "If this failed, check the internet connection and that Node.js is installed.",
  });
} else {
  record("dependencies installed", `all ${declared.length} declared packages present`, {
    ok: true,
    seconds: "0.0",
    output: "",
  });
}

/* 2 — typecheck. This is the real quality gate; `npm run lint` is stubbed to exit 0. */
banner("2. TYPECHECK");
console.log("  (npm run lint is stubbed to exit 0 on purpose — this is the real check)");
record(
  "typecheck",
  "tsc --noEmit across the whole repo",
  run("npm run typecheck --silent"),
  { advice: "Type errors block nothing on Vercel because lint is stubbed. Fix them here." }
);

/* 3 — regression suites */
banner("3. REGRESSION SUITES");
const suites = findRegressSuites();
if (SKIP_TESTS) {
  record("regression suites", "skipped via --no-tests", { ok: true, skipped: true, seconds: "0.0", output: "" });
} else if (suites.length === 0) {
  console.log("  No *.regress.ts files found.");
  record("regression suites", "none found", { ok: true, seconds: "0.0", output: "" });
} else {
  console.log(`  Found ${suites.length}: ${suites.map(rel).join(", ")}\n`);
  for (const suite of suites) {
    const result = run(`npx --yes tsx "${rel(suite)}"`);
    record(rel(suite), "regression suite", result, {
      advice:
        nodeMajor < 20
          ? `Node ${env.node} is old; tsx needs Node 20+. Upgrade Node if this failed to start.`
          : null,
    });
  }
}

/* 4 — production build */
if (FAST) {
  banner("4. BUILD — SKIPPED (fast mode)");
  record("production build", "skipped via --fast", { ok: true, skipped: true, seconds: "0.0", output: "" });
} else {
  banner("4. PRODUCTION BUILD");
  console.log("  This takes about a minute.\n");
  record("production build", "npm run build", run("npm run build"), {
    advice: "A failed build means Vercel would also fail. Do not push.",
  });
}

/* ------------------------------------------------------------------ report */

const failed = steps.filter((s) => !s.ok && !s.skipped);
const passed = steps.filter((s) => s.ok && !s.skipped);
const skipped = steps.filter((s) => s.skipped);
const verdict = failed.length === 0 ? "HEALTHY" : "PROBLEMS FOUND";

const lines = [];
lines.push(`# Repo check — ${verdict}`);
lines.push("");
lines.push(`- **When:** ${env.when}`);
lines.push(`- **Mode:** ${FAST ? "fast (no production build)" : "full"}`);
lines.push(`- **Branch:** \`${env.branch}\` @ \`${env.sha}\``);
lines.push(`- **Node:** ${env.node} · **npm:** ${env.npm}`);
lines.push(
  `- **Working tree:** ${env.dirty ? `${env.dirty.split(/\r?\n/).length} uncommitted file(s)` : "clean"}`
);
lines.push(`- **Result:** ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
lines.push("");
lines.push("## Steps");
lines.push("");
lines.push("| Step | Result | Time |");
lines.push("|---|---|---|");
for (const s of steps) {
  const mark = s.skipped ? "skipped" : s.ok ? "**pass**" : "**FAIL**";
  lines.push(`| ${s.name} | ${mark} | ${s.seconds}s |`);
}
lines.push("");

if (failed.length) {
  lines.push("## Failures");
  lines.push("");
  for (const s of failed) {
    lines.push(`### ${s.name}`);
    lines.push("");
    lines.push(`${s.detail}${s.timedOut ? " — **timed out**" : ` — exit code ${s.code}`}`);
    if (s.advice) {
      lines.push("");
      lines.push(`> ${s.advice}`);
    }
    lines.push("");
    lines.push("```");
    lines.push(excerpt(s.output) || "(no output captured)");
    lines.push("```");
    lines.push("");

    /**
     * The excerpt is for reading; this file is for diagnosing. An excerpt that
     * drops the one line naming the file and the rule turns a two-minute fix
     * into another round trip, so the complete output is always on disk.
     */
    const logName = `fail-${s.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.log`;
    try {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, logName), s.output || "(no output captured)", "utf8");
      lines.push(`Full output: \`.fc-check/${logName}\``);
      lines.push("");
    } catch {
      // A log we could not write must never fail the report that names it.
    }
  }
} else {
  lines.push("No failures. Safe to push.");
  lines.push("");
}

if (env.dirty) {
  lines.push("## Uncommitted changes");
  lines.push("");
  lines.push("```");
  lines.push(tail(env.dirty, 40));
  lines.push("```");
  lines.push("");
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(REPORT, lines.join("\n"), "utf8");

banner(`RESULT: ${verdict}`);
console.log(`  ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
console.log(`  Report written to .fc-check/report.md`);
if (failed.length) {
  console.log("\n  Failed steps: " + failed.map((s) => s.name).join(", "));
  console.log("  Do NOT push. Tell Claude the check is done and it will read the report.");
} else {
  console.log("\n  Safe to push.");
}
console.log("");

process.exit(failed.length > 0 ? 1 : 0);
