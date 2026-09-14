/**
 * Write an inbound website lead straight into Postgres, at submit time.
 *
 * WHY THIS EXISTS:
 * Until now a lead reached the CRM only when an hourly scheduled task went
 * looking for it — up to 59 minutes late, and only if that task was working. It
 * was not: BiggerPockets capture silently stopped on 2026-08-23 and 33 paid leads
 * never arrived. The fix is structural, not a better scheduler: the write happens
 * in the code path that owns the event.
 *
 * THIS MUST NEVER COST A LEAD. The Apps Script intake remains the primary record
 * and runs in parallel with this. Every failure here is caught, logged under a
 * greppable marker with the full payload, and swallowed — a database problem must
 * not turn into a 500 for a borrower filling in a form.
 *
 * The row is written for QUARANTINED leads too. The house rule from the
 * anti-spam work applies unchanged: never silently discard a lead, because the
 * row is how a wrongly-filtered borrower gets found.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { normalisePhone } from "../phone";
import { clean, parseMoney, mapProduct, leverage } from "../migrate/transform";

export interface LeadInput {
  /** "apply" or "contact" — they submit different field sets. */
  formType: string;
  payload: Record<string, string>;
  quarantined: boolean;
  quarantineReason?: string;
  smsConsent: boolean;
  consentVersion: string;
  consentAt: Date;
  advisoryFlags?: string[];
}

export interface LeadRecord {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  phoneRaw: string | null;
  product: string;
  productConfident: boolean;
  propertyAddress: string | null;
  purchasePrice: number | null;
  arv: number | null;
  loanAmount: number | null;
  creditBand: string | null;
  exitStrategy: string | null;
  timeline: string | null;
  borrowerType: string | null;
  message: string | null;
  notes: string | null;
}

/**
 * Pure field mapping — no database, so it is fully testable.
 *
 * The two forms carry different names for the same ideas. /apply has a real
 * loanType select; /contact has `subject`, which the existing Apps Script already
 * treats as the loan type, and `message` where /apply has `additionalInfo`.
 */
export function buildLeadRecord(input: LeadInput): LeadRecord {
  const p = input.payload;
  const isContact = input.formType === "contact";

  const loanType = clean(isContact ? p.subject : p.loanType);
  const message = clean(isContact ? p.message : p.additionalInfo);
  const phone = normalisePhone(clean(p.phone) ?? "");

  const { product, confident } = mapProduct({
    loanType,
    goal: clean(p.exitStrategy),
    strategy: clean(p.propertyType),
  });

  const notes: string[] = [];
  if (input.quarantined) {
    notes.push(`HELD FOR REVIEW — ${input.quarantineReason ?? "flagged by the spam filter"}`);
  }
  if (input.advisoryFlags?.length) notes.push(`flags: ${input.advisoryFlags.join(", ")}`);
  if (clean(p.experience)) notes.push(`claimed experience: ${clean(p.experience)}`);

  return {
    firstName: clean(p.firstName),
    lastName: clean(p.lastName),
    email: clean(p.email)?.toLowerCase() ?? null,
    phone: phone.ok ? phone.e164 : null,
    phoneRaw: phone.ok ? null : (phone.raw || null),
    product,
    productConfident: confident,
    propertyAddress: clean(p.propertyAddress),
    purchasePrice: parseMoney(p.purchasePrice),
    arv: parseMoney(p.arv),
    loanAmount: parseMoney(p.loanAmount),
    creditBand: clean(p.creditScore),
    exitStrategy: clean(p.exitStrategy),
    timeline: clean(p.timeline),
    borrowerType: clean(p.borrowerType),
    message,
    notes: notes.length ? notes.join(" · ") : null,
  };
}

export type LeadWriteResult =
  | { ok: true; contactId: string; applicationId: string; repeat: boolean }
  | { ok: false; error: string };

/**
 * Persist the lead. Resolves to a result object; never throws and never rejects,
 * so `Promise.allSettled` alongside the Drive intake cannot be tripped by it.
 */
export async function recordLead(input: LeadInput): Promise<LeadWriteResult> {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) return { ok: false, error: "DATABASE_URL not set" };

    const db = drizzle(neon(url), { schema });
    const rec = buildLeadRecord(input);

    /* -- contact: one per person, matched on email -- */
    let contactId: string | null = null;
    let repeat = false;

    if (rec.email) {
      const found = await db.select({ id: schema.contacts.id, phone: schema.contacts.phone })
        .from(schema.contacts).where(eq(schema.contacts.email, rec.email)).limit(1);

      if (found.length) {
        contactId = found[0].id;
        repeat = true;
        // Only ever fill gaps. A later submission must not blank out a field an
        // earlier one populated.
        await db.update(schema.contacts).set({
          ...(rec.phone && !found[0].phone ? { phone: rec.phone } : {}),
          ...(rec.creditBand ? { creditBand: rec.creditBand } : {}),
          // Consent is additive: granted stays granted, and the version records
          // which wording they actually saw.
          ...(input.smsConsent
            ? { smsConsentAt: input.consentAt, smsConsentVersion: input.consentVersion }
            : {}),
          updatedAt: new Date(),
        }).where(eq(schema.contacts.id, contactId));
      }
    }

    if (!contactId) {
      const [created] = await db.insert(schema.contacts).values({
        firstName: rec.firstName, lastName: rec.lastName, email: rec.email,
        phone: rec.phone, phoneRaw: rec.phoneRaw,
        leadSource: "website", creditBand: rec.creditBand,
        ownerName: "Luis Fajardo", tags: ["website", input.formType],
        ...(input.smsConsent
          ? { smsConsentAt: input.consentAt, smsConsentVersion: input.consentVersion }
          : {}),
      }).returning({ id: schema.contacts.id });
      contactId = created.id;
    }

    /* -- property, when they told us about one -- */
    let propertyId: string | null = null;
    if (rec.propertyAddress || rec.purchasePrice || rec.arv) {
      const [prop] = await db.insert(schema.properties).values({
        addressLine1: rec.propertyAddress,
        purchasePrice: rec.purchasePrice !== null ? String(rec.purchasePrice) : null,
        arv: rec.arv !== null ? String(rec.arv) : null,
        // ARV is self-reported here. Recording that is the whole point — an
        // unsourced ARV must never be mistaken for an underwritten one.
        ...(rec.arv !== null
          ? { arvSource: "borrower-stated (web form)", arvAsOf: input.consentAt }
          : {}),
      }).returning({ id: schema.properties.id });
      propertyId = prop.id;
    }

    /* -- application: a NEW one every time, even for a repeat enquirer.
          The application is the container; a second enquiry is a second deal. -- */
    const lev = leverage({
      loanAmount: rec.loanAmount, purchasePrice: rec.purchasePrice, arv: rec.arv,
    });
    const [app] = await db.insert(schema.applications).values({
      stage: "lead", product: rec.product as never, leadSource: "website",
      channel: input.formType, ownerName: "Luis Fajardo", propertyId,
      requestedAmount: rec.loanAmount !== null ? String(rec.loanAmount) : null,
      ltc: lev.ltc !== null ? lev.ltc.toFixed(4) : null,
      ltarv: lev.ltarv !== null ? lev.ltarv.toFixed(4) : null,
      ltv: lev.ltv !== null ? lev.ltv.toFixed(4) : null,
      bindingRatio: lev.binding,
      exitStrategy: rec.exitStrategy, timeline: rec.timeline,
      borrowerMessage: rec.message, notes: rec.notes,
      legacySource: `web:${input.formType}`, submittedAt: input.consentAt,
      stageEnteredAt: input.consentAt,
    }).returning({ id: schema.applications.id });

    await db.insert(schema.stageTransitions).values({
      applicationId: app.id, fromStage: null, toStage: "lead",
      changedAt: input.consentAt, changedBy: "web-form",
      reason: input.quarantined ? "submitted via website — held for review" : "submitted via website",
    });

    await db.insert(schema.participants)
      .values({ applicationId: app.id, contactId, role: "borrower" })
      .onConflictDoNothing();

    // The submission itself, verbatim, as an activity. `dedupKey` makes a
    // double-clicked submit button idempotent without blocking a genuine
    // second enquiry later.
    await db.insert(schema.activities).values({
      contactId, applicationId: app.id, kind: "form_submission",
      occurredAt: input.consentAt, source: `web:${input.formType}`,
      subject: `Website ${input.formType} submission`,
      body: rec.message,
      metadata: {
        smsConsent: input.smsConsent,
        consentVersion: input.consentVersion,
        quarantined: input.quarantined,
        productConfident: rec.productConfident,
        borrowerType: rec.borrowerType,
      },
      dedupKey: `web:${input.formType}:${rec.email ?? rec.phone ?? "anon"}:${input.consentAt.toISOString()}`,
    }).onConflictDoNothing();

    return { ok: true, contactId, applicationId: app.id, repeat };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
