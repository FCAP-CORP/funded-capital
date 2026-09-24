/**
 * Regression suite for the ⌘K command bar's pure decisions (lib/workspace/palette.ts).
 *
 * The one that matters most is §1: a broker's palette is built from a broker's
 * rail, so it can never offer a Lending OS page. (It would 404 if it did — the
 * gates are elsewhere — but a menu offering doors that refuse you is a bug.)
 *
 * Run: npx tsx lib/workspace/palette.regress.ts
 */

import { buildWorkspaceNav } from "./nav";
import { contactHref, dealHref, matchLinks, paletteLinks, shortcutLabel } from "./palette";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. The palette offers exactly the rail's pages ===");
const broker = paletteLinks(buildWorkspaceNav({ lendingOs: false, brokerWorkspace: true }));
const staff = paletteLinks(buildWorkspaceNav({ lendingOs: true, brokerWorkspace: true }));
const nobody = paletteLinks(buildWorkspaceNav({ lendingOs: false, brokerWorkspace: false }));
check("a broker is offered no /crm page at all", broker.every((l) => !l.href.startsWith("/crm")), broker.map((l) => l.href).join(" "));
check("...and not the board shortcut either", !broker.some((l) => l.href === "/crm/board"), "absent");
check("a broker gets their five pages", broker.length === 5, String(broker.length));
check("staff get both halves plus the board", staff.some((l) => l.href === "/crm/board") && staff.some((l) => l.href === "/broker-portal/price"), `${staff.length} links`);
check("the board sits right after the Pipeline", staff[staff.findIndex((l) => l.href === "/crm") + 1]?.href === "/crm/board", "adjacent");
check("no entitlement, no pages", nobody.length === 0, "0");

console.log("\n=== 2. Matching pages ===");
check("empty query lists everything in rail order", matchLinks(staff, "").map((l) => l.href).join() === staff.map((l) => l.href).join(), "same order");
check("'pipe' finds the Pipeline first", matchLinks(staff, "pipe")[0]?.href === "/crm", matchLinks(staff, "pipe")[0]?.href ?? "none");
check("a keyword finds a page ('firms' → Brokers)", matchLinks(staff, "firms")[0]?.href === "/crm/brokers", matchLinks(staff, "firms")[0]?.href ?? "none");
check("'quote' finds pricing", matchLinks(staff, "quote")[0]?.href === "/broker-portal/price", matchLinks(staff, "quote")[0]?.href ?? "none");
check("every word must match", matchLinks(staff, "pipeline zebra").length === 0, "0");
check("case-insensitive", matchLinks(staff, "CONTACTS")[0]?.href === "/crm/contacts", "contacts");
check("a broker searching 'contacts' finds nothing (no leak by keyword)", matchLinks(broker, "contacts").length === 0, "0");

console.log("\n=== 3. Where a result goes ===");
check("on the Pipeline, a deal opens over the Pipeline", dealHref("/crm", "abc") === "/crm?open=abc", dealHref("/crm", "abc"));
check("on the dashboard, over the dashboard", dealHref("/crm/dashboard", "abc") === "/crm/dashboard?open=abc", dealHref("/crm/dashboard", "abc"));
check("on the board, over the board", dealHref("/crm/board/", "abc") === "/crm/board?open=abc", dealHref("/crm/board/", "abc"));
check("on a page with no record card, over the Pipeline", dealHref("/crm/marketing", "abc") === "/crm?open=abc", dealHref("/crm/marketing", "abc"));
check("from the broker side, over the Pipeline", dealHref("/broker-portal/price", "abc") === "/crm?open=abc", dealHref("/broker-portal/price", "abc"));
check("the id is encoded", dealHref("/crm", "a b&c") === "/crm?open=a%20b%26c", dealHref("/crm", "a b&c"));
check("a contact opens Contacts filtered to them", contactHref("p1@x.com") === "/crm/contacts?q=p1%40x.com", contactHref("p1@x.com"));

console.log("\n=== 4. The shortcut hint ===");
check("Mac says ⌘K", shortcutLabel("MacIntel") === "⌘K", shortcutLabel("MacIntel"));
check("iPad says ⌘K", shortcutLabel("iPad") === "⌘K", shortcutLabel("iPad"));
check("Windows says Ctrl K", shortcutLabel("Win32") === "Ctrl K", shortcutLabel("Win32"));
check("unknown says Ctrl K", shortcutLabel(undefined) === "Ctrl K", shortcutLabel(undefined));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
