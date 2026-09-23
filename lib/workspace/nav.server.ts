/**
 * What THIS person's sidebar contains, decided on the server.
 *
 * NOT STAFF-ONLY. Every broker calls this on every page of the portal, so it
 * must never assert staff and must never import `admin.server.ts` or
 * `invites.server.ts` — the same rule `lib/broker/provision.ts` lives under,
 * for the same reason, and `lib/crm/guards.regress.ts` asserts both.
 *
 * It asks the two existing gates rather than inventing a third:
 *
 *   `isCrmStaff()`          — the allowlist in lib/crm/access.ts, fails closed
 *   `resolveBrokerViewer()` — a `broker_users` row, or null
 *
 * That is the point. One more place that decides who you are is one more place
 * that can disagree with the others, and a menu disagreeing with a gate is how
 * a link appears that leads to a 404 — or, far worse, how a gate quietly starts
 * trusting a menu.
 */

import "server-only";
import { cache } from "react";
import { isCrmStaff } from "@/lib/crm/access";
import { resolveBrokerViewer } from "@/lib/broker/viewer";
import { buildWorkspaceNav, type NavSection, type WorkspaceEntitlement } from "./nav";

/**
 * Cached per request, so a layout and anything else that asks share one answer
 * and one round trip.
 *
 * STAFF SHORT-CIRCUIT. Luis is staff on every `/crm` page, and staff get the
 * broker section by entitlement rather than by having a `broker_users` row —
 * he has none, deliberately, because a row would put him in his own unassigned
 * queue. So there is nothing for the broker lookup to tell us and it is skipped
 * entirely, which keeps this from adding a database round trip to every CRM
 * page load.
 *
 * A SUSPENDED broker still gets the rail. That matches what the portal already
 * does — `admitBroker` lets anyone with a row back in, and suspension empties
 * their dashboard through `lib/broker/scope.ts` rather than locking the door.
 * Worth knowing before changing either half: the two must agree, or a suspended
 * broker gets a menu full of links to pages that refuse them.
 */
export const resolveEntitlement = cache(async (): Promise<WorkspaceEntitlement> => {
  if (await isCrmStaff()) return { lendingOs: true, brokerWorkspace: true };

  const viewer = await resolveBrokerViewer();
  return { lendingOs: false, brokerWorkspace: viewer !== null };
});

export async function workspaceNav(): Promise<NavSection[]> {
  return buildWorkspaceNav(await resolveEntitlement());
}
