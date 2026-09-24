/**
 * Guards for the portal UI upgrade (component kit, ⌘K command bar, pro tables).
 *
 * A SEPARATE SUITE ON PURPOSE. lib/crm/guards.regress.ts is the census of every
 * staff-only surface and is edited by other work in flight; this file adds the
 * checks the UI upgrade introduced without touching it. Same method — read the
 * source, assert the convention — and the same rule learned there: negative
 * checks run on `codeOnly()` (comments stripped), positive checks on the raw
 * source, and every check here was watched failing before it was trusted.
 *
 * What it pins:
 *   1. /api/crm/search asserts staff BEFORE it reads the query or touches the
 *      database, and a non-staff caller gets a bare 404.
 *   2. The search SQL reads four tables — applications, participants,
 *      contacts, properties — and nothing on the broker side, and never writes.
 *   3. It caps results at 20, in the SQL and again after merging.
 *   4. Only the route runs the search SQL; no browser code can import it.
 *   5. The palette only calls the route when the SERVER said this is staff.
 *   6. The component kit is server-safe except the four pieces that need state.
 *   7. The tables' stage moves go through setStage / markLost with their own route.
 *   8. cmdk and TanStack Table load only inside the signed-in product.
 *
 * Run: npx tsx lib/crm/guards.ui.regress.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SEARCH_LIMIT, mergeResults } from "./search";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const ROOT = process.cwd();
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p: string): string => {
  try { return readFileSync(join(ROOT, p), "utf8"); } catch { return ""; }
};
function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next") continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}
/** Comments out — for MUST-NOT-CONTAIN checks only (see guards.regress.ts §4). */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const importsOf = (src: string): string[] =>
  [...src.matchAll(/^\s*import\s[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);

/* ------------------------------------------------------------------ 1 */
console.log("\n=== 1. /api/crm/search asserts staff first, and 404s everyone else ===");
const ROUTE = "app/api/crm/search/route.ts";
const route = read(ROUTE);
check("the route exists", route.length > 0, route ? ROUTE : "**MISSING** — renamed? update this suite");
if (route) {
  const code = codeOnly(route);
  const exported = [...code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
  check("it answers GET and nothing else", exported.length === 1 && exported[0] === "GET", exported.join(", ") || "none");
  const get = code.slice(code.indexOf("export async function GET"));
  const guard = get.search(/if\s*\(\s*!\s*\(\s*await\s+isCrmStaff\(\)\s*\)\s*\)\s*return\s+NOT_FOUND\(\)/);
  const firstTouch = Math.min(
    ...[/\bdb\./, /searchParams/, /\brequest\.(?!nextUrl\b)\w+|\brequest\.nextUrl/, /SearchSql\(/, /mergeResults\(/]
      .map((re) => get.search(re))
      .filter((i) => i >= 0),
  );
  check("it checks isCrmStaff() and returns NOT_FOUND when false", guard >= 0, guard >= 0 ? "found" : "**NO STAFF CHECK**");
  check("...and does it BEFORE reading the query or touching the database",
    guard >= 0 && Number.isFinite(firstTouch) && guard < firstTouch,
    guard >= 0 && guard < firstTouch ? `check at ${guard}, first use at ${firstTouch}` : "**DATA TOUCHED BEFORE THE CHECK**");
  check("NOT_FOUND is a 404 (the route does not advertise itself)", /const NOT_FOUND = \(\) => new NextResponse\(null, \{ status: 404 \}\)/.test(code), "404");
  check("the staff check is lib/crm/access's, not a local rule", importsOf(route).includes("@/lib/crm/access"), "@/lib/crm/access");
  const bad = importsOf(route).filter((i) => /broker|admin\.server|invites\.server|provision/.test(i));
  check("it imports nothing from the broker side", bad.length === 0, bad.length ? `**IMPORTS ${bad.join(", ")}**` : `clean (${importsOf(route).length} imports)`);
  check("responses are never cached", /"cache-control":\s*"private, no-store"/.test(code), "private, no-store");
  check("no transaction (neon-http has none)", !/\.transaction\(/.test(code), "db.batch only");
}

/* ------------------------------------------------------------------ 2 */
console.log("\n=== 2. The search SQL reads four tables and nothing on the broker side ===");
const SQLF = "lib/crm/searchSql.ts";
const sqlSrc = read(SQLF);
check("the SQL module exists", sqlSrc.length > 0, sqlSrc ? SQLF : "**MISSING**");
if (sqlSrc) {
  const code = codeOnly(sqlSrc);
  const tables = new Set([...code.matchAll(/\b(?:FROM|JOIN)\s+(?!LATERAL\b)([a-z_]+)/gi)].map((m) => m[1].toLowerCase()));
  const ALLOWED = ["applications", "participants", "contacts", "properties"];
  const extra = [...tables].filter((t) => !ALLOWED.includes(t));
  check("FROM/JOIN name only applications, participants, contacts, properties",
    tables.size > 0 && extra.length === 0, extra.length ? `**ALSO READS ${extra.join(", ")}**` : [...tables].sort().join(", "));
  const FORBIDDEN = ["broker_users", "broker_firms", "broker_invites", "documents", "activities", "crm_tasks",
    "content_requests", "stage_transitions", "application_properties", "entities", "brokerUsers", "brokerFirms"];
  const named = FORBIDDEN.filter((t) => new RegExp(`\\b${t}\\b`).test(code));
  check("no broker table, documents, activities or tasks is even named", named.length === 0, named.length ? `**NAMES ${named.join(", ")}**` : "clean");
  check("nothing in it writes", !/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/.test(code), "read-only");
  check("it builds statements only — it does not import the database client", !importsOf(sqlSrc).some((i) => i === "@/lib/db" || i.endsWith("/db")), "no db import");
  check("one contact per application (LATERAL … LIMIT 1)", /LEFT JOIN LATERAL[\s\S]*?LIMIT 1\s*\)\s*c ON true/.test(code), "lateral");
  check("no value is spliced in raw except the constant limit",
    [...code.matchAll(/sql\.raw\(([^)]*\))/g)].every((m) => /String\(SEARCH_LIMIT\)/.test(m[1])),
    [...code.matchAll(/sql\.raw\(([^)]*\))/g)].map((m) => m[1]).join(" | ") || "none");
}

/* ------------------------------------------------------------------ 3 */
console.log("\n=== 3. Results are capped at 20 ===");
check("SEARCH_LIMIT is at most 20", SEARCH_LIMIT <= 20, String(SEARCH_LIMIT));
if (sqlSrc) {
  const limits = [...codeOnly(sqlSrc).matchAll(/LIMIT \$\{sql\.raw\(String\(SEARCH_LIMIT\)\)\}/g)].length;
  check("both statements end LIMIT SEARCH_LIMIT", limits === 2, `${limits} of 2`);
}
const row = (i: number) => ({ application_id: `a${i}`, contact_id: `c${i}`, first_name: "A", last_name: String(i), stage: "lead" });
const person = (i: number) => ({ contact_id: `p${i}`, first_name: "P", last_name: String(i), email: `p${i}@x.com` });
const merged = mergeResults(Array.from({ length: 100 }, (_, i) => row(i)), Array.from({ length: 100 }, (_, i) => person(i)), 1000);
check("the merged list is capped even if the SQL were not", merged.length === SEARCH_LIMIT, `${merged.length} from 200 rows, limit 1000 asked`);
if (route) check("the route returns mergeResults' list, not the raw rows", /results:\s*mergeResults\(/.test(codeOnly(route)), "mergeResults");

/* ------------------------------------------------------------------ 4 */
console.log("\n=== 4. Only the route runs the search SQL; no browser code can reach it ===");
const sources = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib")), ...walk(join(ROOT, "components")), ...walk(join(ROOT, "scripts"))]
  .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !f.endsWith(".regress.ts"));
const importers = sources.filter((f) => importsOf(readFileSync(f, "utf8")).some((i) => /(^|\/)searchSql$/.test(i))).map(rel);
check("searchSql is imported by the search route and nothing else", importers.length === 1 && importers[0] === ROUTE, importers.join(", ") || "**NOT IMPORTED**");
const clientFiles = sources.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
const clientDb = clientFiles.filter((f) => importsOf(readFileSync(f, "utf8")).some((i) => i === "@/lib/db" || /searchSql$|\.server$/.test(i))).map(rel);
check(`no "use client" file imports the database, the search SQL or a .server module`, clientDb.length === 0, clientDb.length ? `**${clientDb.join(", ")}**` : `${clientFiles.length} client files checked`);

/* ------------------------------------------------------------------ 5 */
console.log("\n=== 5. The palette searches only when the server said staff ===");
const palette = read("components/workspace/CommandPalette.tsx");
const shell = read("components/workspace/WorkspaceShell.tsx");
const nav = read("components/workspace/WorkspaceNav.tsx");
check("the palette's search is switched by canSearch", /const searching = canSearch &&/.test(codeOnly(palette)), /const searching = canSearch &&/.test(codeOnly(palette)) ? "canSearch &&" : "**UNCONDITIONAL**");
check("...and the fetch sits behind that switch", (() => {
  const c = codeOnly(palette);
  const guard = c.indexOf("if (!searching)");
  const fetchAt = c.indexOf("fetch(`/api/crm/search");
  return guard >= 0 && fetchAt > guard;
})(), "if (!searching) return; … fetch");
check("the palette calls no other API", [...codeOnly(palette).matchAll(/fetch\(`?["']?(\/api\/[^?`"']+)/g)].every((m) => m[1] === "/api/crm/search"), "only /api/crm/search");
check("the shell takes canSearch from the server-side staff gate",
  /canSearch=\{entitlement\.lendingOs\}/.test(shell) && /resolveEntitlement\(\)/.test(shell), "resolveEntitlement().lendingOs");
check("the nav never decides canSearch itself (it only receives it)", !/canSearch\s*=\s*(true|user|isCrm)/.test(codeOnly(nav)) && /canSearch = false/.test(nav), "prop, default false");
const navServer = read("lib/workspace/nav.server.ts");
check("the entitlement comes from isCrmStaff(), the one staff gate", /if \(await isCrmStaff\(\)\) return \{ lendingOs: true/.test(navServer), "isCrmStaff");

/* ------------------------------------------------------------------ 6 */
console.log("\n=== 6. The kit is server-safe except the pieces that hold state ===");
const CLIENT_OK = new Set(["dialog.tsx", "dropdown-menu.tsx", "tabs.tsx", "toast.tsx"]);
const kit = walk(join(ROOT, "components", "ui")).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
check("found the kit", kit.length >= 12, `${kit.length} files`);
for (const f of kit) {
  const name = f.split(/[\\/]/).pop()!;
  const src = readFileSync(f, "utf8");
  const isClient = /^\s*["']use client["']/.test(src);
  const hooks = /\buse(State|Effect|Ref|Id|Context|SyncExternalStore|Transition|Memo|Callback)\(/.test(codeOnly(src));
  if (CLIENT_OK.has(name)) check(`  ${rel(f)} is a client component (it needs state)`, isClient, isClient ? "use client" : "**MISSING use client**");
  else check(`  ${rel(f)} is server-safe`, !isClient && !hooks, isClient ? "**use client — ships JS for nothing**" : hooks ? "**USES A HOOK**" : "no JS");
  const reach = importsOf(src).filter((i) => i === "@/lib/db" || /\.server$|access$|scope$/.test(i));
  check(`  ${rel(f)} reads no data`, reach.length === 0, reach.length ? `**IMPORTS ${reach.join(", ")}**` : "clean");
}

/* ------------------------------------------------------------------ 7 */
console.log("\n=== 7. Table stage moves use the existing actions, with their own route ===");
const ACTION_CALL = /\b(setStage|markLost|setApplicationNotes|setContactField|logContact|setSnooze|clearSnooze|addTask|toggleTask|deleteTask)\(([^()]|\([^()]*\))*\)/g;
for (const [file, route] of [["app/crm/PipelineTable.tsx", "/crm"], ["app/crm/contacts/ContactsTable.tsx", "/crm/contacts"]] as const) {
  const src = read(file);
  if (!src) { check(file, false, "**MISSING**"); continue; }
  const code = codeOnly(src);
  const calls = code.match(ACTION_CALL) ?? [];
  const without = calls.filter((c) => !/HERE\)$/.test(c));
  check(`${file}: every action call passes HERE`, calls.length > 0 && without.length === 0, without.length ? `**MISSING ROUTE: ${without.join(" | ")}**` : `${calls.length} calls`);
  check(`${file}: HERE is ${route}`, new RegExp(`const HERE = "${route.replace(/\//g, "\\/")}" as const`).test(code), route);
}
const pt = codeOnly(read("app/crm/PipelineTable.tsx"));
const ptActions = (importsOf(read("app/crm/PipelineTable.tsx")).includes("./actions")
  ? (read("app/crm/PipelineTable.tsx").match(/import \{([^}]*)\} from "\.\/actions"/)?.[1] ?? "")
  : "").split(",").map((s) => s.trim()).filter(Boolean).sort();
check("the Pipeline table imports only setStage, markLost and setApplicationNotes", ptActions.join() === "markLost,setApplicationNotes,setStage", ptActions.join(", "));
check("bulk moves are planned by planBulkMove (the board's dropIntent)", /planBulkMove\(/.test(pt) && /from "@\/lib\/crm\/tableView"/.test(read("app/crm/PipelineTable.tsx")), "planBulkMove");
check("the dropdown asks before Funded and Lost too (dropIntent)", /dropIntent\(row\.stage, to\)/.test(pt), "dropIntent");
check("a lost move goes through markLost, which records the reason", /markLost\(row\.id, lost\.choice, lost\.note, HERE\)/.test(pt), "markLost");

/* ------------------------------------------------------------------ 8 */
console.log("\n=== 8. cmdk and TanStack Table load only inside the signed-in product ===");
const heavy = sources.filter((f) => importsOf(readFileSync(f, "utf8")).some((i) => i === "cmdk" || i.startsWith("@tanstack/"))).map(rel);
const allowedHeavy = new Set(["components/workspace/CommandPalette.tsx", "app/crm/DataTable.tsx"]);
check("only the palette imports cmdk and only the CRM grid imports TanStack", heavy.every((f) => allowedHeavy.has(f)) && heavy.length === 2, heavy.join(", "));
check("the palette is loaded lazily (next/dynamic), not in the first bundle", /dynamic\(loadPalette/.test(nav) && /import\("\.\/CommandPalette"\)/.test(nav) && !importsOf(nav).includes("./CommandPalette"), "dynamic import");
const kitUsers = sources.filter((f) => importsOf(readFileSync(f, "utf8")).some((i) => i.startsWith("@/components/ui/"))).map(rel);
const publicSite = kitUsers.filter((f) => !/^(app\/crm|app\/broker-portal|app\/api\/crm|components\/workspace|components\/ui)\//.test(f));
check("no public-site page imports the kit yet (its JS stays off the marketing pages)", publicSite.length === 0, publicSite.length ? `**${publicSite.join(", ")}**` : `${kitUsers.length} users, all signed-in`);

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
