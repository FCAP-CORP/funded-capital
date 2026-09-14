/**
 * Lending OS — database schema.
 *
 * Two rules govern everything here; see docs/lending-os.md for the reasoning.
 *
 * 1. THE APPLICATION IS THE CONTAINER, not the borrower and not the loan.
 *    People attach to an application through `participants` WITH A ROLE, so the
 *    same person can hold different roles across concurrent applications. Funded
 *    Capital's borrowers are repeat investors running one LLC per project; any
 *    model that hangs deal data off the contact breaks on the second deal.
 *
 * 2. STAGE IS DERIVED FROM DATA, AND ITS HISTORY IS APPEND-ONLY.
 *    `applications.stage` is a cache of the latest `stage_transitions` row. Never
 *    compute funnel metrics, time-in-stage, or conversion from the cached column —
 *    a mutable field cannot answer "how long did this sit in Underwriting". The old
 *    Excel CRM had a "Days in Stage" column that was 0% filled for exactly this
 *    reason.
 *
 * Documents are NOT stored here. They keep flowing to Drive intake; `documents`
 * holds metadata and a Drive file id only. That boundary is deliberate and bounds
 * the GLBA Safeguards surface — changing it is a compliance decision, not a
 * refactor.
 */

import {
  pgTable, pgEnum, uuid, text, integer, numeric, boolean,
  timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

/**
 * The origination pipeline. Two stages here have no equivalent in conventional
 * mortgage: TERM_SHEET_ISSUED -> TERM_SHEET_SIGNED is the hard-money analogue of
 * the rate lock and the real conversion gate, and CONDITIONS_CLEARING exists
 * because most stalled files are stalled conditions.
 *
 * `payoff` and `extension` are separate terminal states on purpose. An extension
 * means the loan continues and still belongs on the maturity ladder; a payoff
 * means it is done. Collapsing them makes the maturity report wrong.
 */
export const stageEnum = pgEnum("stage", [
  "lead",
  "qualified",
  "term_sheet_issued",
  "term_sheet_signed",
  "application_in",
  "underwriting",
  "conditional_approval",
  "conditions_clearing",
  "clear_to_close",
  "docs_out",
  "funded",
  "active",
  "draw_cycle",
  "payoff",
  "extension",
  "closed_lost",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "website",
  "biggerpockets",
  "referral",
  "broker",
  "linkedin",
  "cold_email",
  "reia",
  "wholesale",
  "other",
  "unknown",
]);

/** Only what Funded Capital actually lends on, plus escapes. */
export const productEnum = pgEnum("product", [
  "fix_and_flip",
  "ground_up",
  "dscr",
  "bridge",
  "multifamily",
  "multiple",
  "not_our_product",
  "unknown",
]);

export const participantRoleEnum = pgEnum("participant_role", [
  "borrower",
  "co_borrower",
  "guarantor",
  "ubo",
  "broker",
]);

export const activityKindEnum = pgEnum("activity_kind", [
  "email_in", "email_out", "call", "sms_in", "sms_out",
  "note", "field_change", "stage_change", "automation", "form_submission",
]);

/* --------------------------------------------------------------- contacts */

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),

  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),

  /**
   * E.164 only (+15551234567). Anything that could not be normalised is null and
   * the original is preserved in phoneRaw. Klaviyo resolves identity on phone, so
   * an unnormalised number is how duplicate profiles get created — all 500 phones
   * in the legacy CRM were in "305-555-0101" shape.
   */
  phone: text("phone"),
  phoneRaw: text("phone_raw"),

  leadSource: leadSourceEnum("lead_source").notNull().default("unknown"),
  targetMarket: text("target_market"),
  state: text("state"),

  /**
   * Track record. `claimedDeals` is what they told us; `verifiedDeals` is what we
   * confirmed against deed records. They are separate because borrowers inflate
   * their role, and the deals that would change an underwriting decision are the
   * ones least likely to appear on an application.
   */
  claimedDeals: integer("claimed_deals"),
  verifiedDeals: integer("verified_deals"),
  verificationMethod: text("verification_method"),

  creditBand: text("credit_band"),

  /** Consent state is mirrored IN from Klaviyo and Quo. Never written outward. */
  emailSubscribed: boolean("email_subscribed"),
  smsConsentAt: timestamp("sms_consent_at", { withTimezone: true }),
  smsConsentVersion: text("sms_consent_version"),
  smsOptedOut: boolean("sms_opted_out").notNull().default(false),

  ownerName: text("owner_name"),
  tags: text("tags").array().notNull().default([]),
  notes: text("notes"),

  legacyContactId: text("legacy_contact_id"),
  externalIds: jsonb("external_ids").$type<Record<string, string>>().default({}),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex("contacts_email_key").on(t.email),
  phoneIdx: index("contacts_phone_idx").on(t.phone),
  legacyIdx: uniqueIndex("contacts_legacy_id_key").on(t.legacyContactId),
  sourceIdx: index("contacts_lead_source_idx").on(t.leadSource),
}));

/* --------------------------------------------------------------- entities */

/** Borrowing LLCs. The entity is where the deed lives; the person is where the
 *  track record lives. One contact commonly has several disposable entities. */
export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  entityType: text("entity_type"),
  formationState: text("formation_state"),
  primaryContactId: uuid("primary_contact_id").references(() => contacts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  contactIdx: index("entities_primary_contact_idx").on(t.primaryContactId),
}));

/* ------------------------------------------------------------- properties */

export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),

  addressLine1: text("address_line1"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),

  propertyType: text("property_type"),
  units: integer("units"),

  purchasePrice: numeric("purchase_price", { precision: 14, scale: 2 }),
  asIsValue: numeric("as_is_value", { precision: 14, scale: 2 }),
  rehabBudget: numeric("rehab_budget", { precision: 14, scale: 2 }),

  /**
   * ARV is the highest-risk field in the system and the primary loss source when
   * overstated, so it is never a bare number. Source, date, comp reference and a
   * stressed figure travel with it.
   */
  arv: numeric("arv", { precision: 14, scale: 2 }),
  arvSource: text("arv_source"),
  arvAsOf: timestamp("arv_as_of", { withTimezone: true }),
  arvCompReference: text("arv_comp_reference"),
  arvStressed: numeric("arv_stressed", { precision: 14, scale: 2 }),

  monthlyRent: numeric("monthly_rent", { precision: 12, scale: 2 }),
  lienPosition: integer("lien_position"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  stateIdx: index("properties_state_idx").on(t.state),
}));

/* ----------------------------------------------------------- applications */

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** Cache of the newest stage_transitions row. History is the source of truth. */
  stage: stageEnum("stage").notNull().default("lead"),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull().defaultNow(),

  product: productEnum("product").notNull().default("unknown"),
  leadSource: leadSourceEnum("lead_source").notNull().default("unknown"),
  channel: text("channel"),
  ownerName: text("owner_name"),

  entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),

  requestedAmount: numeric("requested_amount", { precision: 14, scale: 2 }),
  downPayment: numeric("down_payment", { precision: 14, scale: 2 }),

  /**
   * All three leverage ratios are stored computed, and `bindingRatio` names the
   * one that actually constrains the deal — whichever is most conservative.
   */
  ltc: numeric("ltc", { precision: 6, scale: 4 }),
  ltarv: numeric("ltarv", { precision: 6, scale: 4 }),
  ltv: numeric("ltv", { precision: 6, scale: 4 }),
  bindingRatio: text("binding_ratio"),

  exitStrategy: text("exit_strategy"),
  timeline: text("timeline"),

  termSheetIssuedAt: timestamp("term_sheet_issued_at", { withTimezone: true }),
  termSheetSignedAt: timestamp("term_sheet_signed_at", { withTimezone: true }),
  decisionedAt: timestamp("decisioned_at", { withTimezone: true }),
  fundedAt: timestamp("funded_at", { withTimezone: true }),
  lostReason: text("lost_reason"),

  /** Verbatim from the borrower. Never paraphrase this into a summary field. */
  borrowerMessage: text("borrower_message"),
  notes: text("notes"),

  legacySource: text("legacy_source"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  stageIdx: index("applications_stage_idx").on(t.stage),
  sourceIdx: index("applications_lead_source_idx").on(t.leadSource),
  submittedIdx: index("applications_submitted_at_idx").on(t.submittedAt),
}));

/* ----------------------------------------------------------- participants */

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  role: participantRoleEnum("role").notNull().default("borrower"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  /** One person holds one role per application, but may hold roles on many. */
  uniq: uniqueIndex("participants_app_contact_role_key").on(t.applicationId, t.contactId, t.role),
  appIdx: index("participants_application_idx").on(t.applicationId),
  contactIdx: index("participants_contact_idx").on(t.contactId),
}));

/* ------------------------------------------------------- stage_transitions */

/** Append-only. The ONLY honest source for time-in-stage and funnel conversion. */
export const stageTransitions = pgTable("stage_transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  fromStage: stageEnum("from_stage"),
  toStage: stageEnum("to_stage").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  changedBy: text("changed_by"),
  reason: text("reason"),
}, (t) => ({
  appIdx: index("stage_transitions_application_idx").on(t.applicationId),
  atIdx: index("stage_transitions_changed_at_idx").on(t.changedAt),
}));

/* ------------------------------------------------------------- activities */

/** Append-only. Every email, call, SMS, note, field change and automation event. */
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }),
  kind: activityKindEnum("kind").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source"),
  subject: text("subject"),
  body: text("body"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  /** Provider event id. Inbound webhooks are at-least-once; this is the dedup key. */
  dedupKey: text("dedup_key"),
}, (t) => ({
  contactIdx: index("activities_contact_idx").on(t.contactId),
  appIdx: index("activities_application_idx").on(t.applicationId),
  atIdx: index("activities_occurred_at_idx").on(t.occurredAt),
  dedupIdx: uniqueIndex("activities_dedup_key").on(t.dedupKey),
}));

/* -------------------------------------------------------------- documents */

/** METADATA ONLY. The file itself lives in Drive intake and stays there. */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  docType: text("doc_type"),
  driveFileId: text("drive_file_id"),
  driveFolderId: text("drive_folder_id"),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  expiresOn: timestamp("expires_on", { withTimezone: true }),
}, (t) => ({
  appIdx: index("documents_application_idx").on(t.applicationId),
}));

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
