/**
 * Broker invitations — who is allowed into the portal at all.
 *
 * WHAT THIS CLOSES. `app/sign-up` already says "Invitation only" on the page,
 * and its comment assumes Clerk Dashboard invitations. But the ROUTE is public
 * in proxy.ts and the application itself enforces nothing: whether a stranger
 * can create an account depends entirely on a "restricted mode" toggle in the
 * Clerk dashboard. That toggle may well be on. The problem is that nobody can
 * tell by reading this repository, the enforcement lives outside version
 * control, and one wrong click in a settings page silently opens the door.
 *
 * So access is enforced HERE as well, in code, with a table behind it. Clerk
 * restricted mode stays the outer lock; this is the inner one. Either alone is
 * a single point of failure.
 *
 * THE SECOND REASON, WHICH IS THE BETTER ONE. An invite carries the firm and
 * the role. Luis invites jasson@legacyhml.com as a lead at Legacy HML; when
 * Jasson signs in, he is already in his firm and already sees his colleagues'
 * deals. No queue, no second step, nothing waiting on Luis to notice. The
 * unassigned queue built in Phase 2d becomes the EXCEPTION — someone who
 * arrived another way — rather than the normal path.
 *
 * Pure, no database, no Clerk. The writes live in invites.server.ts.
 */

import { normaliseEmail, sameEmail } from "./admin";
import type { BrokerRole } from "./scope";

export type InviteStatus = "pending" | "accepted" | "revoked";

export interface BrokerInvite {
  id: string;
  /** Lowercased at write time. The only thing an invite is matched on. */
  email: string;
  /** Where they land. Null is allowed — it means "decide later". */
  firmId: string | null;
  role: BrokerRole;
  note: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  revokedAt: string | null;
}

/**
 * Revoked beats accepted.
 *
 * If Luis revokes an invite that was already used, the answer to "what is the
 * state of this invite" is revoked — that is the more recent decision and the
 * one he will be looking for. Revoking does NOT remove access on its own; the
 * broker row already exists by then and suspending it is the control that cuts
 * them off. The UI has to say so, or someone will revoke and assume they are
 * locked out.
 */
export function inviteStatus(invite: {
  acceptedAt: string | null;
  revokedAt: string | null;
}): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "accepted";
  return "pending";
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export interface InviteDraft {
  email: string;
  firmId: string | null;
  role: BrokerRole;
  note: string | null;
}

const NOTE_MAX = 280;

export function validateInvite(
  rawEmail: string | null | undefined,
  rawFirmId: string | null | undefined,
  role: unknown,
  rawNote?: string | null,
  isRole: (v: unknown) => v is BrokerRole = defaultIsRole,
): Validated<InviteDraft> {
  const email = normaliseEmail(rawEmail);
  if (!email) return { ok: false, error: "Enter a valid email address." };

  if (!isRole(role)) return { ok: false, error: "Pick a role." };

  const note = (rawNote ?? "").trim();
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `Keep the note under ${NOTE_MAX} characters.` };
  }

  return {
    ok: true,
    value: {
      email,
      // An empty string from a <select> means "no firm yet", not a firm whose
      // id is the empty string.
      firmId: (rawFirmId ?? "").trim() || null,
      role,
      note: note || null,
    },
  };
}

function defaultIsRole(v: unknown): v is BrokerRole {
  return v === "owner" || v === "lead" || v === "member";
}

/* --------------------------------------------------------------- accepting */

export type AcceptCheck = { ok: true } | { ok: false; reason: string };

/**
 * May this person consume this invite?
 *
 * The email on the invite must match the VERIFIED email on the Clerk account
 * signing in. That is the whole security property: an invite is a bearer token
 * for one address, and the address is proven by Clerk, not typed in here.
 */
export function canAcceptInvite(
  invite: BrokerInvite | null | undefined,
  signedInEmail: string | null | undefined,
): AcceptCheck {
  if (!invite) return { ok: false, reason: "No invitation for that address." };

  const status = inviteStatus(invite);
  if (status === "revoked") return { ok: false, reason: "That invitation was revoked." };
  if (status === "accepted") {
    return { ok: false, reason: "That invitation has already been used." };
  }
  if (!sameEmail(invite.email, signedInEmail)) {
    return { ok: false, reason: "That invitation is for a different address." };
  }
  return { ok: true };
}

/**
 * The columns a NEW broker row takes from the invite.
 *
 * Only ever applied when creating the row. If a `broker_users` row already
 * exists for this person, the invite marks itself accepted and changes NOTHING
 * about them — see the note on `shouldApplyInviteToExistingBroker` below.
 */
export function inviteToBrokerFields(invite: BrokerInvite): {
  firmId: string | null;
  role: BrokerRole;
} {
  return { firmId: invite.firmId, role: invite.role };
}

/**
 * NEVER. And the reason matters enough to be a function with a comment rather
 * than an inline `false`.
 *
 * Someone already in the portal has a firm and a role that Luis set
 * deliberately in the CRM. A stale invitation — issued weeks ago, for a firm
 * they have since left — must not be able to move them. An invite decides where
 * a person STARTS, never where they end up.
 *
 * So an existing broker who accepts an invite keeps their current firm, role
 * and status; the invite is simply marked used.
 */
export function shouldApplyInviteToExistingBroker(): boolean {
  return false;
}

/* ---------------------------------------------------------------- display */

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  pending: "Waiting for them to sign in",
  accepted: "Signed in",
  revoked: "Revoked",
};

/** Pending first — those are the ones that may need chasing. */
export function sortInvites<T extends { acceptedAt: string | null; revokedAt: string | null; email: string; invitedAt: string | null }>(
  rows: T[],
): T[] {
  const rank: Record<InviteStatus, number> = { pending: 0, accepted: 1, revoked: 2 };
  return [...rows].sort((a, b) => {
    const ra = rank[inviteStatus(a)];
    const rb = rank[inviteStatus(b)];
    if (ra !== rb) return ra - rb;

    const at = a.invitedAt ? Date.parse(a.invitedAt) : 0;
    const bt = b.invitedAt ? Date.parse(b.invitedAt) : 0;
    if (at !== bt) return bt - at;

    return a.email.localeCompare(b.email);
  });
}

/**
 * How long a pending invite has been sitting, in whole days.
 *
 * Used to nudge Luis, not to expire anything. Invitations here do NOT expire on
 * a timer: a broker who signs in three months late should still get in rather
 * than hit a dead end neither of them understands. If expiry is ever wanted it
 * belongs as an explicit date Luis sets, never as a silent default.
 */
export function inviteAgeDays(
  invitedAt: string | null,
  now: Date = new Date(),
): number | null {
  if (!invitedAt) return null;
  const t = Date.parse(invitedAt);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  return days < 0 ? 0 : days;
}
