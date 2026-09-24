/**
 * What a verified Quo webhook does to the database.
 *
 * SIGNATURE-GUARDED, BY ITS ONE CALLER. `app/api/webhooks/quo/route.ts`
 * verifies Quo's HMAC signature before it calls anything here, and
 * guards.regress.ts §11 asserts that the route is the only importer and that
 * the check comes first. There is no Clerk session on a webhook, so
 * `assertCrmStaff()` could never pass here — the signature is the credential.
 *
 * FAST ON PURPOSE. Quo gives a handler 10 seconds. Everything below is a
 * handful of single-row statements over Neon's HTTP driver: claim the event,
 * look up at most one phone number and one outbox row, then ONE db.batch for
 * the writes plus the "processed" stamp. Nothing here calls out to Quo or
 * anyone else — CLAUDE.md: outbound calls go through the outbox, never inline
 * in a handler.
 *
 * CLAIM, THEN WORK. `INSERT … ON CONFLICT (provider, event_id) DO NOTHING
 * RETURNING id` on webhook_events. A retry of an event already processed gets
 * an empty RETURNING and stops. A retry of an event that was claimed but never
 * finished (the function died, the batch failed) is processed again — every
 * write below is idempotent (dedup keys, status guards, `smsOptedOut = true`),
 * so doing it twice is the same as doing it once.
 *
 * CONSENT FLOWS INBOUND ONLY, AND ONLY ONE WAY. The single consent write in
 * this file sets `smsOptedOut = true` on a STOP. Nothing here grants consent,
 * clears an opt-out or touches email status; guards §11 fails the build if it
 * ever does. A START reply is recorded on the timeline and nothing more — see
 * `inboundKeyword` in lib/comms/consent.ts for why.
 *
 * A NUMBER THAT IS NOT IN THE CRM is not an error. The event stays in
 * webhook_events with its payload and an outcome saying so, and Quo gets its
 * 200 — making Quo retry for a day over a stranger's text would help no one.
 * Two contacts sharing one number: the text is not guessed onto either (the
 * same rule as the BiggerPockets intake), but a STOP still opts out both.
 */

import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { activities, contacts, outboundMessages, webhookEvents } from "@/lib/db/schema";
import { planQuoEvent, type PlannedActivity, type QuoEvent } from "./quoEvents";

type Db = typeof defaultDb;

export type WebhookDeps = { db: Db; now: () => Date };

export type WebhookOutcome = { duplicate: boolean; outcome: string };

/** How many contacts to read when matching a number: enough to know it is not one. */
const MATCH_LIMIT = 5;

/** A delivered text is matched to an unconfirmed CRM send within this window. */
const HEAL_WINDOW_MS = 24 * 60 * 60 * 1000;

async function contactsByPhone(db: Db, phone: string | null): Promise<string[]> {
  if (!phone) return [];
  const rows = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.phone, phone)).limit(MATCH_LIMIT);
  return rows.map((r) => r.id);
}

export async function handleQuoEvent(
  event: QuoEvent,
  payload: unknown,
  deps: Partial<WebhookDeps> = {},
): Promise<WebhookOutcome> {
  const d: WebhookDeps = { db: defaultDb, now: () => new Date(), ...deps };
  const now = d.now();

  /* -- 1. claim the event by Quo's own id -- */
  const [claimed] = await d.db
    .insert(webhookEvents)
    .values({ provider: "quo", eventId: event.id, type: event.type, payload: payload ?? {}, receivedAt: now })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventId] })
    .returning({ id: webhookEvents.id });

  if (!claimed) {
    const [prior] = await d.db
      .select({ processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.provider, "quo"), eq(webhookEvents.eventId, event.id)))
      .limit(1);
    if (prior?.processedAt) return { duplicate: true, outcome: "already processed" };
    // Claimed earlier but never finished: fall through and finish it.
  }

  const markDone = (outcome: string) =>
    d.db
      .update(webhookEvents)
      .set({ processedAt: now, outcome: outcome.slice(0, 500) })
      .where(and(eq(webhookEvents.provider, "quo"), eq(webhookEvents.eventId, event.id)));

  const insertActivity = (a: PlannedActivity, contactId: string | null, applicationId: string | null = null, extra: Record<string, unknown> = {}) =>
    d.db
      .insert(activities)
      .values({
        contactId,
        applicationId,
        kind: a.kind,
        occurredAt: a.occurredAt,
        source: a.source,
        subject: a.subject,
        body: a.body,
        metadata: { ...a.metadata, ...extra },
        dedupKey: a.dedupKey,
      })
      .onConflictDoNothing({ target: activities.dedupKey });

  /* -- 2. decide, with no database involved -- */
  const plan = planQuoEvent(event, now);

  /* -- 3. read what the writes depend on, then write once -- */
  if (plan.action === "ignore") {
    await markDone(`ignored: ${plan.reason}`);
    return { duplicate: false, outcome: `ignored: ${plan.reason}` };
  }

  if (plan.action === "sms_in") {
    const matches = await contactsByPhone(d.db, plan.phone);
    const writes = [];
    const notes: string[] = [];

    if (plan.keyword === "stop" && plan.phone) {
      // The one consent write this file may make, and it only ever revokes.
      writes.push(
        d.db
          .update(contacts)
          .set({ smsOptedOut: true, updatedAt: now })
          .where(eq(contacts.phone, plan.phone)),
      );
      notes.push(`STOP: opted out ${matches.length} contact${matches.length === 1 ? "" : "s"}`);
    }
    if (matches.length === 1) {
      writes.push(insertActivity(plan.activity, matches[0]));
      notes.push("logged text");
    } else {
      notes.push(matches.length === 0 ? `no contact has ${plan.phone ?? "that number"}` : `${matches.length} contacts share ${plan.phone}; not guessed`);
    }
    const outcome = notes.join("; ");
    await d.db.batch([...writes, markDone(outcome)] as unknown as Parameters<Db["batch"]>[0]);
    return { duplicate: false, outcome };
  }

  if (plan.action === "sms_status") {
    let [row] = await d.db
      .update(outboundMessages)
      .set(
        plan.status === "delivered"
          ? { status: "delivered", deliveredAt: now, updatedAt: now }
          : { status: plan.status, error: plan.errorCode ? `Carrier error ${plan.errorCode}` : "The carrier did not deliver it.", updatedAt: now },
      )
      .where(
        and(
          eq(outboundMessages.providerMessageId, plan.providerMessageId),
          inArray(outboundMessages.status, plan.status === "delivered" ? ["queued", "sending", "sent", "failed", "undelivered"] : ["sending", "sent"]),
        ),
      )
      .returning({ id: outboundMessages.id, contactId: outboundMessages.contactId, applicationId: outboundMessages.applicationId });

    if (!row && plan.status === "delivered" && plan.phone) {
      /*
       * Heal: a CRM send whose Quo answer never reached us (timeout, or our
       * write failed after Quo accepted it) is still `sending` with no Quo id.
       * Same number, same words, within a day, newest first.
       */
      const since = new Date(now.getTime() - HEAL_WINDOW_MS);
      [row] = await d.db
        .update(outboundMessages)
        .set({ status: "delivered", providerMessageId: plan.providerMessageId, deliveredAt: now, sentAt: sql`coalesce(${outboundMessages.sentAt}, ${now})`, error: null, updatedAt: now })
        .where(
          eq(
            outboundMessages.id,
            sql`(SELECT o.id FROM outbound_messages o
                 WHERE o.provider_message_id IS NULL
                   AND o.status IN ('queued', 'sending', 'failed')
                   AND o.to_phone = ${plan.phone}
                   AND o.body = ${plan.text.trim()}
                   AND o.created_at > ${since}
                 ORDER BY o.created_at DESC
                 LIMIT 1)`,
          ),
        )
        .returning({ id: outboundMessages.id, contactId: outboundMessages.contactId, applicationId: outboundMessages.applicationId });
    }

    const writes = [];
    let outcome: string;
    if (row) {
      outcome = `outbox ${plan.status}`;
      if (plan.activity) {
        // For a CRM send this collides with the row written at send time and
        // does nothing; for a healed send it is the first record of the text.
        writes.push(insertActivity(plan.activity, row.contactId, row.applicationId, { outboundId: row.id, sentFrom: "crm" }));
      }
    } else if (plan.activity) {
      // Sent from the Quo app, not the CRM: still worth a line on the timeline.
      const matches = await contactsByPhone(d.db, plan.phone);
      if (matches.length === 1) {
        writes.push(insertActivity(plan.activity, matches[0]));
        outcome = "logged text sent from Quo";
      } else {
        outcome = matches.length === 0 ? `no contact has ${plan.phone ?? "that number"}` : `${matches.length} contacts share ${plan.phone}; not guessed`;
      }
    } else {
      outcome = `no CRM text with Quo id ${plan.providerMessageId}`;
    }
    await d.db.batch([...writes, markDone(outcome)] as unknown as Parameters<Db["batch"]>[0]);
    return { duplicate: false, outcome };
  }

  // plan.action === "call"
  const matches = await contactsByPhone(d.db, plan.phone);
  const writes = [];
  let outcome: string;
  if (matches.length === 1) {
    writes.push(insertActivity(plan.activity, matches[0]));
    outcome = "logged call";
  } else {
    outcome = matches.length === 0 ? `no contact has ${plan.phone ?? "that number"}` : `${matches.length} contacts share ${plan.phone}; not guessed`;
  }
  await d.db.batch([...writes, markDone(outcome)] as unknown as Parameters<Db["batch"]>[0]);
  return { duplicate: false, outcome };
}
