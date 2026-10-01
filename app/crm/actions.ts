"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, applications, contacts, crmTasks, participants } from "@/lib/db/schema";
import { STAGE_LABEL } from "@/lib/crm/view";
import { assertCrmStaff, signedInUser } from "@/lib/crm/access";
import { CLOSE_BULK_MAX, closableAsNotOurProduct, parseLostReason } from "@/lib/crm/board";
import {
  KIND_LABEL,
  isLoggableKind,
  parseNote,
  parseSnoozeDate,
  type LoggableKind,
} from "@/lib/crm/followup";
import { isUuid, parseDueDate, parseTaskTitle } from "@/lib/crm/tasks";
import { stopTermSheetFollowups } from "@/lib/crm/followups.server";
import { shouldSeed } from "@/lib/crm/docRequests";
import { seedRequestsSql } from "@/lib/crm/docRequestsSql";
import { stageMoveSql } from "@/lib/crm/stageMoveSql";
import { addDocRequest as addDocRequestRow, createDocList as createDocListRows, moveDocRequest as moveDocRequestRow } from "@/lib/crm/docRequests.server";
import { sendBrokerDocsUpdate, sendBrokerStageUpdate, setBrokerUpdatesOff, type Sender } from "@/lib/crm/brokerUpdates.server";
import { and, asc, desc, inArray, isNull, sql as dsql } from "drizzle-orm";
import { parseContactIds } from "@/lib/nurture/nurture";
import { enrollBestFit } from "@/lib/nurture/nurture.server";
import { drainNurtureSoon } from "@/lib/nurture/sync.server";

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

/** Shown when a save fails for a reason Luis cannot act on (the detail goes to the server log). */
const SAVE_FAILED = "That didn't save. Try again in a moment, or refresh the page.";

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
export type CrmRoute = "/crm" | "/crm/dashboard" | "/crm/board" | "/crm/contacts";
const CRM_ROUTES: readonly string[] = ["/crm", "/crm/dashboard", "/crm/board", "/crm/contacts"];

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
type MoveResult = { ok: true; moved?: { from: string; to: string } } | { ok: false; error: string };

/** db.execute results are `{ rows }` over Neon HTTP and a bare array elsewhere. */
const rowsOfResult = (r: unknown): unknown[] => (r as { rows?: unknown[] })?.rows ?? (Array.isArray(r) ? r : []);

async function moveStage(
  applicationId: string,
  toStage: string,
  userId: string,
  extra: { reason?: string; lostReason?: string } = {},
): Promise<MoveResult> {
  if (!(toStage in STAGE_LABEL)) return { ok: false, error: `unknown stage "${toStage}"` };

  const [current] = await db
    .select({ stage: applications.stage, product: applications.product, loanPurpose: applications.loanPurpose })
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

  // Refused if the deal changed since we read it — see lib/crm/stageMoveSql.ts.
  const moves = stageMoveSql({
    applicationId,
    from: current.stage,
    to: stage,
    at: now,
    by: userId,
    reason: extra.reason ?? "changed in the CRM",
    lostReason: extra.lostReason,
  }).map((q) => db.execute(q));
  // The document list starts itself at term sheet (lib/crm/docRequests.ts),
  // in the same batch: the stage and the list commit together. ON CONFLICT
  // DO NOTHING, so a later move adds only what is missing and never brings
  // back an item Luis removed. It only adds anything if this move landed.
  const results = (await db.batch(
    (shouldSeed(stage)
      ? [...moves, db.execute(seedRequestsSql(applicationId, current.product, current.loanPurpose, userId, now, { to: stage, at: now }))]
      : moves) as unknown as Parameters<typeof db.batch>[0],
  )) as unknown as unknown[];
  const updated = rowsOfResult(results[0]);
  if (updated.length === 0) {
    return { ok: false, error: "This deal changed while you had it open. Refresh the page and try again." };
  }
  return { ok: true, moved: { from: current.stage, to: stage } };
}

/* ------------------------------------------------------ broker updates */

/**
 * The broker hears about a change from Luis's own Gmail, AFTER the change is
 * saved and the response has gone (`after()`), so a slow or failed email never
 * slows or undoes the move. Whether they hear at all — broker on the deal,
 * active, not switched off, a stage worth telling — is decided in
 * lib/crm/brokerUpdates.server.ts, never here.
 */
async function senderOf(userId: string): Promise<Sender> {
  // The sender is the signed-in person's own address from Clerk, exactly as
  // app/crm/emailActions.ts takes it — never anything from the browser.
  const me = await signedInUser().catch(() => null);
  return { userId, userEmail: me?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null };
}

function tellBroker(applicationId: string, moved: { from: string; to: string }, by: Sender): void {
  after(async () => {
    try {
      await sendBrokerStageUpdate({ applicationId, from: moved.from, to: moved.to, by });
    } catch (e) {
      console.error("[broker-updates] stage email failed:", e instanceof Error ? e.message : e);
    }
  });
}

function tellBrokerDocs(applicationId: string, requestIds: string[] | null, added: boolean, by: Sender): void {
  after(async () => {
    try {
      await sendBrokerDocsUpdate({ applicationId, requestIds, added, by });
    } catch (e) {
      console.error("[broker-updates] documents email failed:", e instanceof Error ? e.message : e);
    }
  });
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
    if (res.moved) tellBroker(applicationId, res.moved, await senderOf(userId));
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
    if (res.moved) tellBroker(applicationId, res.moved, await senderOf(userId));
    revalidateFrom(from, "/crm/board");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The deal's own notes field.
 *
 * Takes the caller's route since the record card (2026-09-24) can edit notes
 * from the dashboard and the board as well as the Pipeline grid. It used to
 * refresh "/crm" unconditionally, which from any other page is exactly the
 * cross-route refresh CLAUDE.md forbids. The default keeps the grid's
 * two-argument call working unchanged.
 */
export async function setApplicationNotes(
  applicationId: string,
  notes: string,
  from: CrmRoute = "/crm",
): Promise<ActionResult> {
  try {
    await requireUser();
    const value = notes.trim();
    await db
      .update(applications)
      .set({ notes: value || null, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
    revalidateFrom(from, "/crm");
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
  from: CrmRoute = "/crm/contacts",
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
    // The Contacts grid passes three arguments and gets its own page; the
    // record card passes the page it is open on. Same rule as setApplicationNotes.
    revalidateFrom(from, "/crm/contacts");
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

/**
 * "Stop follow-ups" on the dashboard's term-sheet list. The deal stays where
 * it is; only the follow-up series for THIS term sheet stops (a re-issued term
 * sheet starts a new one). Rules: lib/crm/termSheetFollowups.ts.
 */
export async function stopFollowups(
  applicationId: string,
  from: CrmRoute = "/crm/dashboard",
): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    if (!isUuid(applicationId)) return { ok: false, error: "application not found" };
    const contactId = await borrowerContactId(applicationId);
    const ok = await stopTermSheetFollowups({ applicationId, contactId, by: userId });
    revalidateFrom(from, "/crm/dashboard");
    return ok ? { ok: true } : { ok: false, error: "This deal is no longer at term sheet." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not stop the follow-ups" };
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

/* ------------------------------------------------------------------ */
/* Tasks on a deal (migration 0010)                                     */
/* ------------------------------------------------------------------ */

/**
 * Add a task to a deal.
 *
 * The rules — title 1 to 200 characters, due date optional and never in the
 * past on the New York calendar — live in lib/crm/tasks.ts and are pinned by
 * tasks.regress.ts. The database CHECK repeats the title bound, so this is not
 * the only thing standing between a crafted POST and a blank task.
 */
export async function addTask(
  applicationId: string,
  title: string,
  dueOn: string,
  from: CrmRoute = "/crm",
): Promise<ActionResult> {
  try {
    const userId = await requireUser();

    const t = parseTaskTitle(title);
    if (!t.ok) return { ok: false, error: t.error };
    const due = parseDueDate(dueOn, new Date());
    if (!due.ok) return { ok: false, error: due.error };
    if (!isUuid(applicationId)) return { ok: false, error: "application not found" };

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) return { ok: false, error: "application not found" };

    await db.insert(crmTasks).values({
      applicationId,
      title: t.value,
      dueOn: due.value,
      createdBy: userId,
    });

    revalidateFrom(from, "/crm");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not add that task" };
  }
}

/**
 * Tick a task off, or un-tick it.
 *
 * Who finished it is recorded with when. Un-ticking clears both, so a task
 * reopened by mistake does not keep a completion stamp it no longer has.
 */
export async function toggleTask(
  taskId: string,
  done: boolean,
  from: CrmRoute = "/crm",
): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    if (!isUuid(taskId)) return { ok: false, error: "task not found" };

    const now = new Date();
    const updated = await db
      .update(crmTasks)
      .set(
        done === true
          ? { completedAt: now, completedBy: userId, updatedAt: now }
          : { completedAt: null, completedBy: null, updatedAt: now },
      )
      .where(and(eq(crmTasks.id, taskId), isNull(crmTasks.deletedAt)))
      .returning({ id: crmTasks.id });
    if (updated.length === 0) return { ok: false, error: "task not found" };

    revalidateFrom(from, "/crm");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not update that task" };
  }
}

/**
 * Remove a task. SOFT: the row stays with who removed it and when, so a task
 * that disappeared from a deal can be explained afterwards. The card never
 * reads a removed task back.
 */
export async function deleteTask(
  taskId: string,
  from: CrmRoute = "/crm",
): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    if (!isUuid(taskId)) return { ok: false, error: "task not found" };

    const now = new Date();
    const removed = await db
      .update(crmTasks)
      .set({ deletedAt: now, deletedBy: userId, updatedAt: now })
      .where(and(eq(crmTasks.id, taskId), isNull(crmTasks.deletedAt)))
      .returning({ id: crmTasks.id });
    if (removed.length === 0) return { ok: false, error: "task not found" };

    revalidateFrom(from, "/crm");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not remove that task" };
  }
}

/* ------------------------------------------------------ document requests */

/**
 * The record card's "Documents needed" controls. Each re-checks staff here
 * AND in lib/crm/docRequests.server.ts, and refreshes only the page the card
 * is open on (`from`, guard §8b).
 */
export async function createDocList(applicationId: string, from: CrmRoute): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    const r = await createDocListRows(applicationId, userId);
    if (r.ok) {
      tellBrokerDocs(applicationId, null, false, await senderOf(userId));
      revalidateFrom(from, "/crm");
    }
    return r;
  } catch (err) {
    console.error("[crm] createDocList failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function addDocRequest(applicationId: string, label: string, note: string, from: CrmRoute): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    const r = await addDocRequestRow(applicationId, label, note, userId);
    if (!r.ok) return r;
    tellBrokerDocs(applicationId, [r.id], true, await senderOf(userId));
    revalidateFrom(from, "/crm");
    return { ok: true };
  } catch (err) {
    console.error("[crm] addDocRequest failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function moveDocRequest(requestId: string, move: string, note: string, from: CrmRoute): Promise<ActionResult> {
  try {
    const userId = await requireUser();
    const r = await moveDocRequestRow(requestId, move, note, userId);
    if (r.ok) revalidateFrom(from, "/crm");
    return r;
  } catch (err) {
    console.error("[crm] moveDocRequest failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** The record card's "Email the broker about this deal" switch. */
export async function setBrokerUpdates(applicationId: string, on: boolean, from: CrmRoute): Promise<ActionResult> {
  try {
    await requireUser();
    const ok = await setBrokerUpdatesOff(applicationId, !on);
    if (!ok) return { ok: false, error: "Deal not found." };
    revalidateFrom(from, "/crm");
    return { ok: true };
  } catch (err) {
    console.error("[crm] setBrokerUpdates failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/* ------------------------------------------------------- nurture, in bulk */

export type NurtureAddResult = { ok: true; message: string; added: number } | { ok: false; error: string };

/**
 * The dashboard's "Add to nurture" button on "No movement" (1 Oct 2026).
 *
 * The browser sends contact ids and nothing else: lib/nurture/nurture.server.ts
 * `enrollBestFit` re-reads each person and puts them in the ONE programme
 * classify() picks today, or skips them. Everyone is queued; the warm-up
 * releases them on weekday mornings while that programme's emails are on.
 * `after()` nudges the queue straight away, as the Enrol button does.
 */
export async function addToNurture(contactIds: unknown, from: CrmRoute): Promise<NurtureAddResult> {
  try {
    const userId = await requireUser();
    const ids = parseContactIds(contactIds);
    if (!ids.ok) return { ok: false, error: ids.error };
    const r = await enrollBestFit({ contactIds: ids.ids, by: userId, now: new Date() });
    const total = r.added.reduce((n, a) => n + a.count, 0);
    if (total === 0) return { ok: false, error: "Nobody was added. They no longer qualify: someone got in touch, a deal moved, or they are already in a programme." };
    revalidateFrom(from, "/crm/dashboard");
    after(() => drainNurtureSoon());
    const parts = r.added.map((a) => `${a.count} to ${a.name}`).join(", ");
    const skipped = r.skipped > 0 ? ` ${r.skipped} skipped: they no longer qualify.` : "";
    return { ok: true, added: total, message: `Added ${parts}.${skipped}` };
  } catch (err) {
    console.error("[crm] addToNurture failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/* ---------------------------------------- close "Not our product" in bulk */

export type BulkCloseResult = { ok: true; message: string; closed: number } | { ok: false; error: string };

/**
 * The dashboard's "Close as lost" for deals marked Not our product (1 Oct 2026).
 *
 * Ids only from the browser. Each deal is re-read here and moved ONLY if it is
 * still marked Not our product and still before term sheet
 * (closableAsNotOurProduct). Every move goes through the same moveStage as
 * markLost, one deal at a time — a history row each, the lost reason "Not our
 * product", the stale-page guard, and the usual "file closed" email to a
 * broker on the deal. One refresh of the caller's route at the end.
 */
export async function closeNotOurProduct(applicationIds: unknown, from: CrmRoute): Promise<BulkCloseResult> {
  try {
    const userId = await requireUser();
    if (!Array.isArray(applicationIds)) return { ok: false, error: "Nothing was selected." };
    const ids = [...new Set(applicationIds.filter((v): v is string => typeof v === "string" && isUuid(v)))];
    if (ids.length === 0) return { ok: false, error: "Nothing was selected." };
    if (ids.length > CLOSE_BULK_MAX) return { ok: false, error: `Close at most ${CLOSE_BULK_MAX} at a time.` };

    const reason = parseLostReason("Not our product", "");
    if (!reason.ok) return { ok: false, error: reason.error };
    const rows = await db
      .select({ id: applications.id, stage: applications.stage, product: applications.product })
      .from(applications)
      .where(inArray(applications.id, ids));
    const eligible = rows.filter((r) => closableAsNotOurProduct({ stage: String(r.stage), product: r.product ? String(r.product) : null }));

    const sender = await senderOf(userId);
    let closed = 0;
    for (const r of eligible) {
      const res = await moveStage(r.id, "closed_lost", userId, { reason: `lost: ${reason.value}`, lostReason: reason.value });
      if (res.ok && res.moved) {
        closed++;
        tellBroker(r.id, res.moved, sender);
      }
    }
    if (closed === 0) return { ok: false, error: "Nothing was closed. They are no longer marked Not our product, or have moved on since this page loaded." };
    revalidateFrom(from, "/crm/dashboard");
    const skipped = ids.length - closed;
    return {
      ok: true,
      closed,
      message: `Closed ${closed} as lost (Not our product).${skipped > 0 ? ` ${skipped} left as they were: they changed since this page loaded.` : ""}`,
    };
  } catch (err) {
    console.error("[crm] closeNotOurProduct failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
