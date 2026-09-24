/**
 * BiggerPockets leads -> Lending OS. The pure half: what a lead MEANS.
 *
 * WHY THIS EXISTS:
 * Website leads have been written into Postgres at submit time since
 * lib/leads/record.ts. BiggerPockets leads never were. They arrive as emails
 * from alerts@t.biggerpockets.com; an Apps Script parses each one every minute,
 * writes the Google Sheet row, sends the approved acknowledgement, creates the
 * Quo contact and alerts Luis — and nothing reached the CRM. The 14 Sep 2026
 * migration loaded 96 BiggerPockets leads by hand; every lead since then was
 * missing from /crm. About fifty paid leads a month.
 *
 * The fix is the same one the website got: the write happens in the code path
 * that owns the event. The Apps Script now posts each parsed lead to
 * /api/crm/lead-intake right after it writes the sheet row.
 *
 * FIELD NAMES ARE THE PARSER'S, VERBATIM. `parseBpLead_` in the Apps Script
 * (06-website/docs/apps-script-biggerpockets-lead-intake.gs) produces the
 * object this module reads, and `BP_LEAD_FIELDS` below is copied from it. The
 * parser's conventions matter as much as its names:
 *   - every absent field is the string "N/A", never blank — `clean()` from the
 *     migration already treats that as empty;
 *   - `firstName` is the literal word "there" when BiggerPockets sent no name
 *     (the ack template says "Hi there,"). That is not a person's name and is
 *     never stored as one;
 *   - `targetPrice` has already been back-filled from `maxPrice` when blank;
 *   - `phoneE164` is the parser's own normalisation, and is empty when it
 *     could not produce one — the raw `phone` is still there.
 *
 * PRODUCT CLASSIFICATION IS THE MIGRATION'S, NOT A NEW ONE. `mapProduct` from
 * lib/migrate/transform.ts is called with exactly the three inputs the 14 Sep
 * migration gave it (loan type, goal, strategy). HELOC, home-equity and
 * conventional requests therefore land as `not_our_product`, as the 96 migrated
 * leads did. Two classifiers would drift.
 *
 * NO SMS CONSENT. The BiggerPockets form is not Funded Capital's documented
 * opt-in, and SMS to BP leads is on hold pending counsel (SYSTEM-RECAP §7b).
 * Nothing here writes `sms_consent_at`, so every BP contact stays outside every
 * automated SMS send until they opt in through a form of ours.
 *
 * Covered by lib/leads/biggerpockets.regress.ts.
 */

import { normalisePhone } from "../phone";
import { clean, parseMoney, parseMarket, splitName, mapProduct, leverage } from "../migrate/transform";

/* ------------------------------------------------------------ the input */

/**
 * Every field `parseBpLead_` returns, in its order, plus the three
 * `processBiggerPocketsLeads` adds (messageId, receivedAt, subject).
 */
export const BP_LEAD_FIELDS = [
  "name", "profile", "email", "phone", "preferredContact", "market", "strategy",
  "ownerOccupied", "goal", "loanType", "timeline", "creditScore", "downPayment",
  "propertyAddress", "maxPrice", "minPrice", "numInvestments", "uniqueSituations",
  "specificProperty", "amountNeeded", "targetPrice", "preApproval", "marketZip",
  "source", "comments",
  // derived by the parser
  "profileUrl", "firstName", "lastName", "phoneE164",
  // added by processBiggerPocketsLeads
  "messageId", "subject",
] as const;

export type BpLeadField = (typeof BP_LEAD_FIELDS)[number];
export type BpLead = Partial<Record<BpLeadField, string>>;

/** A lead that passed validation and can be written. */
export interface BpIntakeItem {
  /** Gmail's id for the BiggerPockets email. Null only for a hand-entered sheet row. */
  gmailMessageId: string | null;
  /** The idempotency key stored on the activity row. See `bpDedupKey`. */
  dedupKey: string;
  receivedAt: Date;
  lead: BpLead;
}

export type BpValidation =
  | { ok: true; item: BpIntakeItem }
  | { ok: false; gmailMessageId: string | null; error: string };

/** One request is bounded; the Apps Script sends 1 live and 25 per backfill batch. */
export const MAX_BP_LEADS_PER_REQUEST = 50;

/** Any single field longer than this is truncated, never rejected. */
const MAX_FIELD_CHARS = 2_000;
const MAX_COMMENT_CHARS = 8_000;

/** Gmail message ids are 16 hex characters today; allow room without allowing junk. */
const GMAIL_ID = /^[A-Za-z0-9_-]{8,128}$/;

/** The Apps Script's own `isEmail_`, so both sides agree on what an address is. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Earliest plausible lead. BiggerPockets capture began in 2026. */
const EARLIEST = Date.UTC(2025, 0, 1);

/**
 * The idempotency key for one BiggerPockets lead.
 *
 * DECISION: the Gmail message id. BiggerPockets sends one email per lead, the
 * Apps Script already keys everything on it (the `BP/Processed` label, the Quo
 * `externalId: "bp-" + messageId`), and the sheet stores it in column AK
 * ("Gmail Message ID"), so the live trigger and the backfill produce the same
 * key for the same lead. A resend or an overlapping backfill collides on the
 * unique index on `activities.dedup_key` and writes nothing.
 *
 * FALLBACK, for a sheet row someone typed in by hand with no message id: the
 * contact's email (or phone) plus the received time to the second. Derived
 * HERE rather than accepted from the caller, so there is one tested definition
 * and a caller cannot write into another source's key space (`gmail:…` belongs
 * to the Gmail activity sync). Both inputs come from the same sheet cells on
 * every run, so the fallback is as stable as the row.
 *
 * The two forms never collide with each other: `bp:gmail:` vs `bp:row:`.
 */
export function bpDedupKey(input: {
  gmailMessageId: string | null; email: string | null; phone: string | null; receivedAt: Date;
}): string | null {
  if (input.gmailMessageId) return `bp:gmail:${input.gmailMessageId}`;
  const who = input.email ?? input.phone;
  if (!who) return null;
  const seconds = Math.floor(input.receivedAt.getTime() / 1000);
  return `bp:row:${who}:${new Date(seconds * 1000).toISOString()}`;
}

/** Lowercased address if it is one, else null. */
export function usableEmail(v: unknown): string | null {
  const s = clean(v)?.toLowerCase() ?? null;
  return s && EMAIL.test(s) ? s : null;
}

function str(v: unknown, max: number): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return undefined;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Check one element of the request's `leads` array.
 *
 * Deliberately lenient about CONTENT and strict about IDENTITY. A lead with
 * half its fields missing is still a lead and is written. What cannot be
 * written is something with no way to tell whether it has been written before
 * (no id and no contact detail), or no way to know when it arrived — those
 * come back as a per-lead error, and the rest of the batch still writes.
 */
export function validateBpItem(raw: unknown, now: Date = new Date()): BpValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, gmailMessageId: null, error: "each lead must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;

  const idRaw = typeof r.gmailMessageId === "string" ? r.gmailMessageId.trim()
    : typeof r.messageId === "string" ? r.messageId.trim() : "";
  if (idRaw && !GMAIL_ID.test(idRaw)) {
    return { ok: false, gmailMessageId: idRaw.slice(0, 128), error: "gmailMessageId is not a Gmail message id" };
  }
  const gmailMessageId = idRaw || null;

  const receivedAt = toDate(r.receivedAt);
  if (!receivedAt) {
    return { ok: false, gmailMessageId, error: "receivedAt is missing or not a date" };
  }
  if (receivedAt.getTime() < EARLIEST || receivedAt.getTime() > now.getTime() + 24 * 3600_000) {
    return { ok: false, gmailMessageId, error: `receivedAt ${receivedAt.toISOString()} is outside any plausible range` };
  }

  const lead: BpLead = {};
  for (const f of BP_LEAD_FIELDS) {
    const v = str(r[f], f === "comments" || f === "uniqueSituations" ? MAX_COMMENT_CHARS : MAX_FIELD_CHARS);
    if (v !== undefined) lead[f] = v;
  }

  const email = usableEmail(lead.email);
  const phone = contactPhone(lead);
  const hasName = personName(lead).firstName !== null;
  if (!email && !phone.e164 && !phone.raw && !hasName) {
    return {
      ok: false, gmailMessageId,
      error: "no name, email or phone — the BiggerPockets email format may have changed; the sheet row still has it",
    };
  }

  const dedupKey = bpDedupKey({ gmailMessageId, email, phone: phone.e164, receivedAt });
  if (!dedupKey) {
    return {
      ok: false, gmailMessageId,
      error: "no gmailMessageId and no email or phone to key it on — enter this lead by hand",
    };
  }

  return { ok: true, item: { gmailMessageId, dedupKey, receivedAt, lead } };
}

/* ------------------------------------------------------------ mapping */

/**
 * Names as the parser left them. The parser sets firstName to "there" exactly
 * when `name` is "N/A" (so the ack can say "Hi there,"), which is why `name` is
 * checked FIRST: that one test is what keeps "There" out of the CRM as a first
 * name. The parser's own split is preferred because it capitalised it.
 */
export function personName(lead: BpLead): { firstName: string | null; lastName: string | null } {
  const full = clean(lead.name);
  if (!full) return { firstName: null, lastName: null };
  const first = clean(lead.firstName);
  if (first) return { firstName: first, lastName: clean(lead.lastName) };
  return splitName(full);
}

function contactPhone(lead: BpLead): { e164: string | null; raw: string | null } {
  // The parser's E.164 first; if it could not make one, try the raw number
  // through the CRM's own normaliser, which knows more than the parser does.
  const candidate = clean(lead.phoneE164) ?? clean(lead.phone);
  if (!candidate) return { e164: null, raw: null };
  const r = normalisePhone(candidate);
  if (r.ok) return { e164: r.e164, raw: null };
  // A number that cannot be dialled is kept verbatim, never dropped.
  return { e164: null, raw: clean(lead.phone) ?? candidate };
}

/**
 * BiggerPockets fills blank free-text answers with "None". It is not a
 * message, and storing it as `borrower_message` would make every empty lead
 * look like it said something.
 */
function prose(v: unknown): string | null {
  const s = clean(v);
  return s && s.toLowerCase() !== "none" ? s : null;
}

/**
 * One dollar figure, or null.
 *
 * `parseMoney` strips every non-digit, which is right for "$1,500,000" and
 * wrong for "$100,000 - $150,000" (it would read 100000150000) or "20%" (it
 * would read twenty dollars). Those are refused here and kept verbatim in the
 * notes instead: a missing number is visible, a wrong one looks like data.
 */
export function singleMoney(v: unknown): { value: number | null; unparsed: string | null } {
  const s = clean(v);
  if (s === null) return { value: null, unparsed: null };
  const groups = s.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (s.includes("%") || groups.length !== 1) return { value: null, unparsed: s };
  const n = parseMoney(s);
  return n === null || n < 0 ? { value: null, unparsed: s } : { value: n, unparsed: null };
}

export interface BpRecord {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  /** What BiggerPockets sent when it is not a usable address. */
  emailAsGiven: string | null;
  phone: string | null;
  phoneRaw: string | null;
  targetMarket: string | null;
  state: string | null;
  postalCode: string | null;
  creditBand: string | null;
  profileUrl: string | null;
  product: string;
  productConfident: boolean;
  propertyAddress: string | null;
  targetPrice: number | null;
  downPayment: number | null;
  amountNeeded: number | null;
  timeline: string | null;
  message: string | null;
  notes: string | null;
}

/** Pure field mapping. No database, so every case is testable. */
export function buildBpRecord(lead: BpLead): BpRecord {
  const { firstName, lastName } = personName(lead);
  const email = usableEmail(lead.email);
  const emailGiven = clean(lead.email);
  const phone = contactPhone(lead);
  const { market, state } = parseMarket(lead.market);
  const zip = clean(lead.marketZip);

  // Exactly the three hints the 14 Sep migration used, in the same shape.
  const { product, confident } = mapProduct({
    loanType: lead.loanType, goal: lead.goal, strategy: lead.strategy,
  });

  const target = singleMoney(clean(lead.targetPrice) ?? lead.maxPrice);
  const down = singleMoney(lead.downPayment);
  const needed = singleMoney(lead.amountNeeded);

  const profileUrl = clean(lead.profileUrl);
  const validProfile = profileUrl && /^https:\/\/www\.biggerpockets\.com\/users\/[A-Za-z0-9_-]+$/.test(profileUrl)
    ? profileUrl : null;

  // Everything BiggerPockets asked that has no column of its own. Same
  // "label: value · label: value" shape as lib/leads/record.ts.
  const notes: string[] = ["via BiggerPockets"];
  const add = (label: string, v: unknown) => { const s = prose(v); if (s) notes.push(`${label}: ${s}`); };
  add("goal", lead.goal);
  add("loan type", lead.loanType);
  add("strategy", lead.strategy);
  add("owner occupied", lead.ownerOccupied);
  add("investments so far", lead.numInvestments);
  add("specific property in mind", lead.specificProperty);
  add("pre-approval", lead.preApproval);
  add("unique situations", lead.uniqueSituations);
  add("preferred contact", lead.preferredContact);
  if (!confident && product !== "unknown") notes.push("product inferred with low confidence");
  if (emailGiven && !email) notes.push(`email as given (not usable): ${emailGiven}`);
  if (phone.raw) notes.push(`phone as given (not diallable): ${phone.raw}`);
  if (target.unparsed) notes.push(`target price as given: ${target.unparsed}`);
  if (down.unparsed) notes.push(`down payment as given: ${down.unparsed}`);
  if (needed.unparsed) notes.push(`amount needed as given: ${needed.unparsed}`);

  return {
    firstName, lastName, email,
    emailAsGiven: emailGiven && !email ? emailGiven : null,
    phone: phone.e164, phoneRaw: phone.raw,
    targetMarket: market, state,
    postalCode: zip && /^\d{5}(-\d{4})?$/.test(zip) ? zip : null,
    creditBand: clean(lead.creditScore),
    profileUrl: validProfile,
    product, productConfident: confident,
    propertyAddress: clean(lead.propertyAddress),
    targetPrice: target.value,
    downPayment: down.value,
    amountNeeded: needed.value,
    timeline: clean(lead.timeline),
    message: prose(lead.comments),
    notes: notes.join(" · "),
  };
}

/* ------------------------------------------------- repeat enquirer + dedup */

/** The columns of an existing contact that the planner needs to see. */
export type ExistingContact = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  creditBand: string | null;
  targetMarket: string | null;
  state: string | null;
  leadSource: string;
  externalIds: Record<string, string> | null;
};

/** What the database already knows about this lead. Read by the server half. */
export interface BpKnown {
  /** An activity already carries this lead's dedup key. */
  dedupHit: { applicationId: string | null } | null;
  /** The contact with this email, when the lead has a usable one. */
  emailContact: ExistingContact | null;
  /** Every contact holding this E.164 number. */
  phoneContacts: ExistingContact[];
  /** Applications the 14 Sep migration loaded for the matched contact. */
  migratedApps: { id: string; submittedAt: Date | null }[];
}

export type ContactPatch = Partial<{
  phone: string; creditBand: string; firstName: string; lastName: string;
  targetMarket: string; state: string; leadSource: "biggerpockets";
  externalIds: Record<string, string>;
}>;

export type BpPlan =
  | { action: "duplicate"; applicationId: string | null; reason: string }
  | {
      action: "create";
      contact:
        | { mode: "reuse"; id: string; matchedOn: "email" | "phone"; patch: ContactPatch }
        | { mode: "create" };
      /** Other contacts already holding this phone — flagged, never merged. */
      phoneSharedWith: string[];
    };

/**
 * The fields a repeat enquirer's contact gains.
 *
 * lib/leads/record.ts's rule, applied to BiggerPockets' fields: only ever fill
 * gaps — a later lead must not blank or overwrite what an earlier one set —
 * with the one exception record.ts makes, the credit band, which is replaced
 * by the newest self-reported one. Lead source moves to `biggerpockets` only
 * from `unknown`/`other`, exactly as the migration did for BP rows it found in
 * the workbook. Consent is never touched (see the header).
 */
export function contactGapFill(existing: ExistingContact, rec: BpRecord): ContactPatch {
  const patch: ContactPatch = {};
  if (rec.phone && !existing.phone) patch.phone = rec.phone;
  if (rec.creditBand) patch.creditBand = rec.creditBand;
  if (rec.firstName && !existing.firstName) patch.firstName = rec.firstName;
  if (rec.lastName && !existing.lastName) patch.lastName = rec.lastName;
  if (rec.targetMarket && !existing.targetMarket) patch.targetMarket = rec.targetMarket;
  if (rec.state && !existing.state) patch.state = rec.state;
  if (existing.leadSource === "unknown" || existing.leadSource === "other") patch.leadSource = "biggerpockets";
  const ids = existing.externalIds ?? {};
  if (rec.profileUrl && !ids.biggerpockets) patch.externalIds = { ...ids, biggerpockets: rec.profileUrl };
  return patch;
}

/** How close a lead must be to a migrated application to be the same one. */
const MIGRATION_TWIN_HOURS = 36;

/**
 * Was this exact lead already loaded by the 14 Sep migration?
 *
 * The backfill starts ON 14 September, and the migration's export was taken
 * that same day, so leads from that morning are in both. The migration stored
 * the submission DATE only (midnight UTC, from "09/14/2026"), with no Gmail id
 * to match on — so the test is: the same person has a migrated BiggerPockets
 * application submitted within a day and a half of this email. Two BP
 * submissions from one person that close together are one enquiry; BP itself
 * sends "(duplicate submission received)" for exactly that.
 */
export function migratedTwin(
  receivedAt: Date, migratedApps: { id: string; submittedAt: Date | null }[],
): string | null {
  for (const a of migratedApps) {
    if (!a.submittedAt) continue;
    const hours = Math.abs(receivedAt.getTime() - a.submittedAt.getTime()) / 3600_000;
    if (hours <= MIGRATION_TWIN_HOURS) return a.id;
  }
  return null;
}

/**
 * Decide what to do with one lead, given what the database already holds.
 *
 * Contact matching follows lib/leads/record.ts: ONE contact per email, reused
 * for every later enquiry, and a NEW application every time — the application
 * is the container, and a second enquiry is a second deal.
 *
 * Phone is a fallback, not a peer. It is used only when the lead has no usable
 * email, and only when exactly one contact holds the number. When the lead HAS
 * an email and the phone belongs to someone else, the lead gets its own contact
 * and the overlap is written into the notes — the migration's rule: shared
 * phones are surfaced, never auto-merged, because a wrong merge loses a real
 * borrower (and a family or a business line shares numbers legitimately).
 */
export function planBpWrite(item: BpIntakeItem, rec: BpRecord, known: BpKnown): BpPlan {
  if (known.dedupHit) {
    return { action: "duplicate", applicationId: known.dedupHit.applicationId, reason: "already recorded (same BiggerPockets email)" };
  }

  let match: { c: ExistingContact; on: "email" | "phone" } | null = null;
  if (rec.email && known.emailContact) match = { c: known.emailContact, on: "email" };
  else if (!rec.email && rec.phone && known.phoneContacts.length === 1) {
    match = { c: known.phoneContacts[0], on: "phone" };
  }

  if (match) {
    const twin = migratedTwin(item.receivedAt, known.migratedApps);
    if (twin) {
      return { action: "duplicate", applicationId: twin, reason: "already in the CRM from the 14 Sep 2026 migration" };
    }
  }

  const matchedId = match?.c.id ?? null;
  const phoneSharedWith = rec.phone
    ? known.phoneContacts.map((c) => c.id).filter((id) => id !== matchedId)
    : [];

  return {
    action: "create",
    contact: match
      ? { mode: "reuse", id: match.c.id, matchedOn: match.on, patch: contactGapFill(match.c, rec) }
      : { mode: "create" },
    phoneSharedWith,
  };
}

/* ----------------------------------------------------------- the rows */

const OWNER = "Luis Fajardo";
const money = (v: number | null) => (v !== null ? String(v) : null);

/**
 * Every row one new lead writes, as plain objects.
 *
 * Pure so the tests can see exactly what reaches the database, including the
 * repeat-enquirer path. The ids are passed in because the server half writes
 * all of this in ONE `db.batch` — nothing may wait on an earlier RETURNING.
 */
export function buildBpRows(
  item: BpIntakeItem,
  rec: BpRecord,
  plan: Extract<BpPlan, { action: "create" }>,
  ids: { contactId: string; applicationId: string; propertyId: string },
  via: "live" | "backfill" | "unknown",
) {
  const at = item.receivedAt;
  const reuse = plan.contact.mode === "reuse";
  const contactId = plan.contact.mode === "reuse" ? plan.contact.id : ids.contactId;

  const notes = plan.phoneSharedWith.length
    ? `${rec.notes} · phone also on ${plan.phoneSharedWith.length} other contact${plan.phoneSharedWith.length === 1 ? "" : "s"} — check for a duplicate`
    : rec.notes;

  const newContact = plan.contact.mode === "create"
    ? {
        id: ids.contactId,
        firstName: rec.firstName, lastName: rec.lastName, email: rec.email,
        phone: rec.phone, phoneRaw: rec.phoneRaw,
        leadSource: "biggerpockets" as const,
        targetMarket: rec.targetMarket, state: rec.state,
        creditBand: rec.creditBand, ownerName: OWNER,
        tags: ["biggerpockets"],
        notes: rec.emailAsGiven ? `BiggerPockets sent an unusable email: ${rec.emailAsGiven}` : null,
        externalIds: (rec.profileUrl ? { biggerpockets: rec.profileUrl } : {}) as Record<string, string>,
        createdAt: at,
        // NO sms_consent_* — see the header.
      }
    : null;

  const contactPatch = plan.contact.mode === "reuse" ? plan.contact.patch : null;

  const hasProperty = Boolean(rec.propertyAddress || rec.targetMarket || rec.state || rec.targetPrice !== null);
  const property = hasProperty
    ? {
        id: ids.propertyId,
        addressLine1: rec.propertyAddress,
        city: rec.targetMarket, state: rec.state, postalCode: rec.postalCode,
        purchasePrice: money(rec.targetPrice),
      }
    : null;

  // The migration measured BP leverage the same way: amount needed against
  // target price. BiggerPockets never asks for ARV or rehab.
  const lev = leverage({ loanAmount: rec.amountNeeded, purchasePrice: rec.targetPrice });

  const application = {
    id: ids.applicationId,
    stage: "lead" as const,
    product: rec.product,
    leadSource: "biggerpockets" as const,
    channel: "biggerpockets",
    ownerName: OWNER,
    propertyId: property ? ids.propertyId : null,
    requestedAmount: money(rec.amountNeeded),
    downPayment: money(rec.downPayment),
    ltc: lev.ltc !== null ? lev.ltc.toFixed(4) : null,
    ltarv: lev.ltarv !== null ? lev.ltarv.toFixed(4) : null,
    ltv: lev.ltv !== null ? lev.ltv.toFixed(4) : null,
    bindingRatio: lev.binding,
    timeline: rec.timeline,
    borrowerMessage: rec.message,
    notes,
    // Distinct from the migration's "biggerpockets", so the two populations
    // stay separable — and so `migratedTwin` can find only migrated rows.
    legacySource: "biggerpockets:intake",
    submittedAt: at,
    stageEnteredAt: at,
    // No submittedByUserId, no brokerFirmId: a house lead. That null is what
    // keeps it out of every broker's view (lib/broker/scope.ts).
  };

  const transition = {
    applicationId: ids.applicationId, fromStage: null, toStage: "lead" as const,
    changedAt: at, changedBy: "biggerpockets-intake",
    reason: "BiggerPockets lead",
  };

  const participant = { applicationId: ids.applicationId, contactId, role: "borrower" as const };

  const bp: Record<string, string> = {};
  for (const f of BP_LEAD_FIELDS) {
    const v = item.lead[f];
    if (v !== undefined && v !== "" && v !== "N/A") bp[f] = v;
  }

  const activity = {
    contactId, applicationId: ids.applicationId, kind: "form_submission" as const,
    occurredAt: at, source: "biggerpockets",
    subject: "BiggerPockets lead",
    body: rec.message,
    metadata: {
      gmailMessageId: item.gmailMessageId,
      via,
      repeat: reuse,
      matchedOn: plan.contact.mode === "reuse" ? plan.contact.matchedOn : null,
      productConfident: rec.productConfident,
      phoneSharedWith: plan.phoneSharedWith,
      // Everything BiggerPockets sent, verbatim, so nothing the parser found is
      // lost even where no column holds it.
      bp,
    },
    // THE IDEMPOTENCY LOCK. Inserted WITHOUT on-conflict-do-nothing: a second
    // write of the same lead violates the unique index, and because the whole
    // batch is one transaction, the application, property and contact written
    // alongside it roll back too. See biggerpockets.server.ts.
    dedupKey: item.dedupKey,
  };

  return { newContact, contactPatch, contactId, property, application, transition, participant, activity };
}
