"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, contacts, stageTransitions } from "@/lib/db/schema";
import { STAGE_LABEL } from "@/lib/crm/view";

/**
 * Write actions for the CRM grid.
 *
 * Every one of these re-checks auth. The middleware already guards /crm, but a
 * server action is an addressable endpoint in its own right — it is reachable
 * with a crafted POST regardless of which page the caller claims to be on.
 */
async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("not signed in");
  return userId;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Move a deal to a new stage.
 *
 * The transition row is the point. `applications.stage` is only a cache of the
 * newest transition — writing the column without the history is what made the
 * old spreadsheet's "Days in Stage" permanently empty, and it is why no
 * conversion or time-in-stage question could be answered about the last year.
 * Both writes happen together, or the stage does not move.
 */
export async function setStage(applicationId: string, toStage: string): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    if (!(toStage in STAGE_LABEL)) return { ok: false, error: `unknown stage "${toStage}"` };

    const [current] = await db
      .select({ stage: applications.stage })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!current) return { ok: false, error: "application not found" };
    if (current.stage === toStage) return { ok: true }; // no-op, no phantom history

    const now = new Date();

    /**
     * db.batch, NOT db.transaction.
     *
     * lib/db uses the neon-http driver, which talks to Postgres over HTTP and
     * throws "No transactions support in neon-http driver" the moment
     * db.transaction() is called. It compiles cleanly, so the typecheck and the
     * build both pass and the failure only appears the first time someone moves
     * a deal. db.batch sends both statements in one request wrapped in a real
     * Postgres transaction, which is what this needs: the history row and the
     * cached column commit together or neither does.
     */
    await db.batch([
      db.insert(stageTransitions).values({
        applicationId,
        fromStage: current.stage,
        toStage: toStage as typeof current.stage,
        changedAt: now,
        changedBy: userId,
        reason: "changed in the CRM",
      }),
      db
        .update(applications)
        .set({ stage: toStage as typeof current.stage, stageEnteredAt: now, updatedAt: now })
        .where(eq(applications.id, applicationId)),
    ]);

    revalidatePath("/crm");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Free-text notes on a deal. Trimmed; an empty box clears the field. */
export async function setApplicationNotes(applicationId: string, notes: string): Promise<ActionResult> {
  try {
    await requireUser();
    const value = notes.trim();
    await db
      .update(applications)
      .set({ notes: value || null, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
    revalidatePath("/crm");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const EDITABLE_CONTACT_FIELDS = ["targetMarket", "creditBand", "notes", "ownerName"] as const;
export type EditableContactField = (typeof EDITABLE_CONTACT_FIELDS)[number];

/**
 * Edit one contact field in place.
 *
 * Deliberately NOT editable here: email, phone and consent. Email is the
 * identity key Klaviyo resolves on, phone must go through E.164 normalisation,
 * and consent state is mirrored IN from Klaviyo and Quo — never typed over.
 */
export async function setContactField(
  contactId: string, field: string, value: string,
): Promise<ActionResult> {
  try {
    await requireUser();
    if (!EDITABLE_CONTACT_FIELDS.includes(field as EditableContactField)) {
      return { ok: false, error: `"${field}" is not editable here` };
    }
    const v = value.trim();
    await db
      .update(contacts)
      .set({ [field]: v || null, updatedAt: new Date() })
      .where(eq(contacts.id, contactId));
    revalidatePath("/crm/contacts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
