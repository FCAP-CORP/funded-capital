/**
 * The database side of firm administration.
 *
 * Every function here is staff-only and says so by calling `assertCrmStaff()`
 * itself rather than trusting whichever page or action called it. Two of these
 * functions can make a person able to read a borrower file, so "the caller
 * already checked" is not a thing this file assumes.
 *
 * The rules all live in ./admin.ts, which has no database and is fully tested.
 * This file reads rows, asks that module, and writes what it is told to write.
 */

import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  activities,
  brokerFirms,
  brokerUsers,
} from "@/lib/db/schema";
import { assertCrmStaff } from "@/lib/crm/access";
import type { BrokerRole, BrokerStatus } from "./scope";
import {
  canClaimDeal,
  claimPatch,
  normaliseEmail,
  sortBrokerQueue,
  validateFirmName,
  type BrokerQueueRow,
  type ClaimableDeal,
  type ClaimingBroker,
} from "./admin";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const int = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export type Result<T = null> = { ok: true; value: T } | { ok: false; error: string };

/** The shape every write returns when there is nothing to hand back. */
const DONE: Result<null> = { ok: true, value: null };

/* ------------------------------------------------------------------ reads */

export interface FirmRow {
  id: string;
  name: string;
  status: BrokerStatus;
  notes: string | null;
  brokers: number;
  deals: number;
  /** Requested amount across this firm's deals. Never called volume. */
  requested: number;
}

export async function listFirms(): Promise<FirmRow[]> {
  await assertCrmStaff();

  const result = await db.execute(sql`
    SELECT
      f.id, f.name, f.status, f.notes,
      (SELECT COUNT(*) FROM broker_users bu WHERE bu.firm_id = f.id)        AS brokers,
      (SELECT COUNT(*) FROM applications a WHERE a.broker_firm_id = f.id)   AS deals,
      (SELECT COALESCE(SUM(a.requested_amount), 0) FROM applications a
         WHERE a.broker_firm_id = f.id)                                     AS requested
    FROM broker_firms f
    ORDER BY f.name ASC
  `);

  return rowsOf(result).map((r): FirmRow => ({
    id: String(r.id),
    name: String(r.name),
    status: (str(r.status) ?? "active") as BrokerStatus,
    notes: str(r.notes),
    brokers: int(r.brokers),
    deals: int(r.deals),
    requested: int(r.requested),
  }));
}

export async function listBrokers(): Promise<BrokerQueueRow[]> {
  await assertCrmStaff();

  const result = await db.execute(sql`
    SELECT
      bu.id, bu.email, bu.name, bu.role, bu.status, bu.first_seen_at,
      bu.firm_id, f.name AS firm_name,
      (SELECT COUNT(*) FROM applications a
         WHERE a.submitted_by_user_id = bu.clerk_user_id)                   AS deals
    FROM broker_users bu
    LEFT JOIN broker_firms f ON f.id = bu.firm_id
  `);

  const rows = rowsOf(result).map((r): BrokerQueueRow => ({
    id: String(r.id),
    email: String(r.email ?? ""),
    name: str(r.name),
    firmId: str(r.firm_id),
    firmName: str(r.firm_name),
    role: (str(r.role) ?? "member") as BrokerRole,
    status: (str(r.status) ?? "active") as BrokerStatus,
    deals: int(r.deals),
    firstSeenAt: str(r.first_seen_at),
  }));

  // Sorted in the tested pure function, not in SQL, so the ordering rule has a
  // regression test rather than living in an ORDER BY nobody reads.
  return sortBrokerQueue(rows);
}

export interface BrokerDetail extends BrokerQueueRow {
  clerkUserId: string;
  phone: string | null;
  notes: string | null;
  smsConsentAt: string | null;
  smsConsentVersion: string | null;
}

export async function getBroker(brokerUserId: string): Promise<BrokerDetail | null> {
  await assertCrmStaff();

  const result = await db.execute(sql`
    SELECT
      bu.id, bu.clerk_user_id, bu.email, bu.name, bu.phone, bu.notes,
      bu.role, bu.status, bu.first_seen_at,
      bu.sms_consent_at, bu.sms_consent_version,
      bu.firm_id, f.name AS firm_name,
      (SELECT COUNT(*) FROM applications a
         WHERE a.submitted_by_user_id = bu.clerk_user_id)                   AS deals
    FROM broker_users bu
    LEFT JOIN broker_firms f ON f.id = bu.firm_id
    WHERE bu.id = ${brokerUserId}
    LIMIT 1
  `);

  const r = rowsOf(result)[0];
  if (!r) return null;

  return {
    id: String(r.id),
    clerkUserId: String(r.clerk_user_id),
    email: String(r.email ?? ""),
    name: str(r.name),
    phone: str(r.phone),
    notes: str(r.notes),
    firmId: str(r.firm_id),
    firmName: str(r.firm_name),
    role: (str(r.role) ?? "member") as BrokerRole,
    status: (str(r.status) ?? "active") as BrokerStatus,
    deals: int(r.deals),
    firstSeenAt: str(r.first_seen_at),
    smsConsentAt: str(r.sms_consent_at),
    smsConsentVersion: str(r.sms_consent_version),
  };
}

/* -------------------------------------------------------- claimable deals */

export interface ClaimCandidate extends ClaimableDeal {
  borrower: string | null;
  product: string;
  property: string | null;
  requestedAmount: number | null;
  submittedAt: string | null;
  stage: string;
}

/**
 * Deals that carry this broker's email and belong to nobody yet.
 *
 * The WHERE clause is the safety property, not a convenience filter. It can
 * only ever return applications that have a `broker` participant, so a website
 * or BiggerPockets lead is not merely hidden from this screen — it is outside
 * the set this query can produce. `canClaimDeal` then checks the same facts
 * again before anything is written.
 */
export async function findClaimableDeals(brokerEmail: string): Promise<ClaimCandidate[]> {
  await assertCrmStaff();

  const email = normaliseEmail(brokerEmail);
  if (!email) return [];

  const result = await db.execute(sql`
    SELECT
      a.id, a.stage, a.product, a.requested_amount, a.submitted_at,
      a.submitted_by_user_id, a.broker_firm_id,
      bc.email                                    AS broker_email,
      p.address_line1                             AS property,
      TRIM(CONCAT(c.first_name, ' ', c.last_name)) AS borrower
    FROM applications a
    JOIN participants bp ON bp.application_id = a.id AND bp.role = 'broker'
    JOIN contacts    bc ON bc.id = bp.contact_id AND LOWER(bc.email) = ${email}
    LEFT JOIN properties   p  ON p.id = a.property_id
    LEFT JOIN participants pt ON pt.application_id = a.id AND pt.role = 'borrower'
    LEFT JOIN contacts     c  ON c.id = pt.contact_id
    WHERE a.submitted_by_user_id IS NULL
      AND a.broker_firm_id IS NULL
    ORDER BY a.submitted_at DESC NULLS LAST
    LIMIT 100
  `);

  return rowsOf(result).map((r): ClaimCandidate => ({
    applicationId: String(r.id),
    submittedByUserId: str(r.submitted_by_user_id),
    brokerFirmId: str(r.broker_firm_id),
    brokerEmail: str(r.broker_email),
    borrower: str(r.borrower)?.trim() || null,
    product: str(r.product) ?? "unknown",
    property: str(r.property),
    requestedAmount: r.requested_amount === null || r.requested_amount === undefined
      ? null
      : Number(r.requested_amount),
    submittedAt: str(r.submitted_at),
    stage: str(r.stage) ?? "lead",
  }));
}

/* ----------------------------------------------------------------- writes */

export async function createFirm(rawName: string, rawNotes?: string): Promise<Result<string>> {
  await assertCrmStaff();

  const name = validateFirmName(rawName);
  if (!name.ok) return { ok: false, error: name.error };

  // A duplicate name is almost always a second attempt at the same firm, and
  // two "Legacy HML" rows is how brokers at one brokerage end up in two
  // different pipelines that cannot see each other.
  const existing = await db
    .select({ id: brokerFirms.id })
    .from(brokerFirms)
    .where(sql`LOWER(${brokerFirms.name}) = ${name.value.toLowerCase()}`)
    .limit(1);

  if (existing.length) return { ok: false, error: `"${name.value}" already exists.` };

  const id = crypto.randomUUID();
  const notes = (rawNotes ?? "").trim();

  await db.insert(brokerFirms).values({
    id,
    name: name.value,
    notes: notes || null,
  });

  return { ok: true, value: id };
}

export async function setFirmStatus(firmId: string, status: BrokerStatus): Promise<Result> {
  await assertCrmStaff();
  await db
    .update(brokerFirms)
    .set({ status, updatedAt: new Date() })
    .where(eq(brokerFirms.id, firmId));
  return DONE;
}

export async function setFirmNotes(firmId: string, notes: string): Promise<Result> {
  await assertCrmStaff();
  const v = notes.trim();
  await db
    .update(brokerFirms)
    .set({ notes: v || null, updatedAt: new Date() })
    .where(eq(brokerFirms.id, firmId));
  return DONE;
}

/**
 * Put a broker in a firm, or take them out of one, and set what they can see.
 *
 * Note what this does NOT do: it does not touch any application. Moving someone
 * between firms changes what they see from here on and leaves every deal they
 * already filed stamped with the firm that worked it. That is the whole reason
 * `applications.broker_firm_id` is frozen at submission.
 */
export async function assignBroker(
  brokerUserId: string,
  firmId: string | null,
  role: BrokerRole,
): Promise<Result> {
  await assertCrmStaff();

  if (firmId) {
    const firm = await db
      .select({ id: brokerFirms.id })
      .from(brokerFirms)
      .where(eq(brokerFirms.id, firmId))
      .limit(1);
    if (!firm.length) return { ok: false, error: "That firm no longer exists." };
  }

  await db
    .update(brokerUsers)
    .set({ firmId, role, updatedAt: new Date() })
    .where(eq(brokerUsers.id, brokerUserId));

  return DONE;
}

export async function setBrokerStatus(brokerUserId: string, status: BrokerStatus): Promise<Result> {
  await assertCrmStaff();
  await db
    .update(brokerUsers)
    .set({ status, updatedAt: new Date() })
    .where(eq(brokerUsers.id, brokerUserId));
  return DONE;
}

export async function setBrokerNotes(brokerUserId: string, notes: string): Promise<Result> {
  await assertCrmStaff();
  const v = notes.trim();
  await db
    .update(brokerUsers)
    .set({ notes: v || null, updatedAt: new Date() })
    .where(eq(brokerUsers.id, brokerUserId));
  return DONE;
}

/**
 * Attach one historic deal to one broker.
 *
 * The facts are re-read from the database immediately before the check, rather
 * than taken from whatever the screen was showing. A page rendered ten minutes
 * ago is not evidence about the current state of a row, and this is the write
 * that grants sight of a borrower file.
 *
 * The update carries its own `IS NULL` conditions as well, so two clicks
 * arriving together cannot both succeed: the second matches no rows.
 */
export async function claimDeal(
  applicationId: string,
  brokerUserId: string,
  staffUserId: string,
): Promise<Result> {
  await assertCrmStaff();

  const brokerRows = await db
    .select({
      id: brokerUsers.id,
      clerkUserId: brokerUsers.clerkUserId,
      email: brokerUsers.email,
      firmId: brokerUsers.firmId,
      status: brokerUsers.status,
    })
    .from(brokerUsers)
    .where(eq(brokerUsers.id, brokerUserId))
    .limit(1);

  if (!brokerRows.length) return { ok: false, error: "That broker no longer exists." };
  const broker = brokerRows[0] as ClaimingBroker;

  // The deal's own current state, plus the broker email recorded on it. Read
  // fresh — see the note above.
  const dealResult = await db.execute(sql`
    SELECT a.id, a.submitted_by_user_id, a.broker_firm_id, bc.email AS broker_email
    FROM applications a
    LEFT JOIN participants bp ON bp.application_id = a.id AND bp.role = 'broker'
    LEFT JOIN contacts     bc ON bc.id = bp.contact_id
    WHERE a.id = ${applicationId}
    LIMIT 1
  `);

  const d = rowsOf(dealResult)[0];
  if (!d) return { ok: false, error: "That deal no longer exists." };

  const deal: ClaimableDeal = {
    applicationId: String(d.id),
    submittedByUserId: str(d.submitted_by_user_id),
    brokerFirmId: str(d.broker_firm_id),
    brokerEmail: str(d.broker_email),
  };

  const verdict = canClaimDeal(broker, deal);
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  const patch = claimPatch(broker);
  const now = new Date();

  /**
   * db.batch, not db.transaction — the neon-http driver has no transactions.
   * The stamp and its audit row commit together: a deal that changed hands with
   * no record of who did it is exactly the gap this whole system exists to
   * close.
   */
  await db.batch([
    db
      .update(applications)
      .set({ ...patch, updatedAt: now })
      .where(and(
        eq(applications.id, applicationId),
        isNull(applications.submittedByUserId),
        isNull(applications.brokerFirmId),
      )),
    db.insert(activities).values({
      applicationId,
      kind: "field_change",
      occurredAt: now,
      source: "crm",
      subject: "Deal attached to a broker",
      body: `Attached to ${broker.email} at their firm.`,
      metadata: {
        brokerUserId: broker.id,
        brokerEmail: broker.email,
        firmId: patch.brokerFirmId,
        by: staffUserId,
      },
      dedupKey: `broker-claim:${applicationId}`,
    }).onConflictDoNothing(),
  ]);

  return DONE;
}

/** Used by the CRM to show how many people are waiting to be linked. */
export async function countUnassignedBrokers(): Promise<number> {
  await assertCrmStaff();
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(brokerUsers)
    .where(isNull(brokerUsers.firmId));
  return Number(rows[0]?.n ?? 0);
}

/** Kept so the contacts import is used where a firm's people are listed. */
export async function listBrokersAtFirm(firmId: string): Promise<BrokerQueueRow[]> {
  const all = await listBrokers();
  return all.filter((b) => b.firmId === firmId);
}
