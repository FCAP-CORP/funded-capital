/**
 * The EXECUTOR for texts: the only code path that sends anything to Quo.
 *
 * CLAUDE.md: "Any automated SMS send must verify consent at the current
 * version before sending, enforced in the executor rather than in
 * configuration so it cannot be switched off." This is that executor. Both
 * ways in — a new send and a retry — re-read the contact from the database and
 * run `canText()` against CONSENT_VERSION immediately before handing the text
 * to the provider. The record card's greyed-out button is a courtesy; this is
 * the control. guards.regress.ts §11 pins the order.
 *
 * THE OUTBOX. Every attempt is an `outbound_messages` row written BEFORE the
 * provider is called, so a crash mid-send leaves evidence rather than nothing:
 *
 *   refused by the gate  → a `blocked` row with the reason. Nothing is sent.
 *   allowed              → a `sending` row (claimed, attempts = 1), then Quo.
 *   Quo accepts          → the row becomes `sent` AND the `sms_out` activity is
 *                          written, in ONE db.batch.
 *   Quo refuses          → `failed`, with Quo's answer in plain English.
 *   no answer / timeout  → stays `sending`: outcome unknown. Quo's delivery
 *                          webhook heals it to `delivered` if it went. A person
 *                          may retry it only once it is stale (15 minutes).
 *
 * WHY THE ACTIVITY IS WRITTEN ON SUCCESS, NOT BEFORE. The activity table feeds
 * the dashboard's "never contacted" and "last contact" logic
 * (lib/db/contactKinds.ts counts `sms_out`). A pending `sms_out` row written
 * before the send would count a text that Quo then refused as contact — and
 * the borrower would silently drop out of the never-contacted queue. So the
 * outbox row is the intent; the activity is the fact. The timeline shows both:
 * unsent rows from the outbox, sent ones from the activity.
 *
 * IDEMPOTENCY. The browser mints one uuid per compose. It is UNIQUE on the
 * outbox, the insert is ON CONFLICT DO NOTHING, and a repeat returns the first
 * attempt's outcome without sending. A double-click, a flaky network resending
 * the action, or two tabs: one text.
 *
 * STAFF. This module does not assert staff itself — its only caller,
 * app/crm/commsActions.ts, does so before every call, and guards §11 asserts
 * that file is the only importer. That mirrors lib/leads/biggerpockets.server.ts
 * (secret-guarded by its one route). What this module DOES assert, for every
 * caller, is consent — which is the rule that cannot depend on who is asking.
 *
 * NEVER THROWS FOR A NORMAL OUTCOME. Blocked, refused and unknown are values.
 * Only a database outage escapes, and the action turns that into a sentence.
 */

import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { activities, applications, contacts, outboundMessages, participants } from "@/lib/db/schema";
import { CONSENT_VERSION } from "@/lib/consent";
import { isUuid } from "@/lib/crm/tasks";
import { canText, type SmsGateContact, type TextPermit } from "./consent";
import { quoFromNumber, quoSend } from "./quo.server";
import { STALE_SEND_MINUTES, canRetry, parseSmsBody } from "./sms";

type Db = typeof defaultDb;

export type CommsDeps = {
  db: Db;
  /** The provider client. Tests pass a stub; production is Quo. */
  send: typeof quoSend;
  now: () => Date;
  from: string;
};

const defaults = (): CommsDeps => ({ db: defaultDb, send: quoSend, now: () => new Date(), from: quoFromNumber() });

export type SendStatus = "sent" | "already_sent" | "blocked" | "failed" | "unknown" | "invalid";

export type SendOutcome = {
  ok: boolean;
  status: SendStatus;
  outboundId: string | null;
  /** A sentence for the person who pressed Send. */
  message: string;
};

export type SendRequest = {
  applicationId?: string | null;
  contactId?: string | null;
  body: string;
  idempotencyKey: string;
  /** Clerk user id of the (already verified) staff member. */
  userId: string;
};

type GateRow = SmsGateContact & { id: string };

const gateColumns = {
  id: contacts.id,
  phone: contacts.phone,
  smsOptedOut: contacts.smsOptedOut,
  smsConsentAt: contacts.smsConsentAt,
  smsConsentVersion: contacts.smsConsentVersion,
  leadSource: contacts.leadSource,
};

const invalid = (message: string): SendOutcome => ({ ok: false, status: "invalid", outboundId: null, message });

/**
 * Who a text to this deal goes to, read fresh.
 *
 * With only an application: its primary contact, chosen exactly as the card,
 * the pipeline and the dashboard choose it (borrower first, then earliest
 * attached), so the text goes to the person the card is named after. With a
 * contact as well: that contact, but only if they are actually on the deal —
 * a crafted request cannot pair one borrower's deal with another's phone.
 */
async function loadTarget(
  db: Db,
  applicationId: string | null,
  contactId: string | null,
): Promise<{ ok: true; contact: GateRow | null; applicationId: string | null } | { ok: false; message: string }> {
  if (applicationId) {
    const [app] = await db.select({ id: applications.id }).from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!app) return { ok: false, message: "That deal no longer exists." };
  }

  if (contactId) {
    if (applicationId) {
      const [link] = await db
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.applicationId, applicationId), eq(participants.contactId, contactId)))
        .limit(1);
      if (!link) return { ok: false, message: "That person is not on this deal." };
    }
    const [c] = await db.select(gateColumns).from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!c) return { ok: false, message: "That contact no longer exists." };
    return { ok: true, contact: c, applicationId };
  }

  const [c] = await db
    .select(gateColumns)
    .from(participants)
    .innerJoin(contacts, eq(contacts.id, participants.contactId))
    .where(eq(participants.applicationId, applicationId as string))
    .orderBy(desc(sql`(${participants.role} = 'borrower')`), asc(participants.createdAt), asc(participants.contactId))
    .limit(1);
  return { ok: true, contact: c ?? null, applicationId };
}

/** What a second press of the same Send learns about the first. Never sends. */
function replay(row: { id: string; status: string; error: string | null }): SendOutcome {
  switch (row.status) {
    case "sent":
    case "delivered":
      return { ok: true, status: "already_sent", outboundId: row.id, message: "Already sent." };
    case "blocked":
      return { ok: false, status: "blocked", outboundId: row.id, message: row.error ?? "Blocked by the consent check." };
    case "failed":
      return { ok: false, status: "failed", outboundId: row.id, message: `Not sent: ${row.error ?? "Quo refused it."} Use Retry on the timeline.` };
    default:
      return {
        ok: false,
        status: "unknown",
        outboundId: row.id,
        message: "This text is already on its way. Check the timeline in a moment rather than sending again.",
      };
  }
}

/**
 * Send a new text. The ONLY way a new text reaches Quo.
 */
export async function executeSendText(req: SendRequest, deps: Partial<CommsDeps> = {}): Promise<SendOutcome> {
  const d = { ...defaults(), ...deps };

  const body = parseSmsBody(req.body);
  if (!body.ok) return invalid(body.error);
  if (!isUuid(req.idempotencyKey)) return invalid("This send has no id. Close the text box, open it again and resend.");
  const applicationId = req.applicationId ?? null;
  const contactId = req.contactId ?? null;
  if (!applicationId && !contactId) return invalid("Say who the text is for.");
  if ((applicationId && !isUuid(applicationId)) || (contactId && !isUuid(contactId))) return invalid("That deal or contact could not be found.");

  // A repeat of a send we already handled: report it, never send again.
  const [seen] = await d.db
    .select({ id: outboundMessages.id, status: outboundMessages.status, error: outboundMessages.error })
    .from(outboundMessages)
    .where(eq(outboundMessages.idempotencyKey, req.idempotencyKey))
    .limit(1);
  if (seen) return replay(seen);

  const target = await loadTarget(d.db, applicationId, contactId);
  if (!target.ok) return invalid(target.message);

  // THE GATE. Fresh row, current wording, every time. See the file header.
  const gate = canText(target.contact, { currentVersion: CONSENT_VERSION });
  const now = d.now();

  if (!gate.ok) {
    const [blocked] = await d.db
      .insert(outboundMessages)
      .values({
        idempotencyKey: req.idempotencyKey,
        contactId: target.contact?.id ?? null,
        applicationId: target.applicationId,
        toPhone: target.contact?.phone ?? null,
        fromPhone: d.from,
        body: body.value,
        status: "blocked",
        error: gate.reason,
        createdBy: req.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: outboundMessages.idempotencyKey })
      .returning({ id: outboundMessages.id });
    return { ok: false, status: "blocked", outboundId: blocked?.id ?? null, message: gate.reason };
  }

  // Claim: the row is born `sending`, so there is never a moment where two
  // requests could both see it `queued` and both send.
  const [claimed] = await d.db
    .insert(outboundMessages)
    .values({
      idempotencyKey: req.idempotencyKey,
      contactId: target.contact!.id,
      applicationId: target.applicationId,
      toPhone: gate.phone,
      fromPhone: d.from,
      body: body.value,
      status: "sending",
      consentVersion: gate.consentVersion,
      consentAt: new Date(gate.consentAt),
      attempts: 1,
      lastAttemptAt: now,
      createdBy: req.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: outboundMessages.idempotencyKey })
    .returning({ id: outboundMessages.id });

  if (!claimed) {
    // Lost a race with an identical request that got here first.
    const [first] = await d.db
      .select({ id: outboundMessages.id, status: outboundMessages.status, error: outboundMessages.error })
      .from(outboundMessages)
      .where(eq(outboundMessages.idempotencyKey, req.idempotencyKey))
      .limit(1);
    return first ? replay(first) : invalid("This send collided with another. Check the timeline before sending again.");
  }

  return deliver(d, gate, {
    id: claimed.id,
    body: body.value,
    contactId: target.contact!.id,
    applicationId: target.applicationId,
    userId: req.userId,
  });
}

/**
 * Try a failed (or stuck) text again. Staff-initiated only.
 *
 * Consent is checked AGAIN, against the contact as it is now: a borrower who
 * replied STOP after the first attempt failed must not receive the retry. If
 * the number on file has changed, the retry is refused — consent belongs to a
 * person at a number, and this text was written for the old one.
 */
export async function executeRetryText(
  outboundId: string,
  userId: string,
  deps: Partial<CommsDeps> = {},
): Promise<SendOutcome> {
  const d = { ...defaults(), ...deps };
  if (!isUuid(outboundId)) return invalid("That text could not be found.");

  const [row] = await d.db.select().from(outboundMessages).where(eq(outboundMessages.id, outboundId)).limit(1);
  if (!row) return invalid("That text could not be found.");
  const now = d.now();
  if (!canRetry(row, now)) {
    if (row.status === "sending" || row.status === "queued") {
      return { ok: false, status: "unknown", outboundId, message: `Quo may still be sending this one. Retry becomes available ${STALE_SEND_MINUTES} minutes after the last attempt.` };
    }
    return { ok: false, status: "invalid", outboundId, message: row.status === "blocked" ? "A blocked text cannot be retried; it needs consent, not another attempt." : "This text was already sent." };
  }

  const [contact] = row.contactId
    ? await d.db.select(gateColumns).from(contacts).where(eq(contacts.id, row.contactId)).limit(1)
    : [];

  // THE GATE, again. The consent that allowed the first attempt may be gone.
  const gate = canText(contact ?? null, { currentVersion: CONSENT_VERSION });
  if (!gate.ok) {
    if (row.status === "failed") {
      await d.db
        .update(outboundMessages)
        .set({ status: "blocked", error: gate.reason, updatedAt: now })
        .where(and(eq(outboundMessages.id, outboundId), eq(outboundMessages.status, "failed")));
    }
    return { ok: false, status: "blocked", outboundId, message: gate.reason };
  }
  if (gate.phone !== row.toPhone) {
    return invalid("The phone number on file has changed since this text was written. Send a new text instead.");
  }

  const staleBefore = new Date(now.getTime() - STALE_SEND_MINUTES * 60_000);
  const [claimed] = await d.db
    .update(outboundMessages)
    .set({
      status: "sending",
      attempts: sql`${outboundMessages.attempts} + 1`,
      lastAttemptAt: now,
      consentVersion: gate.consentVersion,
      consentAt: new Date(gate.consentAt),
      error: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(outboundMessages.id, outboundId),
        isNull(outboundMessages.providerMessageId),
        or(
          eq(outboundMessages.status, "failed"),
          and(
            inArray(outboundMessages.status, ["sending", "queued"]),
            lt(sql`coalesce(${outboundMessages.lastAttemptAt}, ${outboundMessages.createdAt})`, staleBefore),
          ),
        ),
      ),
    )
    .returning({ id: outboundMessages.id });
  if (!claimed) {
    return { ok: false, status: "unknown", outboundId, message: "Someone is already retrying this text, or it has just been delivered." };
  }

  return deliver(d, gate, {
    id: row.id,
    body: row.body,
    contactId: row.contactId,
    applicationId: row.applicationId,
    userId,
  });
}

/**
 * Hand one claimed row to Quo and record what happened.
 *
 * Takes a TextPermit — only `canText()` produces one — so it cannot be reached
 * without the gate. Not exported: the two functions above are the only doors.
 */
async function deliver(
  d: CommsDeps,
  permit: TextPermit,
  row: { id: string; body: string; contactId: string | null; applicationId: string | null; userId: string },
): Promise<SendOutcome> {
  const res = await d.send(permit, row.body, { from: d.from });
  const now = d.now();

  if (res.ok) {
    try {
      await d.db.batch([
        d.db
          .update(outboundMessages)
          .set({ status: "sent", providerMessageId: res.messageId, sentAt: now, error: null, updatedAt: now })
          // A delivery webhook that raced ahead may already have marked it
          // delivered; never walk that back to "sent".
          .where(and(eq(outboundMessages.id, row.id), inArray(outboundMessages.status, ["sending", "queued", "failed"]))),
        d.db
          .insert(activities)
          .values({
            contactId: row.contactId,
            applicationId: row.applicationId,
            kind: "sms_out",
            occurredAt: now,
            source: "crm",
            subject: null,
            body: row.body,
            metadata: {
              provider: "quo",
              outboundId: row.id,
              quoMessageId: res.messageId,
              by: row.userId,
              consentVersion: permit.consentVersion,
            },
            // Quo's message id, so its delivery webhook for this same text
            // collides here instead of adding a second row.
            dedupKey: res.messageId ? `quo:msg:${res.messageId}` : `outbox:${row.id}`,
          })
          .onConflictDoNothing({ target: activities.dedupKey }),
      ]);
    } catch {
      // Quo has it; only our bookkeeping failed. The delivery webhook will
      // match the row by number and text and complete it.
      return { ok: true, status: "sent", outboundId: row.id, message: "Sent — the timeline will catch up when Quo confirms delivery." };
    }
    return { ok: true, status: "sent", outboundId: row.id, message: "Sent." };
  }

  if (res.outcome === "rejected") {
    await d.db
      .update(outboundMessages)
      .set({ status: "failed", error: res.error, updatedAt: now })
      .where(and(eq(outboundMessages.id, row.id), eq(outboundMessages.status, "sending")));
    return { ok: false, status: "failed", outboundId: row.id, message: `Not sent: ${res.error}` };
  }

  // Unknown: leave it `sending` and say so. Retrying now could double-send.
  await d.db
    .update(outboundMessages)
    .set({ error: res.error, updatedAt: now })
    .where(and(eq(outboundMessages.id, row.id), eq(outboundMessages.status, "sending")));
  return { ok: false, status: "unknown", outboundId: row.id, message: res.error };
}
