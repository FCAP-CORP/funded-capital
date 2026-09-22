/**
 * Write a broker portal submission into Postgres, at submit time.
 *
 * WHY THIS EXISTS:
 * Until now the broker portal and the CRM were two systems of record for the
 * same business. A broker filed a deal, it landed in Drive and a Google Sheet,
 * and nothing in `/crm` knew it existed. Luis tracked borrower leads in one
 * place and broker deals in another, by hand.
 *
 * THIS MUST NEVER COST A DEAL. Drive remains the primary intake and runs in
 * parallel with this write. Every failure here is caught, logged under a
 * greppable marker, and swallowed — a database problem must never turn into an
 * error for a broker who has just spent ten minutes filling in a form and
 * uploading documents. Same rule, same reasoning as `lib/leads/record.ts`.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: store documents. The files keep flowing to
 * Drive intake and only their count and folder are recorded here. The portal is
 * a pipe, never a vault.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { normalisePhone } from "../phone";
import { clean, parseMoney, leverage } from "../migrate/transform";
import {
  LOAN_PURPOSE_OPTIONS, isRefiPurpose, MAX_PORTFOLIO_PROPERTIES,
  type LoanPurpose,
} from "../pricing";

/* --------------------------------------------------------------- mapping */

/**
 * The broker form posts the product as a HUMAN LABEL, not a slug.
 *
 * `ApplyClient.tsx` sends `RATE_CONFIG.products[form.product].label`, so what
 * arrives is "DSCR / Rental", not "dscr". This is the same class of mistake
 * that silently mapped every New Construction lead to `unknown` for weeks —
 * only inverted, because there the form sent the slug and the matcher wanted
 * the label.
 *
 * These four strings are copied verbatim from RATE_CONFIG in lib/pricing.ts and
 * are asserted against it in record.regress.ts, so a relabelled product fails a
 * test instead of quietly landing as `unknown`.
 */
export const PROGRAM_LABEL_TO_PRODUCT: Record<string, string> = {
  "Fix & Flip": "fix_and_flip",
  "New Construction (Ground-Up)": "ground_up",
  "DSCR / Rental": "dscr",
  // A stabilized bridge is a bridge loan that happens to be priced off DSCR.
  // It belongs with `bridge`, not `dscr`, or the bridge book under-reports.
  "DSCR / Stabilized Bridge": "bridge",
};

/**
 * One property as the broker typed it. Every field is a string because it comes
 * straight off a form; parsing happens here, once.
 *
 * Field names mirror `PortfolioProperty` in lib/pricing.ts so the portal, the
 * pricer and the database all describe a property the same way.
 */
export interface BrokerPropertyInput {
  address?: string;
  /** Purchase price on a purchase, as-is value on a refinance. One box. */
  value?: string;
  rehabBudget?: string;
  /** Refinance only: soft + hard costs already spent. */
  sunkCosts?: string;
  /** Refinance only: the existing lien to retire. */
  estimatedPayoff?: string;
  /** Bridge only. */
  arv?: string;
  monthlyRent?: string;
  annualTaxes?: string;
  annualInsurance?: string;
  annualHoa?: string;
}

export interface ParsedProperty {
  address: string | null;
  purchasePrice: number | null;
  asIsValue: number | null;
  rehabBudget: number | null;
  sunkCosts: number | null;
  estimatedPayoff: number | null;
  arv: number | null;
  monthlyRent: number | null;
  annualTaxes: number | null;
  annualInsurance: number | null;
  annualHoa: number | null;
}

/** True when the broker left a row completely untouched. */
function isEmptyRow(r: ParsedProperty): boolean {
  return r.address === null && r.purchasePrice === null && r.asIsValue === null
    && r.rehabBudget === null && r.sunkCosts === null && r.estimatedPayoff === null
    && r.arv === null && r.monthlyRent === null && r.annualTaxes === null
    && r.annualInsurance === null && r.annualHoa === null;
}

/**
 * Parse the property schedule.
 *
 * Blank rows are DROPPED rather than written: a ten-row form that the broker
 * filled three lines of is a three-property portfolio, and seven empty property
 * records would make `propertyCount` a lie and every aggregate wrong.
 *
 * Capped at MAX_PORTFOLIO_PROPERTIES from the pricer. A submission with more
 * properties than the product can price is not something to silently accept —
 * the surplus is dropped here and reported by the caller.
 */
export function buildPortfolioProperties(
  rows: BrokerPropertyInput[] | undefined,
  purpose: LoanPurpose | null,
): { properties: ParsedProperty[]; dropped: number } {
  if (!rows || rows.length === 0) return { properties: [], dropped: 0 };

  const parsed = rows.map((r): ParsedProperty => {
    const figure = parseMoney(r.value);
    return {
      address: clean(r.address),
      // Same rule as the single-property path: a purchase is measured against
      // price, a refinance against value, and an unknown purpose against neither.
      purchasePrice: purpose === "purchase" ? figure : null,
      asIsValue: purpose && isRefiPurpose(purpose) ? figure : null,
      rehabBudget: parseMoney(r.rehabBudget),
      sunkCosts: parseMoney(r.sunkCosts),
      estimatedPayoff: parseMoney(r.estimatedPayoff),
      arv: parseMoney(r.arv),
      monthlyRent: parseMoney(r.monthlyRent),
      annualTaxes: parseMoney(r.annualTaxes),
      annualInsurance: parseMoney(r.annualInsurance),
      annualHoa: parseMoney(r.annualHoa),
    };
  }).filter((r) => !isEmptyRow(r));

  const kept = parsed.slice(0, MAX_PORTFOLIO_PROPERTIES);
  return { properties: kept, dropped: parsed.length - kept.length };
}

/**
 * What the whole schedule is worth, for the leverage calculation.
 *
 * Portfolio leverage is one loan against the SUM of the collateral, so summing
 * here is the only way `bindingRatio` means anything on a portfolio. A property
 * with no figure contributes nothing rather than breaking the total.
 */
export function portfolioTotals(properties: ParsedProperty[]): {
  purchasePrice: number | null; asIsValue: number | null;
} {
  const sum = (pick: (p: ParsedProperty) => number | null) => {
    const vals = properties.map(pick).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  return { purchasePrice: sum((p) => p.purchasePrice), asIsValue: sum((p) => p.asIsValue) };
}

export interface BrokerApplicationInput {
  /** Clerk user id, from the session. Never from the request body. */
  clerkUserId: string;
  /** Broker's email, from the session. Never from the request body. */
  brokerEmail: string;
  brokerName: string | null;
  submissionName: string;
  summary: string;
  /** The `application` object posted by ApplyClient.tsx. */
  application: Record<string, string>;
  submittedAt: Date;
  fileCount: number;
  /**
   * The BROKER'S OWN consent, ticked by them on the form. Never a borrower's —
   * a broker cannot consent on someone else's behalf.
   */
  smsConsent: boolean;
  /** Which wording they saw. From lib/consent.ts, never hand-typed. */
  consentVersion: string;
  /** The property schedule, when the broker submitted one. */
  properties?: BrokerPropertyInput[];
  /** Whether the broker said this is a portfolio deal. */
  isPortfolio?: boolean;
  /** Drive folder the documents landed in, when the intake reported one. */
  driveFolder?: string | null;
}

export interface BrokerApplicationRecord {
  product: string;
  /** False when the posted program label matched nothing known. */
  productConfident: boolean;
  borrowerFirstName: string | null;
  borrowerLastName: string | null;
  entityName: string | null;
  email: string | null;
  phone: string | null;
  phoneRaw: string | null;
  /** Kept verbatim, as on /apply. A broker-stated FICO is not a verified score. */
  creditBand: string | null;
  propertyAddress: string | null;
  loanAmount: number | null;
  /**
   * purchase | rate_term_refi | cash_out_refi, or null if the form sent
   * something unrecognised. Never guessed.
   */
  loanPurpose: LoanPurpose | null;
  /**
   * THE SAME BOX ON THE FORM, FILED UNDER THE RIGHT NAME.
   *
   * The broker is asked for a purchase price on a purchase and an as-is value
   * on a refinance, so exactly one of these is ever set. Writing both — or
   * writing the wrong one — makes `leverage()` produce the wrong binding ratio,
   * and on a Fix & Flip the binding ratio is LTC against price. Calling a
   * purchase price an "as-is value" would have quietly measured every purchase
   * against the wrong denominator.
   */
  purchasePrice: number | null;
  asIsValue: number | null;
  notes: string | null;
}

const VALID_PURPOSES = new Set<string>(LOAN_PURPOSE_OPTIONS.map((o) => o.key));

/** "Maria De La Cruz" -> first "Maria", last "De La Cruz". */
function splitName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Pure field mapping — no database, so it is fully testable.
 *
 * Field names are taken verbatim from what ApplyClient.tsx posts:
 * program, borrower, entity, email, phone, fico, propertyAddress,
 * loanAmount, propertyValue, notes.
 */
export function buildBrokerRecord(application: Record<string, string>): BrokerApplicationRecord {
  const a = application ?? {};

  const programLabel = clean(a.program);
  const mapped = programLabel ? PROGRAM_LABEL_TO_PRODUCT[programLabel] : undefined;

  const { first, last } = splitName(clean(a.borrower));
  // normalisePhone returns a RESULT OBJECT, not a string: { ok, e164, raw }.
  // Treating it as a string yields "[object Object]" in the phone column, which
  // is worse than a missing number because it looks like data.
  const phoneResult = normalisePhone(clean(a.phone) ?? "");

  /**
   * An unrecognised program is recorded as `unknown` AND written into the notes
   * verbatim. Mapping it to a guess would put a deal in the wrong book; dropping
   * it would lose what the broker actually chose.
   */
  const rawPurpose = clean(a.purpose);
  const purpose: LoanPurpose | null =
    rawPurpose && VALID_PURPOSES.has(rawPurpose) ? (rawPurpose as LoanPurpose) : null;
  const propertyFigure = parseMoney(a.propertyValue);

  const noteParts: string[] = [];
  if (programLabel && !mapped) noteParts.push(`unrecognised program: ${programLabel}`);
  if (rawPurpose && !purpose) noteParts.push(`unrecognised loan purpose: ${rawPurpose}`);
  // An unrecognised purpose leaves the figure unfiled, so keep the number where
  // a human can still see what the broker typed.
  if (!purpose && propertyFigure !== null) {
    noteParts.push(`property value / purchase price as entered: ${propertyFigure}`);
  }
  const entityName = clean(a.entity);
  if (entityName) noteParts.push(`entity: ${entityName}`);
  const brokerNotes = clean(a.notes);
  if (brokerNotes) noteParts.push(brokerNotes);

  return {
    product: mapped ?? "unknown",
    productConfident: Boolean(mapped),
    borrowerFirstName: first,
    borrowerLastName: last,
    entityName,
    email: clean(a.email)?.toLowerCase() ?? null,
    // A number that cannot be texted is still shown, marked, never dropped —
    // hiding it is how it never gets fixed.
    phone: phoneResult.ok ? phoneResult.e164 : null,
    phoneRaw: phoneResult.ok ? null : (phoneResult.raw || null),
    creditBand: clean(a.fico),
    propertyAddress: clean(a.propertyAddress),
    loanAmount: parseMoney(a.loanAmount),
    loanPurpose: purpose,
    // A purchase is measured against price, a refinance against today's value.
    // An unknown purpose files the figure under neither rather than guessing:
    // a wrong denominator is worse than a missing ratio, because it looks right.
    purchasePrice: purpose === "purchase" ? propertyFigure : null,
    asIsValue: purpose && isRefiPurpose(purpose) ? propertyFigure : null,
    notes: noteParts.length ? noteParts.join(" · ") : null,
  };
}

/* --------------------------------------------------------------- writing */

/**
 * The consent fields to write, given what the broker did on the form.
 *
 * CONSENT ONLY EVER FLOWS INBOUND. An unticked box is not a revocation — it is
 * the absence of a new grant — so this returns nothing rather than clearing a
 * consent the broker gave earlier. Wiping consent from here would also silently
 * overwrite a STOP recorded by Quo, which is a compliance incident, not a bug.
 *
 * Re-affirming moves the timestamp and version forward, so the record always
 * points at the most recent wording the broker actually agreed to.
 */
export function brokerConsentPatch(
  smsConsent: boolean,
  consentVersion: string,
  at: Date,
): { smsConsentAt: Date; smsConsentVersion: string } | Record<string, never> {
  if (!smsConsent) return {};
  return { smsConsentAt: at, smsConsentVersion: consentVersion };
}

export type BrokerWriteResult =
  | { ok: true; applicationId: string; contactId: string; brokerUserId: string; firmId: string | null }
  | { ok: false; error: string };

/**
 * Persist the submission. Resolves to a result object; never throws and never
 * rejects, so `Promise.allSettled` alongside the Drive intake cannot be tripped
 * by it.
 */
export async function recordBrokerApplication(
  input: BrokerApplicationInput,
): Promise<BrokerWriteResult> {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) return { ok: false, error: "DATABASE_URL not set" };

    const db = drizzle(neon(url), { schema });
    const rec = buildBrokerRecord(input.application);
    const now = input.submittedAt;
    const brokerEmail = input.brokerEmail.trim().toLowerCase() || null;

    /**
     * THREE ROUND TRIPS, NOT TWELVE.
     *
     * The neon-http driver sends each query as its own HTTP request, so a
     * write built as a dozen sequential statements pays a dozen network
     * latencies — the slow part of this whole operation, and it lands on a
     * broker who is already waiting on a document upload.
     *
     * Two reads answer everything the writes need to know, and then every
     * write goes out in a single `db.batch`. Generating the row ids here
     * rather than letting Postgres do it is what makes that possible: nothing
     * in the batch has to wait for an earlier statement's RETURNING value.
     *
     * It is also more correct than the sequential version. `db.batch` sends
     * the statements in ONE Postgres transaction, so the application and its
     * `stage_transitions` row commit together — the house rule in CLAUDE.md,
     * which a sequence of separate inserts cannot honour. Halfway through, the
     * old version could leave an application with no stage history at all.
     *
     * `db.transaction()` is NOT available on this driver. See CLAUDE.md.
     */

    /* -- read 1: who is this broker, and which firm are they in? ---------- */
    const existingBroker = await db
      .select({ id: schema.brokerUsers.id, firmId: schema.brokerUsers.firmId })
      .from(schema.brokerUsers)
      .where(eq(schema.brokerUsers.clerkUserId, input.clerkUserId))
      .limit(1);

    const brokerUserId = existingBroker.length ? existingBroker[0].id : crypto.randomUUID();
    // A brand-new broker is UNASSIGNED: firmId stays null until Luis links
    // them in the CRM. A submission can never place a broker inside a firm.
    const firmId = existingBroker.length ? existingBroker[0].firmId : null;

    /* -- read 2: both contacts in ONE query ------------------------------- */
    const wanted = [rec.email, brokerEmail].filter((e): e is string => Boolean(e));
    const uniqueWanted = [...new Set(wanted)];

    const existingContacts = uniqueWanted.length
      ? await db
          .select({ id: schema.contacts.id, email: schema.contacts.email, phone: schema.contacts.phone })
          .from(schema.contacts)
          // Matched case-insensitively: addresses were stored before the
          // lowercase-on-write rule existed.
          .where(inArray(sql`lower(${schema.contacts.email})`, uniqueWanted))
      : [];

    const byEmail = new Map(
      existingContacts.map((c) => [(c.email ?? "").toLowerCase(), c]),
    );

    const borrowerExisting = rec.email ? byEmail.get(rec.email) : undefined;
    const brokerExisting = brokerEmail ? byEmail.get(brokerEmail) : undefined;

    const contactId = borrowerExisting?.id ?? crypto.randomUUID();
    // When a broker files a deal under their own email, that is ONE person and
    // one contact row — not a borrower and a broker who happen to match.
    const sameParty = Boolean(brokerEmail && rec.email && brokerEmail === rec.email);
    const brokerContactId = sameParty
      ? contactId
      : (brokerExisting?.id ?? (brokerEmail ? crypto.randomUUID() : null));

    const entityId = rec.entityName ? crypto.randomUUID() : null;
    /**
     * The property schedule. A portfolio submits many; an ordinary deal submits
     * one; both end up in the same shape so there is a single write path.
     */
    const schedule = buildPortfolioProperties(input.properties, rec.loanPurpose);
    const scheduled: ParsedProperty[] = schedule.properties.length > 0
      ? schedule.properties
      : (rec.propertyAddress || rec.purchasePrice !== null || rec.asIsValue !== null
          ? [{
              address: rec.propertyAddress,
              purchasePrice: rec.purchasePrice,
              asIsValue: rec.asIsValue,
              rehabBudget: null, sunkCosts: null, estimatedPayoff: null, arv: null,
              monthlyRent: null, annualTaxes: null, annualInsurance: null, annualHoa: null,
            }]
          : []);

    const propertyIds = scheduled.map(() => crypto.randomUUID());
    // The SUBJECT property — what the grid shows and what every existing query
    // already joins on. For a portfolio that is the first one on the schedule.
    const propertyId = propertyIds.length ? propertyIds[0] : null;

    // A portfolio because the broker said so, or because more than one property
    // arrived. The second case catches a schedule submitted without the flag.
    const isPortfolio = input.isPortfolio === true || scheduled.length > 1;
    const applicationId = crypto.randomUUID();

    // Leverage is measured against the WHOLE schedule: one loan, all the
    // collateral. Using only the subject property would understate a portfolio's
    // denominator and overstate its leverage by a factor of its size.
    const totals = portfolioTotals(scheduled);
    const lev = leverage({
      loanAmount: rec.loanAmount,
      purchasePrice: totals.purchasePrice,
      asIsValue: totals.asIsValue,
    });
    const consent = brokerConsentPatch(input.smsConsent, input.consentVersion, now);

    /* -- one batch, one transaction --------------------------------------- */
    type BatchItem = Parameters<typeof db.batch>[0][number];
    const statements: BatchItem[] = [];

    /* the broker's own record */
    if (existingBroker.length) {
      // Contact details are refreshed; firmId, role and status are NOT touched.
      // Those are Luis's to set, and a submission must not be able to change
      // what a broker is allowed to see.
      statements.push(
        db.update(schema.brokerUsers).set({
          ...(brokerEmail ? { email: brokerEmail } : {}),
          ...(input.brokerName ? { name: input.brokerName } : {}),
          ...consent,
          updatedAt: now,
        }).where(eq(schema.brokerUsers.id, brokerUserId)),
      );
    } else {
      statements.push(
        db.insert(schema.brokerUsers).values({
          id: brokerUserId,
          clerkUserId: input.clerkUserId,
          email: brokerEmail ?? "",
          name: input.brokerName,
          ...consent,
          firstSeenAt: now,
        }).onConflictDoNothing({ target: schema.brokerUsers.clerkUserId }),
      );
    }

    /* the borrower */
    if (borrowerExisting) {
      statements.push(
        db.update(schema.contacts).set({
          // Only ever fill gaps. A later submission must not blank a field an
          // earlier one populated.
          ...(rec.phone && !borrowerExisting.phone ? { phone: rec.phone } : {}),
          ...(rec.creditBand ? { creditBand: rec.creditBand } : {}),
          updatedAt: now,
        }).where(eq(schema.contacts.id, contactId)),
      );
    } else {
      statements.push(
        db.insert(schema.contacts).values({
          id: contactId,
          firstName: rec.borrowerFirstName,
          lastName: rec.borrowerLastName,
          email: rec.email,
          phone: rec.phone,
          phoneRaw: rec.phoneRaw,
          leadSource: "broker",
          creditBand: rec.creditBand,
          ownerName: "Luis Fajardo",
          tags: ["broker", "broker-portal"],
          // NO BORROWER SMS CONSENT. The broker form never asks the borrower,
          // and a broker cannot consent on a borrower's behalf. Leaving these
          // null keeps this borrower out of every automated SMS send.
        }),
      );
    }

    /* the broker, as a contact in the book */
    if (brokerContactId && !sameParty && !brokerExisting && brokerEmail) {
      const names = splitName(input.brokerName);
      statements.push(
        db.insert(schema.contacts).values({
          id: brokerContactId,
          firstName: names.first,
          lastName: names.last,
          email: brokerEmail,
          leadSource: "broker",
          ownerName: "Luis Fajardo",
          tags: ["broker", "partner"],
          // Mirrored onto the contact so the systems that actually send —
          // Klaviyo and Quo — can see the consent without joining broker_users.
          ...consent,
        }),
      );
    }

    // `rec.entityName` is re-checked rather than inferred from `entityId`:
    // entities.name is NOT NULL, and TypeScript cannot narrow one from the other.
    /* an existing broker contact still needs the consent mirrored onto it */
    if (brokerExisting && !sameParty && Object.keys(consent).length > 0) {
      statements.push(
        db.update(schema.contacts)
          .set({ ...consent, updatedAt: now })
          .where(eq(schema.contacts.id, brokerExisting.id)),
      );
    }

    if (entityId && rec.entityName) {
      statements.push(db.insert(schema.entities).values({ id: entityId, name: rec.entityName }));
    }

    const money = (v: number | null) => (v !== null ? String(v) : null);
    scheduled.forEach((prop, i) => {
      statements.push(db.insert(schema.properties).values({
        id: propertyIds[i],
        addressLine1: prop.address,
        purchasePrice: money(prop.purchasePrice),
        asIsValue: money(prop.asIsValue),
        rehabBudget: money(prop.rehabBudget),
        sunkCosts: money(prop.sunkCosts),
        estimatedPayoff: money(prop.estimatedPayoff),
        arv: money(prop.arv),
        // ARV is broker-stated here. Recording that is the point — an unsourced
        // ARV must never be mistaken for an underwritten one.
        ...(prop.arv !== null ? { arvSource: "broker-stated (portal)", arvAsOf: now } : {}),
        monthlyRent: money(prop.monthlyRent),
        annualTaxes: money(prop.annualTaxes),
        annualInsurance: money(prop.annualInsurance),
        annualHoa: money(prop.annualHoa),
      }));
    });

    statements.push(
      db.insert(schema.applications).values({
        id: applicationId,
        stage: "lead",
        product: rec.product as never,
        leadSource: "broker",
        channel: "broker-portal",
        ownerName: "Luis Fajardo",
        entityId,
        propertyId,
        requestedAmount: rec.loanAmount !== null ? String(rec.loanAmount) : null,
        loanPurpose: rec.loanPurpose,
        isPortfolio,
        propertyCount: scheduled.length > 0 ? scheduled.length : null,
        ltc: lev.ltc !== null ? lev.ltc.toFixed(4) : null,
        ltv: lev.ltv !== null ? lev.ltv.toFixed(4) : null,
        bindingRatio: lev.binding,
        notes: rec.notes,
        // The two columns the whole of Phase 2 turns on. Both come from the
        // session and the broker's own record — never from the request body.
        submittedByUserId: input.clerkUserId,
        brokerFirmId: firmId,
        legacySource: "broker-portal",
        submittedAt: now,
        stageEnteredAt: now,
      }),
    );

    // Every property is attached to the application, in the order entered —
    // including the single-property case, so the join table is always the
    // complete picture and never a portfolio-only special case.
    propertyIds.forEach((pid, i) => {
      statements.push(
        db.insert(schema.applicationProperties)
          .values({ applicationId, propertyId: pid, position: i })
          .onConflictDoNothing(),
      );
    });

    statements.push(
      db.insert(schema.stageTransitions).values({
        applicationId,
        fromStage: null,
        toStage: "lead",
        changedAt: now,
        changedBy: input.clerkUserId,
        reason: "submitted through the broker portal",
      }),
    );

    statements.push(
      db.insert(schema.participants)
        .values({ applicationId, contactId, role: "borrower" })
        .onConflictDoNothing(),
    );

    if (brokerContactId && !sameParty) {
      statements.push(
        db.insert(schema.participants)
          .values({ applicationId, contactId: brokerContactId, role: "broker" })
          .onConflictDoNothing(),
      );
    }

    statements.push(
      db.insert(schema.activities).values({
        contactId,
        applicationId,
        kind: "form_submission",
        occurredAt: now,
        source: "broker-portal",
        subject: input.submissionName || "Broker portal submission",
        body: input.summary || null,
        metadata: {
          brokerEmail,
          brokerUserId,
          firmId,
          fileCount: input.fileCount,
          driveFolder: input.driveFolder ?? null,
          productConfident: rec.productConfident,
          programLabel: clean(input.application?.program),
          isPortfolio,
          propertyCount: scheduled.length,
          // Loudly recorded rather than silently swallowed: a broker who sent
          // more properties than the product can price needs a conversation.
          propertiesDropped: schedule.dropped,
        },
        // A double-clicked submit button is idempotent; a genuine second
        // submission a minute later is not blocked.
        dedupKey: `broker-portal:${input.clerkUserId}:${now.toISOString()}`,
      }).onConflictDoNothing(),
    );

    await db.batch(statements as [BatchItem, ...BatchItem[]]);

    return { ok: true, applicationId, contactId, brokerUserId, firmId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
