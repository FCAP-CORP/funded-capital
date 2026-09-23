/**
 * Issuing and revoking broker invitations. STAFF ONLY.
 *
 * Every function here asserts staff itself, like admin.server.ts and for the
 * same reason — "the caller already checked" is not an assumption this file
 * makes.
 *
 * The other half of invitations — a broker CONSUMING one on their first sign-in
 * — deliberately does not live here. It runs as the broker, for themselves, and
 * belongs in provision.ts, which asserts nothing about staff. Keeping the two
 * sides in separate files means the broker path can never accidentally import a
 * function that lists every invitation in the system.
 */

import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brokerInvites, brokerFirms } from "@/lib/db/schema";
import { assertCrmStaff } from "@/lib/crm/access";
import { isBrokerRole } from "./admin";
import type { BrokerRole } from "./scope";
import { sortInvites, validateInvite, type BrokerInvite } from "./invites";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

export type Result<T = null> = { ok: true; value: T } | { ok: false; error: string };
const DONE: Result<null> = { ok: true, value: null };

export interface InviteRow extends BrokerInvite {
  firmName: string | null;
  invitedBy: string | null;
}

export async function listInvites(): Promise<InviteRow[]> {
  await assertCrmStaff();

  const result = await db.execute(sql`
    SELECT
      i.id, i.email, i.role, i.note, i.firm_id,
      i.invited_by, i.invited_at,
      i.accepted_at, i.accepted_by_user_id,
      i.revoked_at,
      f.name AS firm_name
    FROM broker_invites i
    LEFT JOIN broker_firms f ON f.id = i.firm_id
  `);

  const rows = rowsOf(result).map((r): InviteRow => ({
    id: String(r.id),
    email: String(r.email ?? ""),
    firmId: str(r.firm_id),
    firmName: str(r.firm_name),
    role: (str(r.role) ?? "member") as BrokerRole,
    note: str(r.note),
    invitedBy: str(r.invited_by),
    invitedAt: str(r.invited_at),
    acceptedAt: str(r.accepted_at),
    acceptedByUserId: str(r.accepted_by_user_id),
    revokedAt: str(r.revoked_at),
  }));

  // Ordered by the tested pure function so the rule has a regression suite
  // rather than living in an ORDER BY nobody reads.
  return sortInvites(rows);
}

/**
 * Invite someone, or re-invite them.
 *
 * ONE ROW PER ADDRESS. Re-inviting an email that already has an invite UPDATES
 * that row rather than inserting a second one, so "is this person invited" has
 * exactly one answer. Re-inviting also clears a revocation — that is what
 * re-inviting means — but it never clears `accepted_at`, because an invitation
 * already used is history and rewriting it would destroy the record of who got
 * in and when.
 */
export async function createInvite(
  rawEmail: string,
  rawFirmId: string | null,
  rawRole: string,
  rawNote: string | null,
  staffUserId: string,
): Promise<Result<string>> {
  await assertCrmStaff();

  const draft = validateInvite(rawEmail, rawFirmId, rawRole, rawNote, isBrokerRole);
  if (!draft.ok) return { ok: false, error: draft.error };

  if (draft.value.firmId) {
    const firm = await db
      .select({ id: brokerFirms.id })
      .from(brokerFirms)
      .where(eq(brokerFirms.id, draft.value.firmId))
      .limit(1);
    if (!firm.length) return { ok: false, error: "That firm no longer exists." };
  }

  const existing = await db
    .select({ id: brokerInvites.id, acceptedAt: brokerInvites.acceptedAt })
    .from(brokerInvites)
    .where(eq(brokerInvites.email, draft.value.email))
    .limit(1);

  const now = new Date();

  if (existing.length) {
    if (existing[0].acceptedAt) {
      return {
        ok: false,
        error: "That address has already signed in. Change their firm on their broker page instead.",
      };
    }
    await db
      .update(brokerInvites)
      .set({
        firmId: draft.value.firmId,
        role: draft.value.role,
        note: draft.value.note,
        invitedBy: staffUserId,
        invitedAt: now,
        // Re-inviting undoes a revocation. That is what re-inviting means.
        revokedAt: null,
        revokedBy: null,
        updatedAt: now,
      })
      .where(eq(brokerInvites.id, existing[0].id));
    return { ok: true, value: existing[0].id };
  }

  const id = crypto.randomUUID();
  await db.insert(brokerInvites).values({
    id,
    email: draft.value.email,
    firmId: draft.value.firmId,
    role: draft.value.role,
    note: draft.value.note,
    invitedBy: staffUserId,
    invitedAt: now,
  });

  return { ok: true, value: id };
}

/**
 * Revoke an invitation.
 *
 * This blocks a FUTURE sign-in and nothing else. Someone who already accepted
 * has a `broker_users` row, and that row is what grants them sight of deals —
 * suspending it is the control that cuts them off. Revoking an accepted invite
 * is allowed (it records the decision) but the screen must not imply it removed
 * access, or someone will revoke and assume they are locked out.
 */
export async function revokeInvite(inviteId: string, staffUserId: string): Promise<Result> {
  await assertCrmStaff();
  await db
    .update(brokerInvites)
    .set({ revokedAt: new Date(), revokedBy: staffUserId, updatedAt: new Date() })
    .where(eq(brokerInvites.id, inviteId));
  return DONE;
}

/** Pending invitations, for the count badge on the Brokers screen. */
export async function countPendingInvites(): Promise<number> {
  await assertCrmStaff();
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(brokerInvites)
    .where(sql`${brokerInvites.acceptedAt} IS NULL AND ${brokerInvites.revokedAt} IS NULL`);
  return Number(rows[0]?.n ?? 0);
}
