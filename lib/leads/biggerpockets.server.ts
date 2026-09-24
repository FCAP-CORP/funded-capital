/**
 * BiggerPockets leads -> Lending OS. The database half.
 *
 * Called ONLY from app/api/crm/lead-intake/route.ts, which checks the shared
 * secret (CRM_SYNC_SECRET) before it calls anything here. This module is not
 * staff-guarded and cannot be: its caller is an Apps Script trigger with no
 * browser and no Clerk session. lib/crm/guards.regress.ts §10 asserts that the
 * route is its only importer, that the secret check comes first, and that the
 * tables written here are the six a lead needs and nothing else — no broker
 * tables, no documents, and never a DELETE.
 *
 * IDEMPOTENT, AND THE DATABASE ENFORCES IT, NOT THIS CODE. Every lead is
 * written as one `db.batch` — one Postgres transaction — whose last statement
 * inserts the activity carrying the lead's dedup key, with NO on-conflict
 * clause. The unique index on `activities.dedup_key` is the lock:
 *   - a resend, or an overlapping backfill, that slips past the read below
 *     fails that insert, and the transaction takes the application, property
 *     and stage row down with it. Nothing half-written survives;
 *   - the failure is recognised as a unique violation, the lead is re-read,
 *     and it is reported as `duplicate` — not as an error.
 * The same mechanism covers a brand-new contact: if two requests create the
 * same email at once, `contacts_email_key` rejects the second, it re-reads,
 * finds the contact the first one made, and reuses it.
 *
 * NEVER DISCARDS A LEAD. Each lead gets its own batch, its own try/catch and
 * its own result. One bad lead cannot stop the other 24 in a backfill batch,
 * and a database failure is logged under a greppable marker and reported back
 * to the Apps Script, which logs it too. The Google Sheet row was written
 * before any of this ran, so a failure here never loses the lead — it only
 * delays its arrival in /crm until the backfill is run again.
 *
 * ROUND TRIPS: four reads for the whole request (dedup keys, emails, phones,
 * migrated applications), then one batch per lead. A 25-lead backfill batch
 * is ~29 requests to Neon, well inside Vercel's 300 s limit.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";
import {
  buildBpRecord, buildBpRows, planBpWrite,
  type BpIntakeItem, type BpKnown, type BpRecord, type ExistingContact,
} from "./biggerpockets";

export type BpDb = NeonHttpDatabase<typeof schema>;

export type BpResult = {
  gmailMessageId: string | null;
  status: "created" | "duplicate" | "error";
  applicationId?: string;
  contactId?: string;
  /** For `duplicate`: why. For `created`: "new contact" or "repeat enquirer". */
  note?: string;
  error?: string;
};

/** Unique-index violation, however the driver wraps it. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 4; i++) {
    const code = (e as { code?: unknown }).code;
    if (code === "23505") return true;
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string" && /duplicate key value violates unique constraint/i.test(msg)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

const CONTACT_COLUMNS = {
  id: schema.contacts.id,
  email: schema.contacts.email,
  phone: schema.contacts.phone,
  firstName: schema.contacts.firstName,
  lastName: schema.contacts.lastName,
  creditBand: schema.contacts.creditBand,
  targetMarket: schema.contacts.targetMarket,
  state: schema.contacts.state,
  leadSource: schema.contacts.leadSource,
  externalIds: schema.contacts.externalIds,
};

/** Everything the planner needs for a set of leads, in four queries. */
async function readState(db: BpDb, items: { item: BpIntakeItem; rec: BpRecord }[]) {
  const keys = [...new Set(items.map((x) => x.item.dedupKey))];
  const emails = [...new Set(items.map((x) => x.rec.email).filter((e): e is string => Boolean(e)))];
  const phones = [...new Set(items.map((x) => x.rec.phone).filter((p): p is string => Boolean(p)))];

  const dedup = keys.length
    ? await db.select({ key: schema.activities.dedupKey, applicationId: schema.activities.applicationId })
        .from(schema.activities).where(inArray(schema.activities.dedupKey, keys))
    : [];
  const byEmailRows = emails.length
    ? await db.select(CONTACT_COLUMNS).from(schema.contacts)
        // Case-insensitive: some rows predate the lowercase-on-write rule.
        .where(inArray(sql`lower(${schema.contacts.email})`, emails))
    : [];
  const byPhoneRows = phones.length
    ? await db.select(CONTACT_COLUMNS).from(schema.contacts).where(inArray(schema.contacts.phone, phones))
    : [];

  const dedupHits = new Map<string, string | null>();
  for (const d of dedup) if (d.key) dedupHits.set(d.key, d.applicationId);

  const byEmail = new Map<string, ExistingContact>();
  for (const c of byEmailRows) if (c.email) byEmail.set(c.email.toLowerCase(), c as ExistingContact);

  const byPhone = new Map<string, ExistingContact[]>();
  for (const c of byPhoneRows) {
    if (!c.phone) continue;
    byPhone.set(c.phone, [...(byPhone.get(c.phone) ?? []), c as ExistingContact]);
  }

  // Applications the 14 Sep migration loaded (legacy_source exactly
  // 'biggerpockets'), for every contact we might reuse. See migratedTwin().
  const contactIds = [...new Set([...byEmailRows, ...byPhoneRows].map((c) => c.id))];
  const migrated = new Map<string, { id: string; submittedAt: Date | null }[]>();
  if (contactIds.length) {
    const rows = await db
      .select({
        contactId: schema.participants.contactId,
        id: schema.applications.id,
        submittedAt: schema.applications.submittedAt,
      })
      .from(schema.applications)
      .innerJoin(schema.participants, eq(schema.participants.applicationId, schema.applications.id))
      .where(and(
        eq(schema.applications.legacySource, "biggerpockets"),
        inArray(schema.participants.contactId, contactIds),
      ));
    for (const r of rows) {
      migrated.set(r.contactId, [...(migrated.get(r.contactId) ?? []), { id: r.id, submittedAt: r.submittedAt }]);
    }
  }

  return { dedupHits, byEmail, byPhone, migrated };
}

type State = Awaited<ReturnType<typeof readState>>;

function knownFor(state: State, item: BpIntakeItem, rec: BpRecord): BpKnown {
  const emailContact = rec.email ? state.byEmail.get(rec.email) ?? null : null;
  const phoneContacts = rec.phone ? state.byPhone.get(rec.phone) ?? [] : [];
  const candidate = emailContact ?? (!rec.email && phoneContacts.length === 1 ? phoneContacts[0] : null);
  return {
    dedupHit: state.dedupHits.has(item.dedupKey) ? { applicationId: state.dedupHits.get(item.dedupKey) ?? null } : null,
    emailContact,
    phoneContacts,
    migratedApps: candidate ? state.migrated.get(candidate.id) ?? [] : [],
  };
}

/** Write one lead as one transaction. Throws; the caller classifies. */
async function writeOne(
  db: BpDb, item: BpIntakeItem, rec: BpRecord, known: BpKnown, via: "live" | "backfill" | "unknown",
): Promise<BpResult> {
  const plan = planBpWrite(item, rec, known);
  if (plan.action === "duplicate") {
    return {
      gmailMessageId: item.gmailMessageId, status: "duplicate", note: plan.reason,
      ...(plan.applicationId ? { applicationId: plan.applicationId } : {}),
    };
  }

  const rows = buildBpRows(item, rec, plan, {
    contactId: crypto.randomUUID(),
    applicationId: crypto.randomUUID(),
    propertyId: crypto.randomUUID(),
  }, via);

  type BatchItem = Parameters<typeof db.batch>[0][number];
  const statements: BatchItem[] = [];

  if (rows.newContact) {
    statements.push(db.insert(schema.contacts).values(rows.newContact));
  } else if (rows.contactPatch) {
    statements.push(
      db.update(schema.contacts)
        .set({ ...rows.contactPatch, updatedAt: new Date() })
        .where(eq(schema.contacts.id, rows.contactId)),
    );
  }
  if (rows.property) statements.push(db.insert(schema.properties).values(rows.property));
  statements.push(db.insert(schema.applications).values({ ...rows.application, product: rows.application.product as never }));
  statements.push(db.insert(schema.stageTransitions).values(rows.transition));
  statements.push(db.insert(schema.participants).values(rows.participant).onConflictDoNothing());
  // LAST, and deliberately without onConflictDoNothing: this is the lock.
  statements.push(db.insert(schema.activities).values(rows.activity));

  await db.batch(statements as [BatchItem, ...BatchItem[]]);

  return {
    gmailMessageId: item.gmailMessageId, status: "created",
    applicationId: rows.application.id, contactId: rows.contactId,
    note: plan.contact.mode === "reuse" ? `repeat enquirer (matched on ${plan.contact.matchedOn})` : "new contact",
  };
}

/**
 * Write a batch of validated BiggerPockets leads. Never throws: every lead
 * comes back with its own result, in the order it was sent.
 */
export async function ingestBpLeads(
  db: BpDb, items: BpIntakeItem[], via: "live" | "backfill" | "unknown" = "unknown",
): Promise<BpResult[]> {
  const prepared = items.map((item) => ({ item, rec: buildBpRecord(item.lead) }));

  let state: State;
  try {
    state = await readState(db, prepared);
  } catch (err) {
    console.error("[api/crm/lead-intake] BP LEADS NOT WRITTEN — state read failed:", err);
    return items.map((i) => ({ gmailMessageId: i.gmailMessageId, status: "error" as const, error: "database unavailable — nothing written; the sheet still has the lead" }));
  }

  const results: BpResult[] = [];
  for (const { item, rec } of prepared) {
    let result: BpResult;
    try {
      result = await writeOne(db, item, rec, knownFor(state, item, rec), via);
    } catch (err) {
      if (!isUniqueViolation(err)) {
        console.error("[api/crm/lead-intake] BP LEAD NOT WRITTEN", item.gmailMessageId ?? item.dedupKey, err);
        result = { gmailMessageId: item.gmailMessageId, status: "error", error: "database write failed — nothing written for this lead" };
      } else {
        // Someone else wrote this lead, or this contact, a moment ago. Re-read
        // just this lead and decide again: usually it is now a duplicate; if it
        // was only the contact that raced, this reuses it.
        try {
          const fresh = await readState(db, [{ item, rec }]);
          result = await writeOne(db, item, rec, knownFor(fresh, item, rec), via);
        } catch (err2) {
          console.error("[api/crm/lead-intake] BP LEAD NOT WRITTEN after retry", item.gmailMessageId ?? item.dedupKey, err2);
          result = { gmailMessageId: item.gmailMessageId, status: "error", error: "database write failed twice — nothing written for this lead" };
        }
      }
    }
    results.push(result);

    // Later leads in the SAME request must see what this one wrote: a backfill
    // batch routinely holds two enquiries from one person, or one lead twice.
    if (result.status === "created") {
      state.dedupHits.set(item.dedupKey, result.applicationId ?? null);
      if (rec.email && result.contactId && !state.byEmail.has(rec.email)) {
        const made: ExistingContact = {
          id: result.contactId, email: rec.email, phone: rec.phone,
          firstName: rec.firstName, lastName: rec.lastName, creditBand: rec.creditBand,
          targetMarket: rec.targetMarket, state: rec.state, leadSource: "biggerpockets",
          externalIds: rec.profileUrl ? { biggerpockets: rec.profileUrl } : {},
        };
        state.byEmail.set(rec.email, made);
        if (rec.phone) state.byPhone.set(rec.phone, [...(state.byPhone.get(rec.phone) ?? []), made]);
      }
    }
  }
  return results;
}

/** Count results by status, for the response and the Apps Script log. */
export function summarise(results: BpResult[]): { created: number; duplicate: number; error: number } {
  const out = { created: 0, duplicate: 0, error: 0 };
  for (const r of results) out[r.status]++;
  return out;
}
