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
  // The record card's read: one borrower's whole file, consent state included.
  "lib/crm/record.server.ts",
  // The dashboard's read: the whole book, every borrower's name and email,
  // plus every open task due today.
  "lib/crm/dashboard.server.ts",
  // Connected Gmail mailboxes: holds (encrypted) the key to send mail as
  // someone. Section 13 pins the rest.
  "lib/comms/mailbox.server.ts",
  // The reports page's read: the whole book (counts and dates, no names).
  "lib/crm/reports.server.ts",
  // The nurture page: the whole book classified, plus enrol / stop / retry.
  "lib/nurture/nurture.server.ts",
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

  /**
   * SECRET-GUARDED, by its one caller. The BiggerPockets Apps Script trigger
   * has no browser and no Clerk session, so `assertCrmStaff()` can never pass
   * for it. /api/crm/lead-intake checks CRM_SYNC_SECRET before calling in, and
   * section 10 asserts that the route is the only importer, that the check
   * comes first, and that the module writes only the six tables a lead needs.
   */
  "lib/leads/biggerpockets.server.ts": "secret-guarded: BiggerPockets lead intake, via /api/crm/lead-intake only",

  /**
   * TEXTING (24 Sep 2026). Three modules, none of which can call
   * `assertCrmStaff()` for the same reason as the two above — or, for the
   * executor, because its one caller already has. Section 11 pins each:
   *
   * - the EXECUTOR is reached only through app/crm/commsActions.ts, whose every
   *   export asserts staff (section 2). What the executor asserts itself is
   *   CONSENT, on every send and retry, which cannot depend on who is asking;
   * - the Quo HTTP client reads no table and takes a TextPermit, so it cannot
   *   be called without the consent gate; only the executor imports it;
   * - the webhook writer is SIGNATURE-guarded by its one route, and may only
   *   ever revoke consent, never grant it.
   */
  "lib/comms/outbox.server.ts": "staff-guarded by its one caller (app/crm/commsActions.ts); consent-gated itself",
  "lib/comms/quo.server.ts": "HTTP client only: reads no table, needs a TextPermit, imported only by the executor",
  "lib/comms/quoWebhook.server.ts": "signature-guarded: Quo webhooks, via /api/webhooks/quo only",

  /**
   * EMAIL FROM THE RECORD CARD (25 Sep 2026). Section 13 pins both:
   * - the EXECUTOR is reached only through app/crm/emailActions.ts (every
   *   export asserts staff, section 2), and every mailbox read it makes goes
   *   through lib/comms/mailbox.server.ts, which asserts staff again. What it
   *   asserts itself is the email gate (canEmail) before Gmail is called;
   * - the Google HTTP client reads no table and logs nothing.
   */
  "lib/comms/emailOutbox.server.ts": "staff-guarded by its one caller (app/crm/emailActions.ts); email-gated itself",
  "lib/comms/gmail.server.ts": "HTTP client only: reads no table, logs nothing, imported by the executor and the Connect Gmail callback",

  /**
   * LEAD NURTURING (26 Sep 2026). Section 14 pins both:
   * - the SYNC runs from Vercel Cron, which has no Clerk session, so it can
   *   never assert staff. Its one outside door is /api/cron/nurture, which
   *   checks CRON_SECRET first. It writes only nurture_enrollments, keyed
   *   automation activities, and contacts.email_subscribed — to FALSE only;
   * - the Klaviyo client reads no table, logs nothing, and has no call that
   *   could subscribe anyone.
   */
  "lib/nurture/sync.server.ts": "secret-guarded: Vercel Cron via /api/cron/nurture (and after() from staff actions); consent may only be revoked",
  "lib/comms/klaviyo.server.ts": "HTTP client only: reads no table, logs nothing, cannot subscribe; imported by the nurture sync only",
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
  for (const name of [
    "setStage", "markLost", "logContact", "setSnooze", "clearSnooze",
    // Route-aware since the record card (2026-09-24), which calls them from three pages.
    "setApplicationNotes", "setContactField",
    "addTask", "toggleTask", "deleteTask",
  ]) {
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

/*
 * Every OTHER client file on the dashboard, too (the redesign of 24 Sep 2026
 * added the task checkboxes in DueTasks.tsx, which call toggleTask). Any .tsx
 * in app/crm/dashboard that calls an action must pass HERE, and its HERE must
 * be /crm/dashboard — so a new file there cannot quietly refresh /crm.
 */
const DASH_DIR = join(ROOT, "app", "crm", "dashboard");
const DASH_ACTIONS =
  /\b(setStage|markLost|logContact|setSnooze|clearSnooze|setApplicationNotes|setContactField|addTask|toggleTask|deleteTask)\(([^()]|\([^()]*\))*\)/g;
let dashCalls = 0;
for (const f of walk(DASH_DIR).filter((x) => x.endsWith(".tsx"))) {
  const code = codeOnly(readFileSync(f, "utf8"));
  const calls = code.match(DASH_ACTIONS) ?? [];
  if (calls.length === 0) continue;
  dashCalls += calls.length;
  const without = calls.filter((c) => !/HERE\)$/.test(c));
  check(
    `${rel(f)}: every action call passes HERE`,
    without.length === 0,
    without.length ? `**MISSING ROUTE: ${without.join(" | ")}**` : `${calls.length} calls, all pass HERE`,
  );
  check(
    `${rel(f)}: ...and its HERE is /crm/dashboard`,
    /const HERE = "\/crm\/dashboard"/.test(code),
    /const HERE = "\/crm\/dashboard"/.test(code) ? "yes" : "**WRONG OR MISSING HERE**",
  );
}
const dashToggles = walk(DASH_DIR)
  .filter((x) => x.endsWith(".tsx"))
  .some((x) => /\btoggleTask\(/.test(codeOnly(readFileSync(x, "utf8"))));
check(
  "...and the scan found the row buttons AND the task checkboxes, so it is not vacuous",
  dashCalls >= 7 && dashToggles,
  `${dashCalls} calls${dashToggles ? ", toggleTask included" : " — **NO toggleTask FOUND**"}`,
);


const BOARD_UI = "app/crm/board/PipelineBoard.tsx";
let boardUi = "";
try { boardUi = readFileSync(join(ROOT, BOARD_UI), "utf8"); }
catch { check(BOARD_UI, false, "**FILE MISSING** — renamed? update this section"); }
if (boardUi) {
  const code = codeOnly(boardUi);
  const calls = code.match(/\b(setStage|markLost)\(([^()]|\([^()]*\))*\)/g) ?? [];
  const without = calls.filter((c) => !/HERE\)$/.test(c));
  check(
    "every board action call says it is on /crm/board",
    calls.length >= 3 && without.length === 0,
    without.length ? `**MISSING ROUTE: ${without.join(" | ")}**` : `${calls.length} calls, all pass HERE`,
  );
  check(
    "...and HERE is /crm/board",
    /const HERE = "\/crm\/board"/.test(code),
    /const HERE = "\/crm\/board"/.test(code) ? "yes" : "**WRONG OR MISSING**",
  );
}
if (crmActions) {
  check(
    "/crm/board is on the list of routes an action may refresh",
    /CRM_ROUTES[^=]*=\s*\[[^\]]*"\/crm\/board"/.test(codeOnly(crmActions)),
    /CRM_ROUTES[^=]*=\s*\[[^\]]*"\/crm\/board"/.test(codeOnly(crmActions)) ? "listed" : "**NOT LISTED**",
  );
}

/* ------------------------------------------------- the record card (§8b) */

/**
 * The record card opens over three pages, so its controls cannot hard-code a
 * HERE the way the dashboard and the board do. Instead each page hands its own
 * HERE to RecordCardSlot as `from`, and every call in the card passes `from`
 * back. Two things are checked: every call in the card ends in `from)`, and
 * every page that renders the card passes a `from` equal to its own route.
 * Either one slipping would let a card action refresh a different /crm route.
 */
console.log("\n=== 8b. The record card refreshes the page it is open on ===");

const CARD_ACTIONS =
  /\b(setStage|markLost|logContact|setSnooze|clearSnooze|setApplicationNotes|setContactField|addTask|toggleTask|deleteTask|sendText|retryText)\(([^()]|\([^()]*\))*\)/g;
const RECORD_DIR = join(ROOT, "app", "crm", "_record");
const recordFiles = walk(RECORD_DIR).filter((f) => f.endsWith(".tsx"));
check("found the record card's files", recordFiles.length >= 3, `${recordFiles.length} files`);
let cardCalls = 0;
for (const f of recordFiles) {
  const code = codeOnly(readFileSync(f, "utf8"));
  const calls = code.match(CARD_ACTIONS) ?? [];
  cardCalls += calls.length;
  const without = calls.filter((c) => !/\bfrom\)$/.test(c));
  check(
    `${rel(f)}: every action call passes the opening page's route`,
    without.length === 0,
    without.length ? `**MISSING ROUTE: ${without.join(" | ")}**` : `${calls.length} calls, all pass from`,
  );
  if (calls.length > 0) {
    check(
      `${rel(f)}: \`from\` is typed as a CrmRoute, not a free string`,
      /from:\s*CrmRoute/.test(code),
      /from:\s*CrmRoute/.test(code) ? "typed" : "**UNTYPED from**",
    );
  }
}
check("...and the card does call actions, so the check is not vacuous", cardCalls >= 10, `${cardCalls} calls`);

const slotSrc = (() => { try { return readFileSync(join(RECORD_DIR, "RecordCardSlot.tsx"), "utf8"); } catch { return ""; } })();
check(
  "the card checks staff itself, not only via its page",
  slotSrc.includes("isCrmStaff") && slotSrc.includes("getRecordCard("),
  slotSrc.includes("isCrmStaff") ? "isCrmStaff + getRecordCard (which asserts)" : "**NO STAFF CHECK**",
);

/** The route a page file serves: app/crm/board/page.tsx -> /crm/board. */
const routeOf = (f: string) => "/" + rel(f).replace(/^app\//, "").replace(/\/page\.tsx$/, "");
const cardPages = pageFiles.filter((f) => f.endsWith("page.tsx") && readFileSync(f, "utf8").includes("<RecordCardSlot"));
check("the card is on the pipeline, the board and the dashboard", cardPages.length >= 3, cardPages.map(rel).join(", "));
for (const f of cardPages) {
  const code = codeOnly(readFileSync(f, "utf8"));
  const route = routeOf(f);
  const here = /const HERE = "([^"]+)"/.exec(code)?.[1];
  const slotFrom = /<RecordCardSlot[^>]*\bfrom=\{HERE\}/.test(code);
  const provider = /<RecordCardProvider\s+here=\{HERE\}/.test(code);
  check(
    `${rel(f)} opens the card with its own route`,
    here === route && slotFrom && provider,
    here !== route ? `**HERE is ${here ?? "missing"}, page is ${route}**`
      : !slotFrom ? "**RecordCardSlot not given from={HERE}**"
        : !provider ? "**RecordCardProvider not given here={HERE}**"
          : `${route}`,
  );
  if (crmActions) {
    check(
      `  ...and ${route} is on the list of routes an action may refresh`,
      new RegExp(`CRM_ROUTES[^=]*=\\s*\\[[^\\]]*"${route.replace(/\//g, "\\/")}"`).test(codeOnly(crmActions)),
      "listed",
    );
  }
}

/**
 * PPR: searchParams is request data. Awaiting it in the page function, outside
 * any <Suspense>, fails the production build under cacheComponents — and
 * typecheck does not catch it. The card awaits it inside its own boundary.
 */
for (const f of pageFiles.filter((x) => x.endsWith("page.tsx"))) {
  const code = codeOnly(readFileSync(f, "utf8"));
  const bad = /await\s+searchParams\b/.test(code) || /\bsearchParams\)\s*\.then\b/.test(code);
  check(`${rel(f)} does not unwrap searchParams outside a boundary`, !bad, bad ? "**AWAITS searchParams IN THE PAGE**" : "clean");
}

/* ------------------------------------------------------------ carousels */

/**
 * LinkedIn carousels (24 Sep 2026). The route that draws them has two doors —
 * a staff session, or the queue token — and a third caller must get a 404.
 * A carousel is marketing copy, but the route sits under /api/crm, and the
 * next change to it should not be the one that forgets which doors exist.
 */
console.log("\n=== 9. The carousel route lets in staff and the task, nobody else ===");
const CAROUSEL_ROUTE = "app/api/crm/carousel/[id]/route.ts";
let carouselSrc = "";
try { carouselSrc = codeOnly(readFileSync(join(ROOT, CAROUSEL_ROUTE), "utf8")); }
catch { check(CAROUSEL_ROUTE, false, "**FILE MISSING** — renamed? update this section"); }
if (carouselSrc) {
  check("  the staff path checks isCrmStaff() and 404s otherwise",
    /if\s*\(\s*!\s*\(await isCrmStaff\(\)\)\s*\)\s*return NOT_FOUND\(\)/.test(carouselSrc), "guarded");
  check("  the token path goes through apiGetCarousel, which asserts the token",
    /apiGetCarousel\(/.test(carouselSrc) && !!queueSrc && /export async function apiGetCarousel[\s\S]*?assertQueueToken\(/.test(queueSrc), "guarded");
  check("  the staff read goes through the staff-only module",
    /from\s+"@\/lib\/marketing\/requests\.server"/.test(carouselSrc) && /getCarouselForStaff\(/.test(carouselSrc), "requests.server");
  check("  it never reads the database directly",
    !/from\s+"@\/lib\/db"/.test(carouselSrc) && !/\bdb\./.test(carouselSrc), "no db import");
  check("  responses are never cached by a CDN", /private, no-store/.test(carouselSrc), "private, no-store");
}
const queueRouteCode = codeOnly(queueRoute);
check("attaching a carousel cannot also change a status",
  /carouselSpec !== undefined\)\s*\{\s*if \(status\)/.test(queueRouteCode), "refused together");

/* ---------------------------------------------- BiggerPockets lead intake */

/**
 * /api/crm/lead-intake writes borrowers into the book on the strength of a
 * shared secret alone (24 Sep 2026). `proxy.ts` does not guard /api, so the
 * secret check in the route is the ONLY thing between the internet and the
 * contacts table. Four things are pinned here:
 *   1. the secret is checked, fail-closed and in constant time, BEFORE the
 *      first database access — and before anything is written;
 *   2. the body is capped before it is parsed;
 *   3. the writer module is reachable only through that route;
 *   4. the writer touches the six tables a lead needs and nothing else — no
 *      broker tables, no documents, and never a DELETE.
 */
console.log("\n=== 10. BiggerPockets intake: secret first, six tables only ===");

const INTAKE_ROUTE = "app/api/crm/lead-intake/route.ts";
const INTAKE_WRITER = "lib/leads/biggerpockets.server.ts";
let intakeRoute = "";
let intakeWriter = "";
try { intakeRoute = readFileSync(join(ROOT, INTAKE_ROUTE), "utf8"); }
catch { check(INTAKE_ROUTE, false, "**FILE MISSING** — renamed? update this section"); }
try { intakeWriter = readFileSync(join(ROOT, INTAKE_WRITER), "utf8"); }
catch { check(INTAKE_WRITER, false, "**FILE MISSING** — renamed? update this section"); }

if (intakeRoute) {
  const code = codeOnly(intakeRoute);
  const post = code.slice(code.indexOf("export async function POST"));
  const guardAt = post.search(/if\s*\(\s*!\s*secretMatches\(body\.secret\)\s*\)\s*\{?\s*(\/\/[^\n]*\s*)*return NextResponse\.json\([^)]*\{\s*status:\s*401\s*\}/);
  // Every way the handler could reach the database or the writer.
  const dbTouches = [...post.matchAll(/\b(ingestBpLeads\(|db\.|readState\()/g)].map((m) => m.index ?? -1);
  const firstDb = dbTouches.length ? Math.min(...dbTouches) : -1;
  check("  the handler checks the secret and returns 401 on a mismatch", guardAt >= 0, guardAt >= 0 ? "found" : "**NO SECRET CHECK IN POST**");
  check("  ...and it calls the writer at all, so the next check is not vacuous", firstDb >= 0, firstDb >= 0 ? "ingestBpLeads" : "**NO WRITE FOUND**");
  check("  the secret is checked BEFORE the first database access",
    guardAt >= 0 && firstDb >= 0 && guardAt < firstDb,
    guardAt >= 0 && firstDb >= 0 && guardAt < firstDb ? `check at ${guardAt}, first db use at ${firstDb}` : "**DATABASE REACHED BEFORE THE SECRET CHECK**");
  check("  the secret is CRM_SYNC_SECRET, the Gmail sync's — not a new credential",
    /process\.env\.CRM_SYNC_SECRET/.test(code) && !/process\.env\.(?!CRM_SYNC_SECRET\b)[A-Z_]*SECRET/.test(code), "CRM_SYNC_SECRET");
  check("  it fails closed when the secret is unset or short",
    /if\s*\(\s*!expected\s*\|\|\s*expected\.length\s*<\s*16\s*\)\s*return false/.test(code), "unset or < 16 chars admits nobody");
  check("  it compares in constant time", /timingSafeEqual\(/.test(code), "timingSafeEqual");
  check("  the body is capped before parsing", intakeRoute.includes("readJsonCapped(request, MAX_REQUEST_BYTES)") && !/\brequest\.json\(\)/.test(code), "capped");
  const routeImports = importsOf(intakeRoute);
  const brokerish = routeImports.filter((i) => /broker|admin\.server|invites\.server|documents/.test(i));
  check("  the route imports nothing from the broker side", brokerish.length === 0, brokerish.length ? `**IMPORTS ${brokerish.join(", ")}**` : `clean (${routeImports.length} imports)`);
}

if (intakeWriter) {
  const code = codeOnly(intakeWriter);
  const ALLOWED = ["contacts", "applications", "properties", "participants", "stageTransitions", "activities"];
  const writes = [...code.matchAll(/\.(insert|update)\(\s*schema\.(\w+)\s*\)/g)].map((m) => m[2]);
  const bad = [...new Set(writes.filter((t) => !ALLOWED.includes(t)))];
  check("  it writes only contacts/applications/properties/participants/stage_transitions/activities",
    writes.length > 0 && bad.length === 0, bad.length ? `**ALSO WRITES ${bad.join(", ")}**` : [...new Set(writes)].join(", "));
  check("  ...and it does write the application, its first stage row and the activity (not vacuous)",
    ["applications", "stageTransitions", "activities"].every((t) => writes.includes(t)), "all three");
  check("  it never deletes", !/\.delete\(/.test(code) && !/\bDELETE\s+FROM\b/i.test(code), "no delete");
  check("  no hand-written SQL writes that could bypass the list above",
    ![...code.matchAll(/\bsql`([\s\S]*?)`/g)].some((m) => /\b(INSERT|UPDATE|DELETE)\b/i.test(m[1])), "none");
  const FORBIDDEN = ["brokerUsers", "brokerFirms", "brokerInvites", "documents", "applicationProperties", "entities", "crmTasks", "contentRequests"];
  const named = FORBIDDEN.filter((t) => new RegExp(`\\bschema\\.${t}\\b`).test(code));
  check("  it never names a broker table, documents or any other table", named.length === 0, named.length ? `**NAMES ${named.join(", ")}**` : "clean");
  check("  its writes go out as one db.batch per lead, never db.transaction", /db\.batch\(/.test(code) && !/\.transaction\(/.test(code), "db.batch");
  check("  the dedup-carrying activity insert has NO on-conflict clause (it is the lock)",
    /statements\.push\(db\.insert\(schema\.activities\)\.values\(rows\.activity\)\);/.test(code), "plain insert");
  check("  it grants no SMS consent", !/smsConsent/.test(code), "none");
}

/* Only the route may reach the writer. A second importer would be a second door. */
const importersOfWriter = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib")), ...walk(join(ROOT, "scripts"))]
  .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !f.endsWith(".regress.ts"))
  .filter((f) => importsOf(readFileSync(f, "utf8")).some((i) => /biggerpockets\.server$/.test(i)))
  .map(rel);
check("the BiggerPockets writer is imported by the intake route and nothing else",
  importersOfWriter.length === 1 && importersOfWriter[0] === INTAKE_ROUTE,
  importersOfWriter.length ? importersOfWriter.join(", ") : "**NOT IMPORTED AT ALL**");


/* ------------------------------------------------------ texting (§11) */

/**
 * Texting through Quo, and Quo's webhooks (24 Sep 2026).
 *
 * CLAUDE.md: "Any automated SMS send must verify consent at the current
 * version before sending, enforced in the executor rather than in
 * configuration so it cannot be switched off." And: "Consent flows inbound
 * only." Both are easy to break in a way that looks fine — a text goes out, a
 * webhook returns 200 — so both are pinned here by reading the source:
 *
 *   1. the executor calls canText(…, CONSENT_VERSION) and bails on a refusal
 *      BEFORE it hands anything to the provider, on both the send and the
 *      retry path; the provider is called from one private function only;
 *   2. nothing else can reach Quo's send endpoint: the client is imported by
 *      the executor alone, and no other file names the API;
 *   3. the webhook route verifies the signature before it parses the body or
 *      touches the database, and 401s on failure;
 *   4. the webhook writer only ever REVOKES: it sets smsOptedOut to true and
 *      touches no other consent column;
 *   5. the Quo client is server-only and never logs, and its key goes out as
 *      Quo documents it (no "Bearer");
 *   6. the new actions assert staff (section 2 does that automatically) and
 *      refresh one route through a CrmRoute-typed list.
 */
console.log("\n=== 11. Texting: consent in the executor, signatures first, consent inbound only ===");

const readOr = (p: string): string => {
  try { return readFileSync(join(ROOT, p), "utf8"); }
  catch { check(p, false, "**FILE MISSING** — renamed? update section 11"); return ""; }
};
const EXECUTOR = "lib/comms/outbox.server.ts";
const QUO_CLIENT = "lib/comms/quo.server.ts";
const HOOK_WRITER = "lib/comms/quoWebhook.server.ts";
const HOOK_ROUTE = "app/api/webhooks/quo/route.ts";
const COMMS_ACTIONS = "app/crm/commsActions.ts";
const executorSrc = readOr(EXECUTOR);
const clientSrc = readOr(QUO_CLIENT);
const hookSrc = readOr(HOOK_WRITER);
const hookRouteSrc = readOr(HOOK_ROUTE);
const commsSrc = readOr(COMMS_ACTIONS);

/** A top-level function's body, by name — exported or not. */
function fnBody(src: string, name: string): string | null {
  const m = new RegExp(`(?:export\\s+)?async\\s+function\\s+${name}\\s*\\(`).exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + 1);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/);
  return next < 0 ? src.slice(m.index) : src.slice(m.index, m.index + 1 + next);
}

if (executorSrc) {
  const code = codeOnly(executorSrc);
  for (const name of ["executeSendText", "executeRetryText"]) {
    const body = fnBody(code, name) ?? "";
    const gateAt = body.search(/\bcanText\(\s*[^)]*\{\s*currentVersion:\s*CONSENT_VERSION\s*\}\s*\)/);
    const bailAt = body.search(/if\s*\(\s*!gate\.ok\s*\)\s*\{[\s\S]*?return\b/);
    const sendAt = body.search(/\bdeliver\(/);
    check(`  ${EXECUTOR} :: ${name} exists and sends`, body.length > 0 && sendAt >= 0, body ? (sendAt >= 0 ? "calls deliver()" : "**NEVER SENDS?**") : "**NOT FOUND**");
    check(`  ${name} runs canText(…, { currentVersion: CONSENT_VERSION })`, gateAt >= 0, gateAt >= 0 ? "at the current version" : "**NO CONSENT GATE AT CONSENT_VERSION**");
    check(`  ${name} returns on a refusal before the provider is reached`,
      gateAt >= 0 && bailAt > gateAt && sendAt > bailAt,
      gateAt >= 0 && bailAt > gateAt && sendAt > bailAt ? `gate ${gateAt} < bail ${bailAt} < send ${sendAt}` : "**GATE MISSING, OR AFTER THE SEND**");
  }
  const deliverBody = fnBody(code, "deliver") ?? "";
  check("  deliver() takes a TextPermit — only canText() makes one", /function\s+deliver\([^)]*permit:\s*TextPermit/.test(code), "typed");
  check("  deliver() is NOT exported (the two executors are the only doors)", !/export\s+async\s+function\s+deliver\b/.test(code), "private");
  const sendCalls = [...code.matchAll(/\b(?:d\.send|quoSend)\(/g)].map((m) => m.index ?? -1);
  const deliverStart = code.indexOf(deliverBody);
  check("  the provider is called in exactly one place, inside deliver()",
    sendCalls.length === 1 && deliverBody.length > 0 && sendCalls[0] >= deliverStart && sendCalls[0] < deliverStart + deliverBody.length,
    `${sendCalls.length} call(s)`);
  check("  the consent version is the constant from lib/consent, not a literal",
    /import\s*\{\s*CONSENT_VERSION\s*\}\s*from\s*"@\/lib\/consent"/.test(executorSrc) && !/currentVersion:\s*["'`]/.test(code), "CONSENT_VERSION");
  check("  writes go out through db.batch, never db.transaction", /\.batch\(/.test(code) && !/\.transaction\(/.test(code), "db.batch");
}

if (clientSrc) {
  const code = codeOnly(clientSrc);
  check(`  ${QUO_CLIENT} is server-only`, /^\s*import\s+"server-only";/m.test(clientSrc), "import \"server-only\"");
  check("  ...never logs anything (a log line is how a key or a borrower's number leaks)", !/\bconsole\.\w+\(/.test(code), "no console");
  check("  ...sends the key as Quo documents it: Authorization: <key>, no Bearer", /Authorization:\s*apiKey\b/.test(code) && !/Bearer/i.test(code), "raw key header");
  check("  ...never puts the key in a message", !/\$\{\s*apiKey\s*\}/.test(code) && !/error:[^\n]*apiKey/.test(code), "not interpolated");
  check("  ...takes a TextPermit as its first argument", /export\s+async\s+function\s+quoSend\(\s*permit:\s*TextPermit/.test(code), "permit");
  check("  ...times out (8 s) rather than hanging an action", /QUO_TIMEOUT_MS\s*=\s*8000/.test(code) && /AbortController/.test(code), "8 s");
  check("  ...reads no table", !/from\s+"@\/lib\/db/.test(clientSrc), "no db import");
}

/* Only the executor may import the client; only the actions may import the executor. */
const allSource = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib")), ...walk(join(ROOT, "scripts")), ...walk(join(ROOT, "components"))]
  .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !f.endsWith(".regress.ts"));
const importersOf = (re: RegExp) => allSource.filter((f) => importsOf(readFileSync(f, "utf8")).some((i) => re.test(i))).map(rel);
const clientImporters = importersOf(/(^|\/)quo\.server$/);
check("the Quo client is imported by the executor and nothing else",
  clientImporters.length === 1 && clientImporters[0] === EXECUTOR, clientImporters.join(", ") || "**NOT IMPORTED**");
const executorImporters = importersOf(/(^|\/)outbox\.server$/);
check("the executor is imported by app/crm/commsActions.ts and nothing else",
  executorImporters.length === 1 && executorImporters[0] === COMMS_ACTIONS, executorImporters.join(", ") || "**NOT IMPORTED**");
const hookImporters = importersOf(/(^|\/)quoWebhook\.server$/);
check("the webhook writer is imported by its route and nothing else",
  hookImporters.length === 1 && hookImporters[0] === HOOK_ROUTE, hookImporters.join(", ") || "**NOT IMPORTED**");
const namesApi = allSource.filter((f) => rel(f) !== QUO_CLIENT && /api\.(openphone|quo)\.com/.test(codeOnly(readFileSync(f, "utf8")))).map(rel);
check("no other file talks to Quo's API directly (a second sender would skip the gate)", namesApi.length === 0, namesApi.join(", ") || "none");

if (hookRouteSrc) {
  const code = codeOnly(hookRouteSrc);
  const post = code.slice(code.indexOf("export async function POST"));
  const verifyAt = post.search(/verifyQuoSignature\(/);
  const rejectAt = post.search(/if\s*\(\s*!verdict\.ok\s*\)\s*\{[\s\S]*?status:\s*401/);
  const firstTouch = [...post.matchAll(/\b(handleQuoEvent\(|db\.|JSON\.parse\(|parseQuoEvent\()/g)].map((m) => m.index ?? -1);
  const touch = firstTouch.length ? Math.min(...firstTouch) : -1;
  check(`  ${HOOK_ROUTE} verifies the signature and 401s on failure`, verifyAt >= 0 && rejectAt > verifyAt, verifyAt >= 0 ? "verify + 401" : "**NO SIGNATURE CHECK**");
  check("  ...BEFORE parsing the body or touching the database",
    rejectAt >= 0 && touch > rejectAt, touch > rejectAt && rejectAt >= 0 ? `401 at ${rejectAt}, first use at ${touch}` : "**BODY OR DATABASE REACHED BEFORE THE SIGNATURE CHECK**");
  check("  ...with the secret from QUO_WEBHOOK_SECRET", /process\.env\.QUO_WEBHOOK_SECRET/.test(code), "QUO_WEBHOOK_SECRET");
  check("  ...reading a capped body, never request.json()", /readTextCapped\(request,\s*MAX_BODY_BYTES\)/.test(code) && !/\brequest\.(json|text)\(\)/.test(code), "capped");
  check("  ...and never reads the database itself", !/from\s+"@\/lib\/db"/.test(hookRouteSrc), "through the writer only");
}

if (hookSrc) {
  const code = codeOnly(hookSrc);
  const grants = ["smsConsentAt", "smsConsentVersion", "emailSubscribed", "sms_consent", "email_subscribed"].filter((w) => code.includes(w));
  check(`  ${HOOK_WRITER} never writes consent granted or email status`, grants.length === 0, grants.length ? `**NAMES ${grants.join(", ")}**` : "clean");
  const optOutWrites = [...code.matchAll(/smsOptedOut\s*:\s*([^,}\s]+)/g)].map((m) => m[1]);
  check("  ...its only consent write sets smsOptedOut to TRUE (inbound STOP), never false",
    optOutWrites.length > 0 && optOutWrites.every((v) => v === "true"), optOutWrites.length ? optOutWrites.join(", ") : "**NO OPT-OUT WRITE — STOP IS IGNORED?**");
  check("  ...and no hand-written SQL touches sms_opted_out", !/sms_opted_out/i.test(code), "none");
  check("  ...the claim is INSERT … ON CONFLICT DO NOTHING on (provider, event_id)",
    /onConflictDoNothing\(\{\s*target:\s*\[webhookEvents\.provider,\s*webhookEvents\.eventId\]\s*\}\)/.test(code), "event-id claim");
  check("  ...it never calls out to Quo or anyone else from inside the handler", !/\bfetch\(/.test(code) && !/quo\.server/.test(code), "no outbound calls");
}

if (commsSrc) {
  const code = codeOnly(commsSrc);
  check(`  ${COMMS_ACTIONS} refreshes through a CrmRoute-typed list`, /const COMMS_ROUTES:\s*readonly CrmRoute\[\]/.test(code) && /function revalidateFrom\(/.test(code), "typed list");
  for (const name of ["sendText", "retryText"]) {
    const body = fnBody(code, name) ?? "";
    const n = (body.match(/revalidatePath\(|revalidateFrom\(/g) ?? []).length;
    check(`  ${name} refreshes at most one route, through the list`, body.length > 0 && n <= 1 && !body.includes("revalidatePath("), `${n} refresh call(s)`);
  }
}

const proxySrc = readOr("proxy.ts");
if (proxySrc) {
  const guarded = /isGuardedRoute\s*=\s*createRouteMatcher\(\[([\s\S]*?)\]\)/.exec(codeOnly(proxySrc))?.[1] ?? "";
  check("/api/webhooks/quo is reachable by Quo (not behind Clerk in proxy.ts)", guarded.length > 0 && !/"\/api/.test(guarded), "not guarded — the signature is the lock");
}

/* --------------------------------------------------- daily blog cron (§12) */

/**
 * The 7am blog runs as a Vercel cron since 25 Sep 2026 (the scheduled Claude
 * task was blocked for carrying the queue token out of a Drive file). The route
 * holds an Anthropic API key and the queue token, and /api is not behind Clerk,
 * so CRON_SECRET is the only lock. Pinned:
 *   1. the secret is checked, fail-closed and in constant time, BEFORE any
 *      outbound call or environment read of the other secrets;
 *   2. it reaches the queue only through the HTTP API, never the database,
 *      so draft.ts and the transition rules keep deciding what lands;
 *   3. it can never mark anything published.
 */
console.log("\n=== 12. Daily blog cron: secret first, queue API only, never publishes ===");
const CRON_ROUTE = "app/api/cron/daily-blog/route.ts";
let cronSrc = "";
try { cronSrc = codeOnly(readFileSync(join(ROOT, CRON_ROUTE), "utf8")); }
catch { check(CRON_ROUTE, false, "**FILE MISSING** — renamed? update this section"); }
if (cronSrc) {
  const get = cronSrc.slice(cronSrc.indexOf("export async function GET"));
  const gate = get.search(/if\s*\(\s*!tokenOk\(bearerFrom\(request\.headers\.get\("authorization"\)\),\s*process\.env\.CRON_SECRET\)\)/);
  const firstUse = [...get.matchAll(/\b(fetch\(|queue\(|converse\(|process\.env\.(CONTENT_QUEUE_TOKEN|ANTHROPIC_API_KEY))/g)].map((m) => m.index ?? -1);
  const first = firstUse.length ? Math.min(...firstUse) : -1;
  check("  CRON_SECRET is checked with tokenOk (fail-closed, constant time)", gate >= 0, gate >= 0 ? "tokenOk" : "**NO SECRET CHECK**");
  check("  ...before any outbound call or secret read", gate >= 0 && first > gate, `gate at ${gate}, first use at ${first}`);
  check("  ...and a failed check is a 401", /Not authorised\."\s*\},\s*\{\s*status:\s*401/.test(get), "401");
  check("  it never imports the database", !/from\s+"@\/lib\/db/.test(cronSrc) && !/queue\.api\.server|requests\.server/.test(cronSrc), "HTTP only");
  check("  it never sends status published", !/status:\s*"published"/.test(cronSrc) && !/"published"/.test(cronSrc), "claim, draft, fail only");
  check("  it never logs a secret", !/console\.\w+\([^)]*(apiKey|queueToken|CRON_SECRET)/.test(cronSrc), "clean");
}
const vercelJson = readOr("vercel.json");
check("vercel.json schedules the daily blog cron",
  !!vercelJson && /"path":\s*"\/api\/cron\/daily-blog"/.test(vercelJson), vercelJson ? "scheduled" : "**NO vercel.json**");


/* ------------------------------------------------ email from the record card */

/**
 * Sending as Luis through Gmail (25 Sep 2026). A refresh token is a standing
 * key to his mailbox, and /api is not behind Clerk, so every door is pinned.
 */
console.log("\n=== 13. Email: gate before Gmail, own mailbox only, token encrypted, staff-only doors ===");
{
  const EX = "lib/comms/emailOutbox.server.ts";
  const GC = "lib/comms/gmail.server.ts";
  const MB = "lib/comms/mailbox.server.ts";
  const ACT = "app/crm/emailActions.ts";
  const CONNECT = "app/api/crm/google/connect/route.ts";
  const CALLBACK = "app/api/crm/google/callback/route.ts";
  const exSrc = readOr(EX), gcSrc = readOr(GC), mbSrc = readOr(MB), actSrc = readOr(ACT), conSrc = readOr(CONNECT), cbSrc = readOr(CALLBACK);

  if (exSrc) {
    const body = fnBody(codeOnly(exSrc), "executeSendEmail") ?? "";
    const gateAt = body.search(/\bcanEmail\(/);
    const bailAt = body.search(/if\s*\(\s*!gate\.ok\s*\)\s*\{[\s\S]*?return\b/);
    const sendAt = body.search(/\bsendMessage\(/);
    check(`  ${EX} :: executeSendEmail runs canEmail() on a fresh read`, gateAt >= 0, gateAt >= 0 ? "gate" : "**NO EMAIL GATE**");
    check("  ...and returns on a refusal before Gmail is called", gateAt >= 0 && bailAt > gateAt && sendAt > bailAt, `gate ${gateAt} < bail ${bailAt} < send ${sendAt}`);
    check("  Gmail's send is called exactly once in the executor", (codeOnly(exSrc).match(/\bsendMessage\(/g) ?? []).length === 1, "one call");
    check("  the activity is keyed like the Gmail sync (gmailDedupKey), so the two never double up", /dedupKey:\s*gmailDedupKey\(/.test(codeOnly(exSrc)), "gmailDedupKey");
    check("  the sender is the request's userEmail (from Clerk), never a field of the draft", /const fromEmail = req\.userEmail/.test(codeOnly(exSrc)), "req.userEmail");
    check("  writes go out through db.batch, never db.transaction", /\.batch\(/.test(exSrc) && !/\.transaction\(/.test(codeOnly(exSrc)), "db.batch");
  }
  if (actSrc) {
    const code = codeOnly(actSrc);
    check(`  ${ACT} takes the sender from signedInUser(), not from the browser`, /signedInUser\(\)/.test(code) && /userEmail:\s*me\.email/.test(code), "Clerk");
    const sendBody = fnBody(code, "sendEmail") ?? "";
    check("  sendEmail has no from-address parameter", !/fromEmail|senderEmail/.test(sendBody.split(")")[0] ?? ""), "none");
    const n = (sendBody.match(/revalidatePath\(|revalidateFrom\(/g) ?? []).length;
    check("  sendEmail refreshes at most one route, through the typed list", n <= 1 && !sendBody.includes("revalidatePath(") && /const EMAIL_ROUTES:\s*readonly CrmRoute\[\]/.test(code), `${n} refresh call(s)`);
  }
  if (gcSrc) {
    const code = codeOnly(gcSrc);
    check(`  ${GC} is server-only`, /^\s*import\s+"server-only";/m.test(gcSrc), "server-only");
    check("  ...never logs (tokens and addresses leak through logs)", !/\bconsole\.\w+\(/.test(code), "no console");
    check("  ...reads no table", !/from\s+"@\/lib\/db/.test(gcSrc), "no db import");
    check("  ...times out every call", /AbortSignal\.timeout\(GOOGLE_TIMEOUT_MS\)/.test(code), "timeout");
  }
  if (mbSrc) {
    const code = codeOnly(mbSrc);
    check(`  ${MB} encrypts before storing the refresh token`, /encryptToken\(p\.refreshToken/.test(code) && /refresh_token_enc/.test(code), "encryptToken");
    check("  ...never logs", !/\bconsole\.\w+\(/.test(code), "no console");
    check("  ...fails closed without GMAIL_TOKEN_KEY", /if \(!key\) return \{ ok: false/.test(code), "no key, no store");
  }
  for (const [p, src] of [[CONNECT, conSrc], [CALLBACK, cbSrc]] as const) {
    if (!src) continue;
    const get = codeOnly(src).slice(codeOnly(src).indexOf("export async function GET"));
    const first = get.indexOf("{") + 1;
    const staffAt = get.search(/if\s*\(\s*!\(await isCrmStaff\(\)\)\)\s*return new NextResponse\(null,\s*\{\s*status:\s*404/);
    const firstOther = get.slice(first).search(/\b(await|request\.|process\.env)/);
    check(`  ${p} checks staff first (404 otherwise)`, staffAt >= 0 && staffAt <= first + firstOther + 10, staffAt >= 0 ? "first" : "**NO STAFF CHECK**");
  }
  if (cbSrc) {
    const code = codeOnly(cbSrc);
    const stateAt = code.search(/sameState\(q\.get\("state"\),\s*flow\.state\)/);
    const exchangeAt = code.search(/exchangeCode\(/);
    const matchAt = code.search(/signedIn !== mailbox/);
    const saveAt = code.search(/saveMailConnection\(/);
    check("  the callback checks state before trading the code", stateAt >= 0 && exchangeAt > stateAt, `${stateAt} < ${exchangeAt}`);
    check("  ...and refuses a mailbox that is not the signed-in address before storing anything", matchAt > 0 && saveAt > matchAt, `${matchAt} < ${saveAt}`);
  }
  const execImporters = importersOf(/(^|\/)emailOutbox\.server$/);
  check("the email executor is imported by app/crm/emailActions.ts and nothing else", execImporters.length === 1 && execImporters[0] === ACT, execImporters.join(", ") || "**NOT IMPORTED**");
  const gcImporters = importersOf(/(^|\/)gmail\.server$/).sort();
  check("the Google client is imported by the executor and the callback only", JSON.stringify(gcImporters) === JSON.stringify([CALLBACK, EX].sort()), gcImporters.join(", "));
  const mbImporters = importersOf(/(^|\/)mailbox\.server$/).sort();
  check("the mailbox store is imported by the executor and the callback only", JSON.stringify(mbImporters) === JSON.stringify([CALLBACK, EX].sort()), mbImporters.join(", "));
  const talksToGoogle = allSource.filter((f) => rel(f) !== GC && /(gmail|oauth2)\.googleapis\.com/.test(codeOnly(readFileSync(f, "utf8")))).map(rel);
  check("no other file calls Gmail or Google's token endpoint (a second sender would skip the gate)", talksToGoogle.length === 0, talksToGoogle.join(", ") || "none");
}

/* -------------------------------------------------------- lead nurturing */

/**
 * Lead nurturing through Klaviyo (26 Sep 2026). Marketing email to hundreds of
 * people is where a consent mistake stops being one email and becomes a list.
 */
console.log("\n=== 14. Nurture: cron secret first, Klaviyo can never subscribe, consent only ever revoked ===");
{
  const ROUTE = "app/api/cron/nurture/route.ts";
  const SYNC = "lib/nurture/sync.server.ts";
  const KC = "lib/comms/klaviyo.server.ts";
  const ACT = "app/crm/nurture/actions.ts";
  const routeSrc = readOr(ROUTE), syncSrc = readOr(SYNC), kcSrc = readOr(KC), actSrc = readOr(ACT);

  if (routeSrc) {
    const get = codeOnly(routeSrc).slice(codeOnly(routeSrc).indexOf("export async function GET"));
    const gate = get.search(/if\s*\(\s*!tokenOk\(bearerFrom\(request\.headers\.get\("authorization"\)\),\s*process\.env\.CRON_SECRET\)\)/);
    const work = get.search(/runNurtureSync\(/);
    check(`  ${ROUTE} checks CRON_SECRET with tokenOk`, gate >= 0, gate >= 0 ? "tokenOk" : "**NO SECRET CHECK**");
    check("  ...before any work", gate >= 0 && work > gate, `gate ${gate} < work ${work}`);
    check("  ...and a failed check is a 401", /Not authorised\."\s*\},\s*\{\s*status:\s*401/.test(get), "401");
  }
  check("vercel.json schedules the nurture cron", /"path":\s*"\/api\/cron\/nurture"/.test(readOr("vercel.json")), "scheduled");

  if (kcSrc) {
    const code = codeOnly(kcSrc);
    const forbidden = code.match(/profile-subscription|subscription-bulk|\/subscribe|unsuppress|suppression-bulk|push-token|\/events\b|"subscriptions"\s*:/gi) ?? [];
    check(`  ${KC} has no subscribe / unsuppress / consent call`, forbidden.length === 0, forbidden.length ? `**FOUND ${forbidden.join(", ")}**` : "none");
    check("  ...is server-only", /^\s*import\s+"server-only";/m.test(kcSrc), "server-only");
    check("  ...never logs (keys and addresses leak through logs)", !/\bconsole\.\w+\(/.test(code), "no console");
    check("  ...reads no table", !/from\s+"@\/lib\/db/.test(kcSrc), "no db import");
    check("  ...times out every call", /AbortSignal\.timeout\(KLAVIYO_TIMEOUT_MS\)/.test(code), "timeout");
    check("  ...pins Klaviyo's API revision", /revision:\s*KLAVIYO_REVISION/.test(code), "revision");
  }
  if (syncSrc) {
    const code = codeOnly(syncSrc);
    const consentWrites = code.match(/email_subscribed\s*=\s*\w+/g) ?? [];
    check(`  ${SYNC} writes email_subscribed only as false`, consentWrites.length >= 1 && consentWrites.every((w) => /=\s*false$/.test(w)), consentWrites.join(" | ") || "**NO MIRROR?**");
    check("  ...touches no other consent column", !/sms_consent|sms_opted_out|smsConsent|smsOptedOut|emailSubscribed:\s*true/.test(code), "clean");
    const tables = [...new Set((code.match(/(?:INSERT INTO|(?<!FOR )UPDATE)\s+(\w+)/g) ?? []).map((m) => m.split(/\s+/).pop()))].sort();
    check("  ...writes only nurture_enrollments, activities and contacts", JSON.stringify(tables) === JSON.stringify(["activities", "contacts", "nurture_enrollments"]), tables.join(", "));
    check("  ...runs the auto-stop before any Klaviyo call", (fnBody(code, "runNurtureSync") ?? "").search(/applyAutoStops\(/) >= 0 && (fnBody(code, "runNurtureSync") ?? "").search(/applyAutoStops\(/) < (fnBody(code, "runNurtureSync") ?? "").search(/drain\(/), "stops first");
    check("  ...re-checks consent on a fresh read before adding anyone", /person\.emailSubscribed === false/.test(code), "fresh read");
    check("  ...never uses db.transaction", !/\.transaction\(/.test(code), "db.batch");
  }
  if (actSrc) {
    const code = codeOnly(actSrc);
    const n = (code.match(/revalidatePath\(/g) ?? []).length;
    check(`  ${ACT} refreshes only /crm/nurture`, /const HERE = "\/crm\/nurture"/.test(code) && (code.match(/revalidatePath\(HERE\)/g) ?? []).length === n, `${n} refresh call(s)`);
  }
  const kcImporters = importersOf(/(^|\/)klaviyo\.server$/);
  check("the Klaviyo client is imported by the nurture sync and nothing else", kcImporters.length === 1 && kcImporters[0] === SYNC, kcImporters.join(", ") || "**NOT IMPORTED**");
  const talksToKlaviyo = allSource.filter((f) => rel(f) !== KC && /a\.klaviyo\.com\/api/.test(codeOnly(readFileSync(f, "utf8")))).map(rel);
  check("no other file calls Klaviyo's API (a second client would skip these rules)", talksToKlaviyo.length === 0, talksToKlaviyo.join(", ") || "none");
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
