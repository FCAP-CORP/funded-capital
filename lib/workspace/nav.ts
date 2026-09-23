/**
 * ONE navigation model for the whole signed-in product.
 *
 * WHY THIS EXISTS. Until now `/crm` and `/broker-portal` each carried their own
 * sidebar, and neither knew the other existed. The two files were 90% identical
 * — same navy rail, same gold active state, same user block — and the 10% that
 * differed was the link list. The result was that moving from a contact record
 * to the pricing tool meant editing the address bar. Two products, one company,
 * one person using both.
 *
 * So the link list stops being hard-coded in a component and becomes DATA,
 * computed from what this person is entitled to open. One rail, two groups,
 * every destination one click away.
 *
 * ===================================================================
 *  THIS MODULE IS A VIEW. IT IS NOT A GATE. IT MUST NEVER BECOME ONE.
 * ===================================================================
 *
 * A link that is absent from this list is absent from a menu, and that is ALL
 * it is. The person can still type the URL. What actually stops them is
 * unchanged and lives where it always has:
 *
 *   - `proxy.ts`                    — signed in at all
 *   - `app/crm/layout.tsx`          — staff, or 404
 *   - every `/crm` page             — staff, again, because a layout and its
 *                                     page render concurrently
 *   - every server action           — staff, again, because an action is its
 *                                     own addressable endpoint
 *   - `app/broker-portal/layout.tsx`— admitted broker, or the access gate
 *   - `lib/broker/scope.ts`         — which rows a broker may see
 *
 * If this file is ever the only reason someone cannot reach something, that is
 * the bug. Hiding a link is a courtesy to the person using the product; it is
 * not a security control, and a reviewer should treat any comment here that
 * claims otherwise as a mistake.
 *
 * Pure on purpose: no React, no Clerk, no database, no icons. Everything it
 * decides is covered by `nav.regress.ts`.
 */

/** The two halves of the signed-in product. */
export type WorkspaceArea = "lending-os" | "broker";

/**
 * Icon names rather than components, so this module stays free of React and can
 * be exercised by a plain script. `WorkspaceNav.tsx` maps each one to a Lucide
 * component, and the map is typed against this union — add a name here without
 * adding the icon there and the build fails rather than rendering a hole.
 */
export type NavIcon =
  | "pipeline"
  | "contacts"
  | "firms"
  | "dashboard"
  | "pricing"
  | "portfolio"
  | "apply"
  | "resources";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
}

export interface NavSection {
  id: WorkspaceArea;
  label: string;
  /** A line under the heading. Used to tell staff whose screen they are on. */
  note?: string;
  items: NavItem[];
}

/**
 * What this person may OPEN. Two independent grants, deliberately mirroring the
 * two independent gates in the codebase — `lib/crm/access.ts` answers the first
 * and a `broker_users` row answers the second.
 *
 * Kept to exactly these two fields. A firm id or a broker role in here would
 * invite a future menu to branch on scope, and scope decisions belong in
 * `lib/broker/scope.ts` where they are tested as security rules rather than as
 * presentation.
 */
export interface WorkspaceEntitlement {
  /** `lib/crm/access.ts` said yes: this is a Funded Capital staff address. */
  lendingOs: boolean;
  /** This person can open `/broker-portal`. */
  brokerWorkspace: boolean;
}

const LENDING_OS_ITEMS: readonly NavItem[] = [
  { label: "Pipeline", href: "/crm", icon: "pipeline" },
  { label: "Contacts", href: "/crm/contacts", icon: "contacts" },
  { label: "Brokers", href: "/crm/brokers", icon: "firms" },
];

const BROKER_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/broker-portal", icon: "dashboard" },
  { label: "Price a Deal", href: "/broker-portal/price", icon: "pricing" },
  { label: "Portfolio Pricing", href: "/broker-portal/price/portfolio", icon: "portfolio" },
  { label: "New Application", href: "/broker-portal/apply", icon: "apply" },
  { label: "Resource Library", href: "/broker-portal/resources", icon: "resources" },
];

/**
 * Build the rail.
 *
 * Lending OS first for staff, because that is where their day starts. A broker
 * gets exactly one section and it is identical to the sidebar they have today —
 * this change must be invisible to them, since a broker discovering a new menu
 * the morning after their invitation arrives is a support call.
 */
export function buildWorkspaceNav(entitlement: WorkspaceEntitlement): NavSection[] {
  const sections: NavSection[] = [];

  if (entitlement.lendingOs) {
    sections.push({ id: "lending-os", label: "Lending OS", items: [...LENDING_OS_ITEMS] });
  }

  if (entitlement.brokerWorkspace) {
    sections.push({
      id: "broker",
      label: "Broker Workspace",
      // Only staff see both, and only staff need telling which is which. On
      // Luis's screen the broker pages show HIS view, not a broker's — the note
      // is there so a demo is never mistaken for an audit.
      note: entitlement.lendingOs ? "Your own view of the broker tools" : undefined,
      items: [...BROKER_ITEMS],
    });
  }

  return sections;
}

/** Every destination in the rail, in order. */
export function navHrefs(sections: NavSection[]): string[] {
  return sections.flatMap((s) => s.items.map((i) => i.href));
}

/**
 * Does `pathname` sit under `href`?
 *
 * ON A SEGMENT BOUNDARY, not a substring. A plain `startsWith` lights `/crm`
 * up on a hypothetical `/crmail`, and — the one that would actually have
 * happened — would light "Brokers" (`/crm/brokers`) on `/crm/brokerage`.
 */
function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Trailing slashes and query strings are not part of the decision. */
function normalise(pathname: string): string {
  const path = (pathname || "/").split("?")[0].split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Which single link is lit.
 *
 * THE LONGEST MATCH WINS, and that one rule replaces every special case the two
 * old sidebars carried. Both of them hard-coded exceptions — `/crm` had to
 * match exactly or it stayed lit on Contacts; `/broker-portal/price` had to
 * match exactly or it stayed lit on Portfolio Pricing — and each exception was
 * a line someone had to remember to add when a route was nested under another.
 *
 * `/broker-portal/price/portfolio` matches both the pricing link and the
 * portfolio link; the longer one is the more specific one, and the more
 * specific one is the page you are on. No list of exceptions to maintain.
 */
export function activeHref(pathname: string, sections: NavSection[]): string | null {
  const path = normalise(pathname);
  let best: string | null = null;
  for (const href of navHrefs(sections)) {
    if (!under(path, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}

/** Which group the current page belongs to — the mobile bar's label comes from this. */
export function activeSection(pathname: string, sections: NavSection[]): NavSection | null {
  const href = activeHref(pathname, sections);
  if (href === null) return null;
  return sections.find((s) => s.items.some((i) => i.href === href)) ?? null;
}

/**
 * Where the logo in the mobile bar points.
 *
 * The first item of the group you are in, so "home" means the home of the thing
 * you are currently using rather than a fixed route that may belong to the
 * other half of the product. Falls back to the first section, then to the
 * public site — a rail with no sections at all should still render.
 */
export function homeHref(pathname: string, sections: NavSection[]): string {
  const section = activeSection(pathname, sections) ?? sections[0];
  return section?.items[0]?.href ?? "/";
}
