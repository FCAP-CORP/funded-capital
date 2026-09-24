"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, applications, contacts, participants, stageTransitions } from "@/lib/db/schema";
import { STAGE_LABEL } from "@/lib/crm/view";
import { assertCrmStaff } from "@/lib/crm/access";
import { parseLostReason } from "@/lib/crm/board";
import {
  KIND_LABEL,
  isLoggableKind,
  parseNote,
  parseSnoozeDate,
  type LoggableKind,
} from "@/lib/crm/followup";
import { and, asc, desc, sql as dsql } from "drizzle-orm";

/**
 * Write actions for the CRM grid.
 *
 * Every one of these re-checks BOTH that the caller is signed in and that they
 * are on the staff allowlist. The middleware guards /crm and the pages gate
 * themselves, but a server action is an addressable endpoint in its own right:
 * it is reachable with a crafted POST by anyone who can sign in, regardless of
 * which page they can load. Gating the page and not the action is how a
 * read-only leak becomes a write.
 */
async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("not signed in");
  await assertCrmStaff();
  return userId;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The routes an action in this file may be called from, and so may refresh.
 *
 * ONE ROUTE PER CALL, and only the caller's own. See CLAUDE.md, "Do not
 * revalidatePath a PPR route from a server action on a different route": an
 * action invoked on one /crm page that refreshed another left the whole /crm
 * subtree serving its shell forever — heading painted, data never arriving, no
 * error anywhere. The caller says where it is; anything not on this list falls
 * back to the action's default rather than being passed to revalidatePath,
 * because a server action's arguments arrive from the browser.
 */
export type CrmRoute = "/crm" | "/crm/dashboard" | "/crm/board";
const CRM_ROUTES: readonly string[] = ["/crm", "/crm/dashboard", "/crm/board"];

function revalidateFrom(from: unknown, fallback: CrmRoute): void {
  revalidatePath(typeof from === "string" && CRM_ROUTES.includes(from) ? from : fallback);
}

/**
 * The one place a deal changes stage.
 *
 * Both a plain move and a lost drop come through here, so the history row and
 * the cached stage column are written the same way every time. It does not
 * refresh anything — each caller refreshes its own route, once.
 *
 * db.batch, NOT db.transaction: lib/db uses the neon-http driver, which throws
 * "No transactions support in neon-http driver" the moment db.transaction() is
 * called. It compiles cleanly, so the typecheck and the build both pass and the
 * failure only appears the first time someone moves a deal. db.batch sends both
 * statements in one request wrapped in a real Postgres transaction: the history
 * row and the cached column commit together or neither does.
 */
async function moveStage(
  applicationId: string,
  toStage: string,
  userId: string,
  extra: { reason?: string; lostReason?: string } = {},
): Promise<ActionResult> {
  if (!(toStage in STAGE_LABEL)) return { ok: false, error: `unknown stage "${toStage}"` };

  const [current] = await db
    .select({ stage: applications.stage })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!current) return { ok: false, error: "application not found" };
  if (current.stage === toStage && extra.lostReason === undefined) return { ok: true }; // no phantom history

  const now = new Date();
  const stage = toStage as typeof current.stage;

  if (current.stage === toStage) {
    // Already lost; only the reason is being recorded or corrected.
    await db
      .update(applications)
      .set({ lostReason: extra.lostReason, updatedAt: now })
      .where(eq(applications.id, applicationId));
    return { ok: true };
  }

  await db.batch([
    db.insert(stageTransitions).values({
      applicationId,
      fromStage: current.stage,
      toStage: stage,
      changedAt: now,
      changedBy: userId,
      reason: extra.reason ?? "changed in the CRM",
    }),
    db
      .update(applications)
      .set({
        stage,
        stageEnteredAt: now,
        updatedAt: now,
        ...(extra.lostReason !== undefined ? { lostReason: extra.lostReason } : {}),
      })
      .where(eq(applications.id, applicationId)),
  ]);
  return { ok: true };
}

/**
 * Move a deal to a new stage.
 *
 * The transition row is the point. `applications.stage` is only a cache of the
 * newest transition — writing the column without the history is what made the
 * old spreadsheet's "Days in Stage" permanently empty, and it is why no
 * conversion or time-in-stage question could be answered about the last year.
 * Both writes happen together, or the stage does not move.
 */
export async function setStage(
  applicationId: string,
  toStage: string,
  from: CrmRoute = "/crm",
): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    const res = await moveStage(applicationId, toStage, userId);
    if (!res.ok) return res;
    revalidateFrom(from, "/crm");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Close a deal as lost, and record why.
 *
 * The reason goes on the deal (applications.lost_reason, which existed from the
 * first migration and was never written until this) AND on the history row, so
 * a later question like "how many did we lose on rate this quarter?" can be
 * answered from either. A lost deal with no reason teaches nothing, so the
 * reason is required — the board asks before it calls this.
 */
export async function markLost(
  applicationId: string,
  choice: string,
  note: string,
  from: CrmRoute = "/crm/board",
): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    const reason = parseLostReason(choice, note);
    if (!reason.ok) return { ok: false, error: reason.error };
    const res = await moveStage(applicationId, "closed_lost", userId, {
      reason: `lost: ${reason.value}`,
      lostReason: reason.value,
    });
    if (!res.ok) return res;
    revalidateFrom(from, "/crm/board");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

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

/* ------------------------------------------------------------------ */
/* Working the queue: logging a touch, and putting a deal down         */
/* ------------------------------------------------------------------ */

/**
 * The contact an activity belongs to.
 *
 * Same ordering as the dashboard's LATERAL join — borrower first, then oldest
 * attachment, then id — so a logged call lands on the same person the queue row
 * is named after. Picking differently here would file the call against someone
 * the screen never mentioned.
 */
async function borrowerContactId(applicationId: string): Promise<string | null> {
  const [row] = await db
    .select({ contactId: participants.contactId })
    .from(participants)
    .where(eq(participants.applicationId, applicationId))
    .orderBy(
      desc(dsql`(${participants.role} = 'borrower')`),
      asc(participants.createdAt),
      asc(participants.contactId),
    )
    .limit(1);
  return row?.contactId ?? null;
}

/**
 * Record something you did: a call, an email, a text, or a note to yourself.
 *
 * The kind is checked against a whitelist that excludes everything inbound.
 * A hand-typed "they emailed me" would clear `awaiting_reply` — the one signal
 * on the dashboard that means a borrower is being ignored — so the only person
 * whose actions you can log here is you.
 */
export async function logContact(
  applicationId: string,
  kind: string,
  note: string,
  from: CrmRoute = "/crm/dashboard",
): Promise<ActionResult> {
  try {
    const userId = await requireUser();

    if (!isLoggableKind(kind)) {
      return { ok: false, error: "that is not something you can log by hand" };
    }
    // A note with no words is nothing. A logged call needs no commentary.
    const body = parseNote(note, kind === "note");
    if (!body.ok) return { ok: false, error: body.error };

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) return { ok: false, error: "application not found" };

    const contactId = await borrowerContactId(applicationId);

    await db.insert(activities).values({
      applicationId,
      contactId,
      kind: kind as LoggableKind,
      occurredAt: new Date(),
      source: "crm",
      subject: KIND_LABEL[kind as LoggableKind],
      body: body.value,
      // dedupKey stays null. It is the unique key for provider webhooks, which
      // are at-least-once; a person pressing a button is not, and two calls to
      // the same borrower in one day are two calls.
      metadata: { by: userId },
    });

    revalidateFrom(from, "/crm/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not log that" };
  }
}

/**
 * Put a deal down until a date.
 *
 * Writes when the decision was taken as well as when to come back, because the
 * dashboard voids the snooze if the borrower makes contact afterwards. Without
 * the set-at timestamp there is no way to tell "they wrote before I parked
 * this" from "they wrote after", and the safe reading of that ambiguity is to
 * surface the deal — which would make snoozing useless.
 *
 * Also logs a note, so the history shows the decision rather than the deal
 * silently vanishing from the queue for a fortnight.
 */
export async function setSnooze(
  applicationId: string,
  until: string,
  note: string,
  from: CrmRoute = "/crm/dashboard",
): Promise<ActionResult> {
  try {
    const userId = await requireUser();

    const when = parseSnoozeDate(until);
    if (!when.ok) return { ok: false, error: when.error };
    const why = parseNote(note);
    if (!why.ok) return { ok: false, error: why.error };

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) return { ok: false, error: "application not found" };

    const now = new Date();
    const contactId = await borrowerContactId(applicationId);

    await db.batch([
      db
        .update(applications)
        .set({
          nextActionAt: new Date(when.value),
          nextActionSetAt: now,
          nextActionNote: why.value,
          updatedAt: now,
        })
        .where(eq(applications.id, applicationId)),
      db.insert(activities).values({
        applicationId,
        contactId,
        kind: "note",
        occurredAt: now,
        source: "crm",
        subject: `Put down until ${when.value.slice(0, 10)}`,
        body: why.value,
        metadata: { by: userId, nextActionAt: when.value },
      }),
    ]);

    revalidateFrom(from, "/crm/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not put that down" };
  }
}

/** Bring a snoozed deal back now. Clears all three columns together. */
export async function clearSnooze(
  applicationId: string,
  from: CrmRoute = "/crm/dashboard",
): Promise<ActionResult> {
  try {
    await requireUser();
    await db
      .update(applications)
      .set({ nextActionAt: null, nextActionSetAt: null, nextActionNote: null, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
    revalidateFrom(from, "/crm/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not bring that back" };
  }
}
