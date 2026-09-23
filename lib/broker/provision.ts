/**
 * What happens the first time a broker opens the portal.
 *
 * This runs AS THE BROKER, for themselves. It asserts nothing about staff and
 * must never import from admin.server.ts or invites.server.ts — those list and
 * mutate every firm and every invitation in the system, and the broker path has
 * no business being able to reach them.
 *
 * THE RULE: a `broker_users` row is created ONLY for someone holding a valid
 * invitation. Before invitations existed, a row was created for anyone who
 * signed in, which meant the portal was open to whoever wandered in and Luis's
 * queue could be filled by strangers. Now an uninvited visitor gets a polite
 * gate and no row at all.
 *
 * GRANDFATHERING. Anyone who ALREADY has a row keeps their access, invitation or
 * not. Turning this on must not lock out brokers who are already working deals —
 * that is a support incident, not a security improvement.
 */

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { brokerInvites, brokerUsers } from "@/lib/db/schema";
import { normaliseEmail } from "./admin";
import {
  canAcceptInvite,
  inviteToBrokerFields,
  shouldApplyInviteToExistingBroker,
  type BrokerInvite,
} from "./invites";
import type { BrokerRole } from "./scope";

export type AdmitOutcome =
  /** They have a row and may use the portal. */
  | { admitted: true; created: boolean }
  /** No row, and none will be made. The portal shows the gate screen. */
  | { admitted: false; reason: string };

/**
 * Decide whether this signed-in person may use the broker portal, and create
 * their row if an invitation says so.
 *
 * Never throws — it returns a refusal instead.
 *
 * BE CLEAR ABOUT THE FAILURE MODE: if the database is unreachable, this refuses
 * EVERYONE, including brokers who are already in and mid-deal. That is the right
 * trade (admitting someone wrongly is worse than a temporary outage) but it is
 * not a graceful degradation, and the refusal text says "try again shortly"
 * rather than anything that sounds permanent. If broker sign-in ever needs to
 * survive a database outage, that is a deliberate piece of work — a cached
 * entitlement — and not something to bolt onto this catch block.
 */
export async function admitBroker(
  clerkUserId: string | null | undefined,
  email: string | null | undefined,
  name?: string | null,
): Promise<AdmitOutcome> {
  const normalised = normaliseEmail(email);
  if (!clerkUserId || !normalised) {
    return { admitted: false, reason: "We could not read a verified email address for this account." };
  }

  try {
    /* -- Already in? Then nothing else matters. ------------------------- */
    const existing = await db
      .select({ id: brokerUsers.id })
      .from(brokerUsers)
      .where(eq(brokerUsers.clerkUserId, clerkUserId))
      .limit(1);

    if (existing.length) return { admitted: true, created: false };

    /* -- Otherwise they need an invitation. ----------------------------- */
    const rows = await db
      .select({
        id: brokerInvites.id,
        email: brokerInvites.email,
        firmId: brokerInvites.firmId,
        role: brokerInvites.role,
        acceptedAt: brokerInvites.acceptedAt,
        acceptedByUserId: brokerInvites.acceptedByUserId,
        revokedAt: brokerInvites.revokedAt,
        invitedAt: brokerInvites.invitedAt,
        note: brokerInvites.note,
      })
      .from(brokerInvites)
      .where(eq(brokerInvites.email, normalised))
      .limit(1);

    const invite: BrokerInvite | null = rows.length
      ? {
          id: rows[0].id,
          email: rows[0].email,
          firmId: rows[0].firmId,
          role: rows[0].role as BrokerRole,
          note: rows[0].note,
          invitedAt: rows[0].invitedAt ? rows[0].invitedAt.toISOString() : null,
          acceptedAt: rows[0].acceptedAt ? rows[0].acceptedAt.toISOString() : null,
          acceptedByUserId: rows[0].acceptedByUserId,
          revokedAt: rows[0].revokedAt ? rows[0].revokedAt.toISOString() : null,
        }
      : null;

    const verdict = canAcceptInvite(invite, normalised);
    if (!verdict.ok || !invite) {
      return { admitted: false, reason: verdict.ok ? "No invitation for that address." : verdict.reason };
    }

    const fields = inviteToBrokerFields(invite);
    const now = new Date();

    // We are past the existing-row check, so this IS a new broker. The rule for
    // an existing one is the opposite and lives in invites.ts; naming it here
    // keeps the two halves of the decision visible in one place.
    if (shouldApplyInviteToExistingBroker()) {
      throw new Error("invite-to-existing-broker rule changed; admitBroker needs revisiting");
    }

    /**
     * The row and the acceptance stamp commit together via db.batch — the
     * neon-http driver has no transactions (see CLAUDE.md). If they could split,
     * a crash between them would either admit someone with an invite still
     * marked unused, or burn the invite without letting them in.
     *
     * `onConflictDoNothing` on clerk_user_id makes two tabs opening at once
     * safe; the acceptance update carries `accepted_at IS NULL` for the same
     * reason, so a second attempt matches no rows.
     */
    await db.batch([
      db
        .insert(brokerUsers)
        .values({
          clerkUserId,
          email: normalised,
          name: name?.trim() || null,
          // Straight from the invitation — this is the whole point of the
          // feature. They land in their firm rather than in a queue.
          //
          // Safe to apply unconditionally because we only reach this line when
          // NO broker_users row exists. `shouldApplyInviteToExistingBroker` is
          // the rule for the other case and is asserted just above, so the two
          // can never drift apart.
          firmId: fields.firmId,
          role: fields.role,
          firstSeenAt: now,
        })
        .onConflictDoNothing({ target: brokerUsers.clerkUserId }),
      db
        .update(brokerInvites)
        .set({ acceptedAt: now, acceptedByUserId: clerkUserId, updatedAt: now })
        .where(and(eq(brokerInvites.id, invite.id), isNull(brokerInvites.acceptedAt))),
    ]);

    return { admitted: true, created: true };
  } catch (err) {
    console.error("[broker/provision] admitBroker failed:", err);
    // Fails closed for everyone, existing brokers included. See the note above:
    // deliberate, but not graceful.
    return { admitted: false, reason: "We could not verify your access just now. Please try again shortly." };
  }
}
