/**
 * Put a broker in Luis's queue the first time they open the portal.
 *
 * THE GAP THIS CLOSES. Until now a `broker_users` row was only created by a
 * SUBMISSION. So a broker could register, sign in, find an empty dashboard and
 * wait — while nothing anywhere recorded that they existed. The queue Luis
 * works from only contained people who had already filed a deal, which is
 * exactly backwards: the person who most needs linking is the one who has not
 * filed anything yet because they are waiting to be let in.
 *
 * Deliberately its own tiny module rather than part of admin.server.ts. That
 * file is staff-only and every function in it asserts so; this one is called by
 * a broker, for themselves, and must not sit behind the same import.
 *
 * WHAT IT CANNOT DO. It never sets a firm, a role or a status — the row lands
 * unassigned, which `lib/broker/scope.ts` reads as "their own submissions and
 * nothing else". Creating a row is not granting access; it is making someone
 * visible so access can be granted deliberately.
 */

import "server-only";
import { db } from "@/lib/db";
import { brokerUsers } from "@/lib/db/schema";
import { normaliseEmail } from "./admin";

export async function ensureBrokerUser(
  clerkUserId: string | null | undefined,
  email: string | null | undefined,
  name?: string | null,
): Promise<boolean> {
  const normalised = normaliseEmail(email);
  if (!clerkUserId || !normalised) return false;

  try {
    await db
      .insert(brokerUsers)
      .values({
        clerkUserId,
        email: normalised,
        name: name?.trim() || null,
      })
      /**
       * The unique index on clerk_user_id is what makes this safe to call on
       * every dashboard load, including two tabs opening at once. Two rows for
       * one person would mean two different answers to "which firm are they
       * in", and `resolveBrokerViewer` takes the first — so the answer would
       * depend on row order.
       */
      .onConflictDoNothing({ target: brokerUsers.clerkUserId });
    return true;
  } catch (err) {
    // Never block a dashboard on this. The worst case is that the broker does
    // not appear in the queue until their first submission — which is exactly
    // where things stood before this existed.
    console.error("[broker/provision] ensureBrokerUser failed:", err);
    return false;
  }
}
