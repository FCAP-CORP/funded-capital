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
  /** /contact only. A TOPIC ("Broker Partnership"), never a loan product. */
  inquiryTopic: string | null;
  /** Broker partnership enquiries are partners, not borrowers. */
  leadSource: "website" | "broker";
  notes: string | null;
}

/**
 * Pure field mapping — no database, so it is fully testable.
 *
 * The two forms are NOT the same shape. /apply has a real loanType select whose
 * options are products. /contact has `subject`, whose options are TOPICS —
 * "Loan Inquiry", "Broker Partnership", "Existing Loan Question", "Rates &
 * Programs", "Other". Reading `subject` as a product is wrong and silently
 * discards the topic; both forms are mapped against their real option values,
 * which lib/leads/record.regress.ts asserts verbatim.
 */
/** Submitted value -> the label the visitor actually saw, for readable records. */
const CONTACT_TOPIC_LABEL: Record<string, string> = {
  "loan-inquiry": "Loan Inquiry",
  "broker": "Broker Partnership",
  "existing-loan": "Existing Loan Question",
  "rates": "Rates & Programs",
  "other": "Other",
};
const BORROWER_TYPE_LABEL: Record<string, string> = {
  investor: "Real Estate Investor",
  broker: "Mortgage Broker (submitting on behalf of borrower)",
  developer: "Developer / Builder",
  other: "Other",
};
const PROPERTY_TYPE_LABEL: Record<string, string> = {
  sfr: "Single Family Residence",
  "2-4": "2–4 Units",
  multifamily: "5+ Units (Multifamily)",
  condo: "Condo / Townhome",
  commercial: "Commercial",
  land: "Land / Lot",
};

export function buildLeadRecord(input: LeadInput): LeadRecord {
  const p = input.payload;
  const isContact = input.formType === "contact";

  const message = clean(isContact ? p.message : p.additionalInfo);
  const phone = normalisePhone(clean(p.phone) ?? "");

  /**
   * /contact's `subject` is a TOPIC — "Loan Inquiry", "Broker Partnership",
   * "Existing Loan Question", "Rates & Programs", "Other". It is NOT a loan
   * product, and treating it as one made every contact-form lead land as
   * `unknown` with the topic thrown away. The topic is recorded separately;
   * the product simply stays unknown, because the contact form never asks.
   */
  const topicSlug = isContact ? clean(p.subject)?.toLowerCase() ?? null : null;
  const inquiryTopic = topicSlug ? (CONTACT_TOPIC_LABEL[topicSlug] ?? topicSlug) : null;

  /**
   * Property type is a fallback product signal on /apply: "5+ Units
   * (Multifamily)" implies the product even when the programme select says
   * "Not sure — help me choose".
   */
  const propertySlug = clean(p.propertyType)?.toLowerCase() ?? null;
  const propertyType = propertySlug ? (PROPERTY_TYPE_LABEL[propertySlug] ?? propertySlug) : null;
  const multifamilyByProperty = propertySlug === "multifamily";

  let { product, confident } = isContact
    ? { product: "unknown" as string, confident: false }
    : mapProduct({ loanType: clean(p.loanType), goal: clean(p.exitStrategy) });

  if (product === "unknown" && multifamilyByProperty) {
    product = "multifamily";
    confident = false;
  }

  // A broker partnership enquiry is a partner introducing themselves, not a
  // borrower asking for money. Routing it as a website lead loses that.
  const borrowerSlug = clean(p.borrowerType)?.toLowerCase() ?? null;
  const borrowerType = borrowerSlug ? (BORROWER_TYPE_LABEL[borrowerSlug] ?? borrowerSlug) : null;

  /**
   * A broker is a partner, not a borrower — whichever form they arrive on.
   * /contact signals it with subject=broker; /apply with borrowerType=broker;
   * the dedicated /broker-program/register form with formType=broker.
   */
  const leadSource: "website" | "broker" =
    topicSlug === "broker" || borrowerSlug === "broker" || input.formType === "broker"
      ? "broker"
      : "website";

  const notes: string[] = [];
  if (inquiryTopic) notes.push(`topic: ${inquiryTopic}`);
  if (propertyType) notes.push(`property type: ${propertyType}`);
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
    borrowerType,
    message,
    inquiryTopic,
    leadSource,
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
    const p_raw = input.payload;

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
        leadSource: rec.leadSource, creditBand: rec.creditBand,
        ownerName: "Luis Fajardo", tags: [rec.leadSource, input.formType, ...(rec.inquiryTopic ? [rec.inquiryTopic.toLowerCase()] : [])],
        ...(input.smsConsent
          ? { smsConsentAt: input.consentAt, smsConsentVersion: input.consentVersion }
          : {}),
      }).returning({ id: schema.contacts.id });
      contactId = created.id;
    }

    /* -- A dedicated broker registration is a partner introducing themselves.
          There is no deal, so there is no application, no property and no
          participant link — just the contact and the submission itself. -- */
    if (input.formType === "broker") {
      await db.insert(schema.activities).values({
        contactId, kind: "form_submission", occurredAt: input.consentAt,
        source: "web:broker", subject: "Broker registration",
        body: rec.message,
        metadata: {
          smsConsent: input.smsConsent, consentVersion: input.consentVersion,
          company: clean(p_raw.company), licenseNumber: clean(p_raw.licenseNumber),
          partnerType: clean(p_raw.partnerType), statesServed: clean(p_raw.statesServed),
          programs: clean(p_raw.programs), monthlyVolume: clean(p_raw.monthlyVolume),
          quarantined: input.quarantined,
        },
        dedupKey: `web:broker:${rec.email ?? rec.phone ?? "anon"}:${input.consentAt.toISOString()}`,
      }).onConflictDoNothing();
      return { ok: true, contactId, applicationId: "", repeat };
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
      stage: "lead", product: rec.product as never, leadSource: rec.leadSource,
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
        inquiryTopic: rec.inquiryTopic,
      },
      dedupKey: `web:${input.formType}:${rec.email ?? rec.phone ?? "anon"}:${input.consentAt.toISOString()}`,
    }).onConflictDoNothing();

    return { ok: true, contactId, applicationId: app.id, repeat };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
