/**
 * Regression suite for the unified navigation model.
 *
 * Two things are being protected here, and only one of them is cosmetic.
 *
 * THE COSMETIC ONE: which link is lit. Worth testing because the rule it
 * replaced was a pile of hard-coded exceptions that had already been got wrong
 * once per nested route.
 *
 * THE ONE THAT MATTERS: that a broker's rail contains NOTHING from Lending OS.
 * The menu is not what stops a broker reading the borrower book — the layout,
 * the pages and the actions do that, and they are covered by
 * `lib/crm/guards.regress.ts`. But a `/crm` link appearing in a broker's
 * sidebar would be the visible half of a much worse mistake, and it is cheap to
 * assert that it never does.
 */

import {
  activeHref,
  activeSection,
  buildWorkspaceNav,
  homeHref,
  navHrefs,
  type WorkspaceEntitlement,
} from "./nav";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const STAFF: WorkspaceEntitlement = { lendingOs: true, brokerWorkspace: true };
const BROKER: WorkspaceEntitlement = { lendingOs: false, brokerWorkspace: true };
const NOBODY: WorkspaceEntitlement = { lendingOs: false, brokerWorkspace: false };

const staffNav = buildWorkspaceNav(STAFF);
const brokerNav = buildWorkspaceNav(BROKER);
const emptyNav = buildWorkspaceNav(NOBODY);

/* ------------------------------------------------------------ entitlement */

console.log("\n=== 1. The rail contains only what the person may open ===");

check("staff get both sections", staffNav.length === 2, staffNav.map((s) => s.id).join(", "));
check("...Lending OS first", staffNav[0]?.id === "lending-os", String(staffNav[0]?.id));
check("a broker gets one section", brokerNav.length === 1, brokerNav.map((s) => s.id).join(", "));
check("...and it is the broker workspace", brokerNav[0]?.id === "broker", String(brokerNav[0]?.id));
check("someone with neither grant gets an empty rail", emptyNav.length === 0, `${emptyNav.length} sections`);

console.log("\n=== 2. A broker's rail contains NOTHING under /crm ===");

const brokerHrefs = navHrefs(brokerNav);
const crmLeak = brokerHrefs.filter((h) => h.startsWith("/crm"));
check("no /crm href anywhere in a broker's rail", crmLeak.length === 0, crmLeak.join(", ") || "clean");
check("...checked against a real list, not an empty one", brokerHrefs.length === 5, `${brokerHrefs.length} hrefs`);
check("a staff rail carries both sections in full", navHrefs(staffNav).length === 9, `${navHrefs(staffNav).length} hrefs`);

const emptyHrefs = navHrefs(emptyNav);
check("an unentitled rail has no hrefs at all", emptyHrefs.length === 0, `${emptyHrefs.length}`);

console.log("\n=== 3. A broker's rail is byte-identical to a staff member's broker section ===");
// If these ever diverge it is because someone added a staff-only tool to the
// shared list. That is exactly the moment to notice.
const staffBrokerSection = staffNav.find((s) => s.id === "broker");
check(
  "same items, same order",
  JSON.stringify(staffBrokerSection?.items) === JSON.stringify(brokerNav[0]?.items),
  `${staffBrokerSection?.items.length} vs ${brokerNav[0]?.items.length}`,
);
check("staff see the whose-view note", Boolean(staffBrokerSection?.note), staffBrokerSection?.note ?? "none");
check("a broker does not", brokerNav[0]?.note === undefined, String(brokerNav[0]?.note));

/* ------------------------------------------------------------ active link */

console.log("\n=== 4. The longest matching link is the lit one ===");

const cases: [string, string | null][] = [
  // /crm/dashboard is a strict extension of /crm. Longest match keeps the
  // Pipeline link from staying lit on the Dashboard, with no exception added.
  ["/crm/dashboard", "/crm/dashboard"],
  ["/crm", "/crm"],
  ["/crm/contacts", "/crm/contacts"],
  ["/crm/brokers", "/crm/brokers"],
  // A child route lights its parent. This is the case the old exact-match
  // exception in CrmNav existed to handle, now handled by the general rule.
  ["/crm/brokers/abc-123", "/crm/brokers"],
  ["/broker-portal", "/broker-portal"],
  ["/broker-portal/price", "/broker-portal/price"],
  // The one the old sidebar needed a second hard-coded exception for.
  ["/broker-portal/price/portfolio", "/broker-portal/price/portfolio"],
  ["/broker-portal/apply", "/broker-portal/apply"],
  ["/broker-portal/resources", "/broker-portal/resources"],
  // A deal page has no link of its own, so it belongs to the dashboard.
  ["/broker-portal/deal/9f2", "/broker-portal"],
  // Nothing in the rail.
  ["/apply", null],
  ["/", null],
];

for (const [path, expected] of cases) {
  const got = activeHref(path, staffNav);
  check(`activeHref("${path}")`, got === expected, `${got} (expected ${expected})`);
}

console.log("\n=== 5. Substring matches do NOT light a link ===");
// The bug a plain startsWith would have shipped the first time a route was
// named with a shared prefix.
for (const path of ["/crmail", "/crm-archive", "/broker-portal-legacy"]) {
  const got = activeHref(path, staffNav);
  check(`activeHref("${path}") is null`, got === null, String(got));
}

console.log("\n=== 6. Trailing slashes, queries and fragments are ignored ===");
for (const path of ["/crm/contacts/", "/crm/contacts?q=smith", "/crm/contacts#top", "/crm/contacts/?q=a"]) {
  const got = activeHref(path, staffNav);
  check(`activeHref("${path}")`, got === "/crm/contacts", String(got));
}
check('activeHref("/") is null, not "/crm"', activeHref("/", staffNav) === null, String(activeHref("/", staffNav)));
check("an empty pathname does not throw", activeHref("", staffNav) === null, String(activeHref("", staffNav)));

console.log("\n=== 7. A broker's rail never lights a /crm route, even if they reach one ===");
// They cannot — /crm 404s for them. But if that ever changed, the rail must not
// start behaving as though they belong there.
check(
  "activeHref on /crm with a broker rail is null",
  activeHref("/crm", brokerNav) === null,
  String(activeHref("/crm", brokerNav)),
);
check(
  "activeSection on /crm with a broker rail is null",
  activeSection("/crm", brokerNav) === null,
  String(activeSection("/crm", brokerNav)?.id),
);

/* --------------------------------------------------------------- sections */

console.log("\n=== 8. The current page resolves to the right group ===");
check("/crm/contacts is Lending OS", activeSection("/crm/contacts", staffNav)?.id === "lending-os", String(activeSection("/crm/contacts", staffNav)?.id));
check("/broker-portal/apply is Broker", activeSection("/broker-portal/apply", staffNav)?.id === "broker", String(activeSection("/broker-portal/apply", staffNav)?.id));
check("an unknown path has no group", activeSection("/about", staffNav) === null, String(activeSection("/about", staffNav)?.id));

console.log("\n=== 9. The logo points at the home of the half you are using ===");
// The section's FIRST item, which is the Dashboard — "home" for the Lending OS
// is the screen that says what to do today, not the pipeline grid.
check('from /crm/contacts -> "/crm/dashboard"', homeHref("/crm/contacts", staffNav) === "/crm/dashboard", homeHref("/crm/contacts", staffNav));
check('from /broker-portal/price -> "/broker-portal"', homeHref("/broker-portal/price", staffNav) === "/broker-portal", homeHref("/broker-portal/price", staffNav));
// Off-rail: fall back to the first section rather than to a broken link.
check('from an unknown path -> first section', homeHref("/about", staffNav) === "/crm/dashboard", homeHref("/about", staffNav));
check('a broker off-rail -> "/broker-portal"', homeHref("/about", brokerNav) === "/broker-portal", homeHref("/about", brokerNav));
check('an empty rail -> "/"', homeHref("/anything", emptyNav) === "/", homeHref("/anything", emptyNav));

/* ---------------------------------------------------------------- hygiene */

console.log("\n=== 10. No duplicate or malformed hrefs ===");
const all = navHrefs(staffNav);
check("every href is unique", new Set(all).size === all.length, all.join(", "));
check("every href starts with /", all.every((h) => h.startsWith("/")), "ok");
check("no href has a trailing slash", all.every((h) => h === "/" || !h.endsWith("/")), "ok");
check("every item has a label and an icon", staffNav.every((s) => s.items.every((i) => Boolean(i.label) && Boolean(i.icon))), "ok");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
