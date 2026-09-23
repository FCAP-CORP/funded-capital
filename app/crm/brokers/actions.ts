"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { assertCrmStaff } from "@/lib/crm/access";
import { isBrokerRole, isBrokerStatus } from "@/lib/broker/admin";
import { createInvite, revokeInvite } from "@/lib/broker/invites.server";
import {
  assignBroker,
  claimDeal,
  createFirm,
  setBrokerNotes,
  setBrokerStatus,
  setFirmNotes,
  setFirmStatus,
} from "@/lib/broker/admin.server";

/**
 * Server actions for firm administration.
 *
 * Every one of these re-checks staff access, exactly as app/crm/actions.ts
 * does, and for the same reason: a server action is its own addressable
 * endpoint, reachable with a crafted POST by anyone who can sign in. The guard
 * on the page does not cover it.
 *
 * Two of these actions — assign and claim — are the only things in this codebase
 * that can make a person able to read a borrower file. Both validate their
 * arguments against a fixed list rather than passing them through to SQL, and
 * `claimDeal` re-reads the row and re-runs `canClaimDeal` before writing
 * anything, so the decision is never made from what a screen happened to show.
 */

async function requireStaff(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("not signed in");
  await assertCrmStaff();
  return userId;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

/* ------------------------------------------------------------------ firms */

export async function createFirmAction(name: string, notes: string): Promise<ActionResult> {
  try {
    await requireStaff();
    const res = await createFirm(name, notes);
    if (!res.ok) return res;
    revalidatePath("/crm/brokers");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setFirmStatusAction(firmId: string, status: string): Promise<ActionResult> {
  try {
    await requireStaff();
    if (!isBrokerStatus(status)) return { ok: false, error: `unknown status "${status}"` };
    await setFirmStatus(firmId, status);
    revalidatePath("/crm/brokers");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setFirmNotesAction(firmId: string, notes: string): Promise<ActionResult> {
  try {
    await requireStaff();
    await setFirmNotes(firmId, notes);
    revalidatePath("/crm/brokers");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ---------------------------------------------------------------- brokers */

/**
 * Link a broker to a firm, or unlink them, and set what they may see.
 *
 * An empty firmId means "unassigned", which is a legitimate destination and not
 * an error — it is how someone who left a brokerage stops seeing its pipeline.
 * The role is checked against the enum rather than trusted, because it lands in
 * a column that `lib/broker/scope.ts` reads to decide firm-wide visibility.
 */
export async function assignBrokerAction(
  brokerUserId: string,
  firmId: string,
  role: string,
): Promise<ActionResult> {
  try {
    await requireStaff();
    if (!isBrokerRole(role)) return { ok: false, error: `unknown role "${role}"` };
    const res = await assignBroker(brokerUserId, firmId || null, role);
    if (!res.ok) return res;
    revalidatePath("/crm/brokers");
    revalidatePath(`/crm/brokers/${brokerUserId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setBrokerStatusAction(
  brokerUserId: string,
  status: string,
): Promise<ActionResult> {
  try {
    await requireStaff();
    if (!isBrokerStatus(status)) return { ok: false, error: `unknown status "${status}"` };
    await setBrokerStatus(brokerUserId, status);
    revalidatePath("/crm/brokers");
    revalidatePath(`/crm/brokers/${brokerUserId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setBrokerNotesAction(
  brokerUserId: string,
  notes: string,
): Promise<ActionResult> {
  try {
    await requireStaff();
    await setBrokerNotes(brokerUserId, notes);
    revalidatePath(`/crm/brokers/${brokerUserId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ----------------------------------------------------------------- claims */

/**
 * Attach one historic deal to one broker. One click, one deal, no bulk button.
 *
 * There is deliberately no "attach all". The whole reason this is manual is
 * that each attachment grants sight of a specific borrower's file, and a bulk
 * button turns six considered decisions into one unconsidered one.
 */
export async function claimDealAction(
  applicationId: string,
  brokerUserId: string,
): Promise<ActionResult> {
  try {
    const staffUserId = await requireStaff();
    const res = await claimDeal(applicationId, brokerUserId, staffUserId);
    if (!res.ok) return res;

    /**
     * ONLY THIS BROKER'S PAGE. Do not revalidate "/crm" from here.
     *
     * The pipeline page shows no broker attribution, so attaching a deal
     * changes nothing visible on it — revalidating it was a reflex, not a
     * requirement. It also had a cost: every route under /crm is partially
     * prerendered, and invalidating the pipeline's shell from an action on a
     * different route left the whole /crm subtree serving its static shell with
     * the streamed half never arriving. The page looked permanently
     * half-loaded, with a 200 and no console error to explain it.
     *
     * Found 22 Sep 2026: the claim was the first action that reached across to
     * "/crm", and it was the first one after which every CRM page hung.
     */
    revalidatePath(`/crm/brokers/${brokerUserId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------- invitations */

/**
 * Invite a broker, with the firm and role decided up front.
 *
 * This is the control that makes the portal invitation-only in code rather than
 * in a Clerk dashboard setting. It is also what lets a broker land already
 * inside their firm instead of waiting in the unassigned queue.
 */
export async function inviteBrokerAction(
  email: string,
  firmId: string,
  role: string,
  note: string,
): Promise<ActionResult> {
  try {
    const staffUserId = await requireStaff();
    const res = await createInvite(email, firmId || null, role, note, staffUserId);
    if (!res.ok) return res;
    revalidatePath("/crm/brokers");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Revoke an invitation.
 *
 * Blocks a future sign-in only. Someone who already accepted has a broker row,
 * and SUSPENDING that row is what cuts off access — the screen says so beside
 * the button, because otherwise revoking reads as "locked out" and it is not.
 */
export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  try {
    const staffUserId = await requireStaff();
    await revokeInvite(inviteId, staffUserId);
    revalidatePath("/crm/brokers");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
