/**
 * Every staff-only surface carries its own guard. This suite fails the build if
 * one does not.
 *
 * WHY THIS EXISTS. The rule has been in CLAUDE.md since /crm shipped: every page
 * and EVERY SERVER ACTION checks staff access itself, because a server action is
 * an addressable endpoint reachable with a crafted POST by anyone who can sign
 * in, and a guard on the page does not cover it. The middleware only checks that
 * someone is signed in — it does not check staff at all.
 *
 * That rule has held so far because there were three pages. It is about to stop
 * holding on its own: a dashboard, a tasks page, a work queue and a conditions
 * screen are all planned, each with its own actions. Every one is another place
 * to remember, and the failure mode is not an error — it is a broker loading a
 * page that quietly renders the whole borrower book.
 *
 * So the rule stops depending on memory. This is the same trick
 * `schema-sync.regress.ts` uses for enum labels: encode the convention as a test
 * that reads the source, and "I forgot" stops being possible.
 *
 * DELIBERATELY A TEXT SCAN, NOT A TYPE-AWARE ANALYSIS. A regex over source is
 * crude and can in principle be fooled — by a guard inside a branch that never
 * runs, say. It cannot be fooled by the thing that actually happens, which is
 * someone copying a file and not noticing the missing line. The cost of the
 * sophisticated version is a parser dependency and a suite nobody can read; the
 * benefit over this is close to zero for the failure this exists to catch.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const ROOT = process.cwd();

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");

/* ------------------------------------------------------------------ pages */

/**
 * Every page and layout under app/crm must mention `isCrmStaff`.
 *
 * The layout guards too, but a layout and its page render CONCURRENTLY — the
 * layout's `notFound()` does not stop the page's database query from having
 * already run. That is why each page repeats the check, and why this test wants
 * to see it in every file rather than trusting the one above it.
 */
console.log("\n=== 1. Every /crm page and layout guards itself ===");

const crmFiles = walk(join(ROOT, "app", "crm"));
const pageFiles = crmFiles.filter((f) => /[/\\](page|layout)\.tsx$/.test(f));

check("found some /crm pages to check", pageFiles.length > 0, `${pageFiles.length} files`);

for (const f of pageFiles) {
  const src = readFileSync(f, "utf8");
  check(rel(f), src.includes("isCrmStaff"), src.includes("isCrmStaff") ? "guarded" : "NO isCrmStaff");
}

/* ---------------------------------------------------------------- actions */

/**
 * Every exported async function in a `"use server"` file must call a staff
 * assertion before it does anything else.
 *
 * The body is taken as everything up to the next top-level `export`, which is
 * accurate enough for this codebase's one-function-per-export style.
 */
console.log("\n=== 2. Every server action asserts staff ===");

const GUARD_CALLS = ["requireStaff(", "assertCrmStaff(", "requireUser("];

function exportedFunctions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export\s+async\s+function\s+(\w+)/g;
  let m: RegExpExecArray | null;
  const starts: { name: string; at: number }[] = [];
  while ((m = re.exec(src)) !== null) starts.push({ name: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].at;
    const to = i + 1 < starts.length ? starts[i + 1].at : src.length;
    out.push({ name: starts[i].name, body: src.slice(from, to) });
  }
  return out;
}

const actionFiles = crmFiles.filter((f) => f.endsWith(".ts") && readFileSync(f, "utf8").startsWith('"use server"'));

check("found some server-action files", actionFiles.length > 0, `${actionFiles.length} files`);

for (const f of actionFiles) {
  const src = readFileSync(f, "utf8");
  const fns = exportedFunctions(src);
  check(`${rel(f)} exports actions`, fns.length > 0, `${fns.length} exported`);
  for (const fn of fns) {
    const guarded = GUARD_CALLS.some((g) => fn.body.includes(g));
    check(`  ${rel(f)} :: ${fn.name}`, guarded, guarded ? "asserts staff" : "**NO STAFF ASSERTION**");
  }
}

/* --------------------------------------------------- staff-only db modules */

/**
 * The `*.server.ts` modules that read or write across every firm.
 *
 * These are reachable from any server code, so they assert staff themselves
 * rather than trusting their caller. `lib/broker/provision.ts` is deliberately
 * NOT in this list: it runs as the broker, for themselves, and asserting staff
 * there would lock every broker out of the portal.
 */
console.log("\n=== 3. Staff-only server modules assert staff in every export ===");

const STAFF_ONLY_MODULES = [
  "lib/broker/admin.server.ts",
  "lib/broker/invites.server.ts",
  "lib/marketing/requests.server.ts",
];

for (const relPath of STAFF_ONLY_MODULES) {
  const full = join(ROOT, relPath);
  let src: string;
  try {
    src = readFileSync(full, "utf8");
  } catch {
    check(relPath, false, "**FILE MISSING** — renamed? update STAFF_ONLY_MODULES");
    continue;
  }
  const fns = exportedFunctions(src);
  check(`${relPath} exports functions`, fns.length > 0, `${fns.length} exported`);
  for (const fn of fns) {
    const guarded = fn.body.includes("assertCrmStaff(");
    check(`  ${relPath} :: ${fn.name}`, guarded, guarded ? "asserts staff" : "**NO STAFF ASSERTION**");
  }
}

/* -------------------------------------------------- the broker path is NOT */

/**
 * The inverse check, and it matters as much as the others.
 *
 * `provision.ts` runs as a broker. If someone "helpfully" adds an
 * `assertCrmStaff()` to it — or imports one of the staff-only modules into it —
 * every broker is locked out of the portal, and the symptom is an access gate
 * that looks exactly like a correct refusal. That is a silent outage, so it is
 * asserted here rather than left to be discovered.
 */
console.log("\n=== 4. The BROKER path does not assert staff, and cannot reach the staff modules ===");

const provision = readFileSync(join(ROOT, "lib", "broker", "provision.ts"), "utf8");

/**
 * Only the IMPORT STATEMENTS, not the whole file.
 *
 * The first version of this test searched the raw source for "admin.server" and
 * duly failed — on the comment at the top of provision.ts that says it must
 * never import admin.server. A substring scan cannot tell a prohibition from a
 * violation. Parsing the import lines can.
 */
/**
 * Source with comments removed, for MUST-NOT-CONTAIN checks only.
 *
 * THE THIRD TIME THIS BUG HAS APPEARED. The suite's first run failed on the
 * comment in provision.ts saying it must never import admin.server. That was
 * fixed by parsing import statements. Today it failed again on the comment in
 * queue.api.server.ts explaining why `assertCrmStaff()` cannot work there —
 * the scan cannot tell an explanation from a call.
 *
 * Deliberately used for NEGATIVE checks only. Comment stripping is approximate
 * (a `//` inside a string literal would confuse it), and an approximation that
 * eats code makes a must-not-contain check STRICTER — a false alarm, which is
 * cheap. Using it on a must-contain check could hide a missing guard, which is
 * not. So the positive checks in sections 1 to 3 still read the raw source.
 */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const importsOf = (src: string): string[] =>
  [...src.matchAll(/^\s*import\s[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);

const importedPaths = importsOf(provision);
const importsAny = (needle: string) => importedPaths.some((p) => p.includes(needle));
check(
  "provision.ts does not assert staff",
  !codeOnly(provision).includes("assertCrmStaff"),
  codeOnly(provision).includes("assertCrmStaff") ? "**WOULD LOCK OUT EVERY BROKER**" : "clean",
);
check(
  "provision.ts does not import admin.server",
  !importsAny("admin.server"),
  importsAny("admin.server") ? "**IMPORTS STAFF MODULE**" : `clean (${importedPaths.length} imports checked)`,
);
check(
  "provision.ts does not import invites.server",
  !importsAny("invites.server"),
  importsAny("invites.server") ? "**IMPORTS STAFF MODULE**" : "clean",
);
check(
  "...and the import parser actually found the imports",
  importedPaths.length >= 5,
  importedPaths.join(", "),
);

const portalLayout = readFileSync(join(ROOT, "app", "broker-portal", "layout.tsx"), "utf8");
check(
  "the broker portal layout is where admission is decided",
  portalLayout.includes("admitBroker"),
  portalLayout.includes("admitBroker") ? "guarded" : "**NO ADMISSION CHECK**",
);

/* ------------------------------------------- every .server.ts is classified */

/**
 * The census, and the reason it exists.
 *
 * `STAFF_ONLY_MODULES` above is a hand-maintained list, which means the test it
 * feeds is only as good as someone remembering to add to it. A new
 * `something.server.ts` full of cross-firm queries would sail past section 3
 * simply by not being mentioned — the suite would stay green while the thing it
 * exists to catch walked in.
 *
 * So every `lib/**\/*.server.ts` must appear in one list or the other. Adding a
 * server module now forces a decision, in a diff, about whether brokers may
 * reach it. Not deciding is a build failure.
 */
console.log("\n=== 5. Every lib/**/*.server.ts is classified staff-only or not ===");

/**
 * Server modules that deliberately do NOT assert CRM staff — each with the
 * reason written down, because an exemption without a reason is just a hole
 * with a comment character in front of it.
 */
const NON_STAFF_SERVER_MODULES: Record<string, string> = {
  /**
   * Builds the sidebar, and EVERY BROKER calls it on every page of the portal.
   * Asserting staff there would throw for all of them. It reads only this
   * person's own `broker_users` row, through the same `resolveBrokerViewer` the
   * portal already uses, and is asserted below not to reach the staff modules.
   */
  "lib/workspace/nav.server.ts": "broker-reachable: the sidebar",

  /**
   * A DIFFERENT PRODUCT WITH A DIFFERENT ALLOWLIST. The revenue-share portal
   * gates on `PARTICIPANT_ADMIN_EMAILS` via its own `isPortalAdmin()`, not on
   * `CRM_STAFF_EMAILS` — seeing the participant book and seeing the borrower
   * pipeline are separate privileges and the lists are meant to diverge.
   *
   * NOTED, NOT ENDORSED: `getBook()` in that file does not check anything
   * itself. Its own comment says callers must gate first, and today its one
   * caller does. That is the pattern /crm deliberately abandoned — "the caller
   * already checked" is an assumption, and the whole point of section 3 is that
   * a module which can read every record asserts for itself. Worth fixing; it
   * is a separate change in a separate product area, not a drive-by edit.
   */
  "lib/revenueShare.server.ts": "separate allowlist: PARTICIPANT_ADMIN_EMAILS",

  /**
   * TOKEN-GUARDED, not staff-guarded. A scheduled task has no browser and no
   * Clerk session, so `assertCrmStaff()` can never pass for it. This module has
   * its own narrower guard (`assertQueueToken`) and its own narrower reach: it
   * touches `content_requests` and nothing else. Section 6 checks both.
   */
  "lib/marketing/queue.api.server.ts": "token-guarded: the marketing queue API",
};

const exemptPaths = Object.keys(NON_STAFF_SERVER_MODULES);

const libServerFiles = walk(join(ROOT, "lib"))
  .map(rel)
  .filter((p) => p.endsWith(".server.ts"))
  .sort();

check("found some .server.ts modules", libServerFiles.length > 0, `${libServerFiles.length} files`);

for (const p of libServerFiles) {
  const staffOnly = STAFF_ONLY_MODULES.includes(p);
  const exempt = exemptPaths.includes(p);
  check(
    `  ${p}`,
    staffOnly || exempt,
    staffOnly
      ? "staff-only"
      : exempt
        ? NON_STAFF_SERVER_MODULES[p]
        : "**UNCLASSIFIED** — add it to STAFF_ONLY_MODULES or NON_STAFF_SERVER_MODULES",
  );
}

/**
 * And the broker-reachable ones carry provision.ts's constraint too.
 *
 * A module every broker calls must not be able to import the modules that read
 * and write every firm. Same rule as section 4, applied to the same list the
 * census maintains, so a future exemption inherits the check automatically
 * rather than needing someone to think of it.
 */
for (const p of exemptPaths) {
  let src: string;
  try {
    src = readFileSync(join(ROOT, p), "utf8");
  } catch {
    check(`  ${p}`, false, "**FILE MISSING** — renamed? update NON_STAFF_SERVER_MODULES");
    continue;
  }
  const imports = importsOf(src);
  const reaches = imports.filter((i) => i.includes("admin.server") || i.includes("invites.server"));
  check(
    `  ${p} cannot reach the staff modules`,
    reaches.length === 0,
    reaches.length ? `**IMPORTS ${reaches.join(", ")}**` : `clean (${imports.length} imports checked)`,
  );
  check(
    `  ${p} does not assert staff`,
    !codeOnly(src).includes("assertCrmStaff"),
    codeOnly(src).includes("assertCrmStaff") ? "**CALLS assertCrmStaff — IT WOULD THROW FOR ITS OWN CALLERS**" : "clean",
  );
}

/* ------------------------------------------- the token-guarded API surface */

/**
 * The one module that guards itself with a shared secret rather than a session.
 *
 * `proxy.ts` matches /api but does NOT list it as a guarded route, so Clerk
 * lets every request through to the handler. That makes this module's own guard
 * the only thing between the internet and the queue, and makes these three
 * assertions worth more than their size.
 */
console.log("\n=== 6. The queue API guards itself, and cannot reach the book ===");

const QUEUE_API = "lib/marketing/queue.api.server.ts";
let queueSrc = "";
try {
  queueSrc = readFileSync(join(ROOT, QUEUE_API), "utf8");
} catch {
  check(QUEUE_API, false, "**FILE MISSING** — renamed? update this section");
}

if (queueSrc) {
  const fns = exportedFunctions(queueSrc);
  check(`${QUEUE_API} exports functions`, fns.length > 0, `${fns.length} exported`);
  for (const fn of fns) {
    const guarded = fn.body.includes("assertQueueToken(");
    check(`  ${QUEUE_API} :: ${fn.name}`, guarded, guarded ? "asserts the token" : "**NO TOKEN CHECK**");
  }

  /*
   * The blast radius, asserted rather than trusted to a comment.
   *
   * A token is a much weaker credential than a Clerk session on a staff
   * allowlist, so the data it reaches has to stay small. If this module ever
   * names applications, contacts or brokers, that is the mistake.
   */
  const FORBIDDEN_TABLES = ["applications", "contacts", "broker_users", "broker_firms", "participants", "documents"];
  for (const table of FORBIDDEN_TABLES) {
    const reaches = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+${table}\\b`, "i").test(queueSrc);
    check(`  cannot reach ${table}`, !reaches, reaches ? "**QUERIES A STAFF-ONLY TABLE**" : "clean");
  }
  check(
    "  ...and does query content_requests, so the test is not vacuous",
    /\bFROM\s+content_requests\b/i.test(queueSrc),
    "queries its own table",
  );
}

/**
 * A task may claim, draft and fail. It may NOT publish.
 *
 * Publishing is Luis pressing a button on every channel. An endpoint that let a
 * bearer token mark something published would be a quiet way around the rule
 * that nothing reaches the public unattended — which is the rule this whole
 * feature is built on.
 */
const queueRoute = readFileSync(join(ROOT, "app", "api", "crm", "content-queue", "route.ts"), "utf8");
const settable = /const TASK_STATUSES: readonly string\[\] = \[([^\]]*)\]/.exec(queueRoute)?.[1] ?? "";
check(
  "the API cannot set a request to published",
  settable.length > 0 && !settable.includes("published"),
  settable.trim() || "**COULD NOT PARSE TASK_STATUSES**",
);
check(
  "...and it can set the three a task actually needs",
  ["in_progress", "drafted", "failed"].every((s2) => settable.includes(s2)),
  settable.trim(),
);

/* ------------------------------------------- blog drafts through the API */

/**
 * Since 24 Sep 2026 the queue API carries the full MDX of a blog draft, so the
 * daily task no longer needs Luis's laptop awake. That makes the module bigger
 * in exactly one way — it now stores and returns text — and these checks pin
 * the edges of that, so the next change cannot widen it quietly.
 */
console.log("\n=== 7. Blog drafts: validated on the way in, narrow on the way out ===");

if (queueSrc) {
  const code = codeOnly(queueSrc);
  const fns = exportedFunctions(queueSrc).map((f) => f.name);
  check(
    "  the drafts listing exists and is covered by section 6",
    fns.includes("apiListDrafts"),
    fns.join(", "),
  );

  /*
   * The path check is the one that protects Luis's disk: pull-drafts.mjs later
   * writes to it. Asserted as the specific call on the specific field, which a
   * comment cannot satisfy by accident.
   */
  check(
    "  the draft path is validated before it is stored",
    queueSrc.includes("parseDraftPath(update.draftUrl)"),
    queueSrc.includes("parseDraftPath(update.draftUrl)") ? "parseDraftPath(update.draftUrl)" : "**PATH NOT VALIDATED**",
  );
  check(
    "  the draft body is validated before it is stored",
    queueSrc.includes("validateDraftBody(update.draftBody)"),
    queueSrc.includes("validateDraftBody(update.draftBody)") ? "validateDraftBody(update.draftBody)" : "**BODY NOT VALIDATED**",
  );

  /*
   * Section 6 lists tables it must NOT reach. This is the positive form: every
   * table this module names in a query is content_requests. A new table —
   * any table — has to be argued for in a diff to this line.
   */
  // Only the SQL: the bodies of sql`...` templates. `import ... from "next/headers"`
  // is not a query, and the first version of this check said it was.
  const queries = [...code.matchAll(/\bsql`([\s\S]*?)`/g)].map((m) => m[1]).join("\n");
  const targets = [...queries.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+"?([a-z_][a-z0-9_]*)"?/gi)].map((m) => m[1].toLowerCase());
  const others = [...new Set(targets.filter((t) => t !== "content_requests"))];
  check(
    "  every query in the module names content_requests and nothing else",
    targets.length > 0 && others.length === 0,
    others.length ? `**ALSO REACHES ${others.join(", ")}**` : `${targets.length} table references, all content_requests`,
  );
  check(
    "  no SELECT * — a column added later does not leave the building on its own",
    !/SELECT\s+\*/i.test(code),
    /SELECT\s+\*/i.test(code) ? "**SELECT * FOUND**" : "every column named",
  );
}

/*
 * A request body is bounded BEFORE it is parsed, and before the token is
 * checked — `request.json()` would buffer whatever arrived. The negative check
 * uses codeOnly, so the comment that explains why does not trip it.
 */
const routeCode = codeOnly(queueRoute);
check(
  "the route never calls request.json() on an unbounded body",
  !/\brequest\.json\(\)/.test(routeCode),
  /\brequest\.json\(\)/.test(routeCode) ? "**UNBOUNDED request.json()**" : "clean",
);
check(
  "...it reads through the capped reader instead",
  queueRoute.includes("readJsonCapped(request, MAX_REQUEST_BYTES)"),
  queueRoute.includes("readJsonCapped(request, MAX_REQUEST_BYTES)") ? "capped" : "**NO CAP FOUND**",
);

/*
 * The marketing page decides "published" for blog rows from the live site
 * (lib/marketing/published.ts). It must only READ while it renders — a write
 * during render would run on every page view, for every staff member, and
 * would turn a display rule into a data migration nobody asked for.
 */
const MARKETING_PAGE = "app/crm/marketing/page.tsx";
let marketingPage = "";
try {
  marketingPage = readFileSync(join(ROOT, MARKETING_PAGE), "utf8");
} catch {
  check(MARKETING_PAGE, false, "**FILE MISSING** — renamed? update this section");
}
if (marketingPage) {
  const pageCode = codeOnly(marketingPage);
  const WRITES = ["setRequestStatus(", "createRequest(", ".insert(", ".update(", ".delete(", "db.execute(", "apiUpdateRequest("];
  const found = WRITES.filter((w) => pageCode.includes(w));
  check(
    `${MARKETING_PAGE} does not write while rendering`,
    found.length === 0,
    found.length ? `**WRITES: ${found.join(", ")}**` : "read-only",
  );
  check(
    "...and it takes blog status from the live site",
    marketingPage.includes("effectiveStatus(r, liveSlugs)"),
    marketingPage.includes("effectiveStatus(r, liveSlugs)") ? "effectiveStatus" : "**NOT DERIVED**",
  );
}


/* ---------------------------------------------------------------------- */
console.log("\n=== 8. An action refreshes only the route it was called from ===");
/*
 * CLAUDE.md: "Do not revalidatePath a PPR route from a server action on a
 * different route." Refreshing /crm from an action run on another /crm page
 * once left the entire section serving its loading shell, with no error
 * anywhere. On 2026-09-24 three actions were found refreshing TWO routes each
 * — /crm/dashboard and /crm — which would have triggered it on the first click
 * of the new work-queue buttons. These checks keep that from coming back.
 */
const CRM_ACTIONS = "app/crm/actions.ts";
let crmActions = "";
try { crmActions = readFileSync(join(ROOT, CRM_ACTIONS), "utf8"); }
catch { check(CRM_ACTIONS, false, "**FILE MISSING** — renamed? update this section"); }
if (crmActions) {
  const code = codeOnly(crmActions);
  check(
    "a whitelist of refreshable routes exists",
    /function revalidateFrom\(/.test(code) && /CRM_ROUTES\.includes\(/.test(code),
    /function revalidateFrom\(/.test(code) ? "revalidateFrom + CRM_ROUTES" : "**MISSING**",
  );
  // Split into exported functions and count refresh calls in each.
  const fnRe = /export async function (\w+)\s*\(/g;
  const starts: { name: string; at: number }[] = [];
  for (let m; (m = fnRe.exec(code)); ) starts.push({ name: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const body = code.slice(starts[i].at, i + 1 < starts.length ? starts[i + 1].at : undefined);
    const n = (body.match(/revalidatePath\(|revalidateFrom\(/g) ?? []).length;
    check(
      `${starts[i].name} refreshes at most one route`,
      n <= 1,
      n <= 1 ? `${n} refresh call${n === 1 ? "" : "s"}` : `**${n} REFRESH CALLS**`,
    );
  }
  for (const name of ["setStage", "logContact", "setSnooze", "clearSnooze"]) {
    const s = starts.findIndex((x) => x.name === name);
    const body = s < 0 ? "" : code.slice(starts[s].at, s + 1 < starts.length ? starts[s + 1].at : undefined);
    check(
      `${name} refreshes through the whitelist, not a literal`,
      s >= 0 && body.includes("revalidateFrom(") && !body.includes("revalidatePath("),
      s < 0 ? "**NOT FOUND**" : body.includes("revalidatePath(") ? "**LITERAL revalidatePath**" : "revalidateFrom",
    );
  }
}

const QUEUE_UI = "app/crm/dashboard/QueueRowActions.tsx";
let queueUi = "";
try { queueUi = readFileSync(join(ROOT, QUEUE_UI), "utf8"); }
catch { check(QUEUE_UI, false, "**FILE MISSING** — renamed? update this section"); }
if (queueUi) {
  const code = codeOnly(queueUi);
  const calls = code.match(/\b(setStage|logContact|setSnooze|clearSnooze)\(([^()]|\([^()]*\))*\)/g) ?? [];
  const without = calls.filter((c) => !/HERE\)$/.test(c));
  check(
    "every dashboard action call says it is on /crm/dashboard",
    calls.length >= 5 && without.length === 0,
    without.length ? `**MISSING ROUTE: ${without.join(" | ")}**` : `${calls.length} calls, all pass HERE`,
  );
  check(
    "...and HERE is /crm/dashboard",
    /const HERE = "\/crm\/dashboard"/.test(code),
    /const HERE = "\/crm\/dashboard"/.test(code) ? "yes" : "**WRONG OR MISSING**",
  );
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
