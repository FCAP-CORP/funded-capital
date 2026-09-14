import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";

/**
 * Who may open the Lending OS.
 *
 * Being signed in is NOT sufficient and must never become sufficient. The
 * broker portal has open sign-up, so "any Clerk user" includes every broker who
 * has ever registered — and behind /crm sits the entire borrower book: names,
 * phone numbers, what they said on the application, credit bands, notes. That
 * is exactly the nonpublic personal information the GLBA Safeguards Rule
 * obliges this company to restrict to people with a business need.
 *
 * So access is an explicit allowlist of staff email addresses, mirroring the
 * pattern lib/revenueShare.server.ts already uses for the participant admin
 * view — same shape, separate list, because seeing the revenue-share book and
 * seeing the borrower pipeline are different privileges.
 *
 *   CRM_STAFF_EMAILS=luis@fundedcapital.com,someone@fundedcapital.com
 *
 * IT FAILS CLOSED. An unset or empty list admits nobody, including the owner.
 * The alternative — an empty list meaning "everyone" — is the single most
 * common way an internal tool ends up open, because the failure is invisible
 * until someone reads data they should not have.
 */

/** Parse and match, with no Clerk and no environment — so it can be tested. */
export function emailAllowed(email: string | null | undefined, rawList: string | undefined): boolean {
  const target = email?.trim().toLowerCase();
  if (!target) return false;

  const allowlist = (rawList ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // Fail closed: nothing configured means nobody is admitted.
  if (allowlist.length === 0) return false;

  return allowlist.includes(target);
}

/**
 * The configured staff list.
 *
 * Falls back to PARTICIPANT_ADMIN_EMAILS when CRM_STAFF_EMAILS is not set, so
 * the CRM is reachable on a deployment that already has the admin list
 * configured rather than locking everyone out on first deploy. Set the
 * dedicated variable — the fallback is a convenience, not the design, and the
 * two lists will diverge the moment anyone but the owner gets a seat.
 */
function staffList(): string | undefined {
  return process.env.CRM_STAFF_EMAILS || process.env.PARTICIPANT_ADMIN_EMAILS;
}

async function loadIsCrmStaff(): Promise<boolean> {
  const user = await currentUser();
  return emailAllowed(user?.primaryEmailAddress?.emailAddress, staffList());
}

/** Cached per request — several components ask, one Clerk lookup answers. */
export const isCrmStaff = cache(loadIsCrmStaff);

/**
 * For server actions, which have no page to render a 404 from.
 *
 * Every action re-checks with this. A server action is its own addressable
 * endpoint: it is reachable with a crafted POST by anyone who can sign in,
 * whether or not they can load the page that normally calls it, so a guard in
 * the middleware or the layout does not cover it.
 */
export async function assertCrmStaff(): Promise<void> {
  if (!(await isCrmStaff())) throw new Error("not authorised");
}
