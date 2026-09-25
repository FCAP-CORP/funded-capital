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
  timestamp, jsonb, index, uniqueIndex, date, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

/**
 * Broker portal roles. Deliberately NOT the same axis as CRM staff access —
 * `lib/crm/access.ts` decides who is Funded Capital, this decides what someone
 * sees inside their own brokerage. Nothing here grants any view of the book.
 *
 *   member — their own submissions only
 *   lead   — every deal at their firm, and may work them
 *   owner  — same as lead today; kept separate so the firm's principal is
 *            identifiable when leads and owners need to diverge
 */
export const brokerRoleEnum = pgEnum("broker_role", [
  "owner",
  "lead",
  "member",
]);

/** Used for both firms and the people in them: one switch that cuts access. */
export const brokerStatusEnum = pgEnum("broker_status", [
  "active",
  "suspended",
]);

/**
 * Marketing channels the portal can request content for.
 *
 * Deliberately three, and deliberately NOT a free-text field: each one has a
 * different fulfilment path and a different definition of "published", and a
 * channel nobody has written that path for would sit in the queue forever
 * looking like a bug.
 */
export const contentChannelEnum = pgEnum("content_channel", [
  "blog",
  "linkedin",
  "email",
]);

/**
 * Where a request has got to.
 *
 *   requested   — Luis asked for it. Nothing has happened yet.
 *   in_progress — a scheduled task has claimed it and is working.
 *   drafted     — there is something to read, at draft_url.
 *   published   — it is live (blog) or Luis sent it (LinkedIn, email).
 *   failed      — fulfilment broke, and `error` says how. VISIBLE, not silent:
 *                 a request that quietly stops is the exact failure this whole
 *                 feature exists to prevent.
 *   cancelled   — Luis changed his mind.
 */
export const contentStatusEnum = pgEnum("content_status", [
  "requested",
  "in_progress",
  "drafted",
  "published",
  "failed",
  "cancelled",
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

  /**
   * The rest of what portfolio pricing needs per property, named to match
   * `PortfolioProperty` in lib/pricing.ts so the two cannot drift.
   *
   * `sunkCosts` and `estimatedPayoff` are refinance-only; `annual*` are the
   * DSCR carrying costs. All nullable: a Fix & Flip property has no rent, and a
   * purchase has no payoff.
   */
  annualTaxes: numeric("annual_taxes", { precision: 12, scale: 2 }),
  annualInsurance: numeric("annual_insurance", { precision: 12, scale: 2 }),
  annualHoa: numeric("annual_hoa", { precision: 12, scale: 2 }),
  sunkCosts: numeric("sunk_costs", { precision: 14, scale: 2 }),
  estimatedPayoff: numeric("estimated_payoff", { precision: 14, scale: 2 }),
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

  /**
   * A portfolio is a STRUCTURE, not a product: lib/pricing.ts prices up to ten
   * properties on one loan across all three programs, so a portfolio can be
   * DSCR, Fix & Flip or Bridge. Modelling it as a fifth product would have left
   * a Fix & Flip portfolio with nowhere to go.
   *
   * "DSCR Portfolio" as a programme name is therefore a REPORTING category —
   * product = dscr AND isPortfolio — not a stored value.
   */
  isPortfolio: boolean("is_portfolio").notNull().default(false),
  /** How many properties the broker actually submitted. */
  propertyCount: integer("property_count"),

  /**
   * purchase | rate_term_refi | cash_out_refi — the keys from
   * LOAN_PURPOSE_OPTIONS in lib/pricing.ts, validated on the way in.
   *
   * It decides which number the borrower was asked for, and therefore which
   * leverage ratio binds: a purchase is measured against PRICE (LTC), a
   * refinance against today's VALUE (LTV). Storing the purpose is what makes
   * `bindingRatio` interpretable after the fact.
   */
  loanPurpose: text("loan_purpose"),

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

  /**
   * Who filed it, when a broker did. Null for a website or BiggerPockets lead
   * that came to Funded Capital directly — and that null is what keeps house
   * leads out of every broker's view, so it is meaningful, not just absent.
   *
   * A Clerk user id rather than a contact id: it must match the session on the
   * request, and a contact row can be merged or re-created underneath it.
   */
  submittedByUserId: text("submitted_by_user_id"),

  /**
   * The firm it was submitted UNDER, stamped once at submission and never
   * recalculated. Deriving it from the submitter's current firm instead would
   * mean a broker changing brokerage silently drags their old deals into the
   * new firm's pipeline — and out of the old one's, where the people who worked
   * them still need to see them.
   */
  brokerFirmId: uuid("broker_firm_id").references(() => brokerFirms.id, { onDelete: "set null" }),

  /**
   * When this deal should surface on the dashboard again, and when that was
   * decided. The set-at column is not redundant: the work queue voids a snooze
   * if the borrower makes contact after it was taken, and without knowing when
   * it was taken there is no way to tell which came first.
   */
  nextActionAt: timestamp("next_action_at", { withTimezone: true }),
  nextActionSetAt: timestamp("next_action_set_at", { withTimezone: true }),
  nextActionNote: text("next_action_note"),

  legacySource: text("legacy_source"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  stageIdx: index("applications_stage_idx").on(t.stage),
  sourceIdx: index("applications_lead_source_idx").on(t.leadSource),
  submittedIdx: index("applications_submitted_at_idx").on(t.submittedAt),
  /** Both sides of every broker-scoped query. Without these the portal scans. */
  submitterIdx: index("applications_submitted_by_idx").on(t.submittedByUserId),
  brokerFirmIdx: index("applications_broker_firm_idx").on(t.brokerFirmId),
  nextActionIdx: index("applications_next_action_at_idx").on(t.nextActionAt),
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

/* -------------------------------------------------------------- crm_tasks */

/**
 * A to-do on one deal: "order the appraisal", "chase the insurance binder".
 * Migration 0010.
 *
 * Attached to the APPLICATION, like everything else about a deal — a repeat
 * investor with three files has three separate lists, and a task filed against
 * the person would not say which deal it was for.
 *
 * `due_on` is a calendar DAY, not a moment. "Due Thursday" means Thursday on
 * Luis's calendar (America/New_York), and a timestamp would make the same task
 * overdue at 8pm Wednesday in New York because it is already Thursday in UTC.
 * lib/crm/tasks.ts does every comparison on the New York calendar.
 *
 * SOFT DELETE. `deleted_at` hides a task rather than removing the row, so a
 * task that vanished can be explained afterwards — who removed it, and when.
 * Nothing reads a deleted task back into the card.
 *
 * The title bound (1–200) is enforced here as well as in lib/crm/tasks.ts, so a
 * write that bypasses the action cannot store an empty or runaway title.
 */
export const crmTasks = pgTable("crm_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueOn: date("due_on", { mode: "string" }),
  /** Clerk user id of whoever added it. */
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: text("completed_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  titleLength: check("crm_tasks_title_length_check", sql`char_length(${t.title}) BETWEEN 1 AND 200`),
  appIdx: index("crm_tasks_application_idx").on(t.applicationId).where(sql`${t.deletedAt} IS NULL`),
  openDueIdx: index("crm_tasks_open_due_idx").on(t.dueOn).where(sql`${t.completedAt} IS NULL AND ${t.deletedAt} IS NULL`),
}));

export type CrmTask = typeof crmTasks.$inferSelect;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;

/* ------------------------------------------------------------ broker firms */

/**
 * A brokerage that sends Funded Capital deals.
 *
 * This is the first table that makes the database multi-tenant, and every rule
 * about who may read across it lives in `lib/broker/scope.ts` — tested there,
 * and nowhere else, so there is exactly one place to audit.
 *
 * Firms are created by Luis in the CRM, never by self-service. A broker signing
 * up gets a `broker_users` row with a null firm and waits to be linked, which is
 * what stops someone typing a competitor's brokerage name into a form and
 * joining their pipeline.
 */
export const brokerFirms = pgTable("broker_firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),

  /** Suspending a firm cuts everyone in it, without unpicking the people. */
  status: brokerStatusEnum("status").notNull().default("active"),

  /** Luis's own notes on the relationship. Never shown in the broker portal. */
  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameIdx: index("broker_firms_name_idx").on(t.name),
}));

/* ------------------------------------------------------------ broker users */

/**
 * One row per person who has signed into the broker portal.
 *
 * The row exists from their first sign-in, BEFORE they belong to anywhere:
 * `firmId` stays null until Luis links them. That unassigned state is the whole
 * queue he works from, so it is a normal value here and not an error — see the
 * matching note in lib/broker/scope.ts.
 *
 * `clerkUserId` is the join to the session and the only field a request is
 * allowed to be scoped by. Nothing here is ever read from the browser.
 */
export const brokerUsers = pgTable("broker_users", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** From the session, never from a request body. */
  clerkUserId: text("clerk_user_id").notNull(),

  /** Lowercased at write time so it matches `contacts.email` lookups. */
  email: text("email").notNull(),
  name: text("name"),
  phone: text("phone"),

  /** Null until assigned. See the table docblock. */
  firmId: uuid("firm_id").references(() => brokerFirms.id, { onDelete: "set null" }),
  role: brokerRoleEnum("role").notNull().default("member"),
  status: brokerStatusEnum("status").notNull().default("active"),

  /** Luis's notes on this broker. Never shown in the portal. */
  notes: text("notes"),

  /**
   * The BROKER'S OWN consent to be contacted — never a borrower's.
   *
   * Captured once, on their first submission, and not asked again. The version
   * records which exact wording they saw (lib/consent.ts), so an older record
   * stays attributable to the language in force at the time.
   *
   * Consent flows inbound only: a STOP to Quo or an unsubscribe is
   * authoritative, and nothing in the CRM may re-grant what a broker revoked.
   */
  smsConsentAt: timestamp("sms_consent_at", { withTimezone: true }),
  smsConsentVersion: text("sms_consent_version"),

  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  /**
   * One row per Clerk user, enforced by the database rather than by the code
   * that upserts it. Two rows for one person would mean two different answers
   * to "what may they see", and whichever query ran first would win.
   */
  clerkIdx: uniqueIndex("broker_users_clerk_user_id_key").on(t.clerkUserId),
  firmIdx: index("broker_users_firm_idx").on(t.firmId),
  emailIdx: index("broker_users_email_idx").on(t.email),
}));

/* ---------------------------------------------------------- broker_invites */

/**
 * Who is allowed into the broker portal, decided before they arrive.
 *
 * TWO REASONS THIS TABLE EXISTS.
 *
 * The first is a lock. `app/sign-up` says "Invitation only" on the page, but
 * the route is public in proxy.ts and the application enforces nothing — whether
 * a stranger can register depends on a "restricted mode" toggle in the Clerk
 * dashboard. That toggle may be on. The problem is that nobody can tell by
 * reading this repository, the control lives outside version control, and one
 * wrong click in a settings page opens the door with no trace. Clerk stays the
 * outer lock; this is the inner one.
 *
 * The second is better. An invite CARRIES THE FIRM AND ROLE, so a broker lands
 * already assigned and already able to see their colleagues' deals. Before this,
 * every new broker sat in an unassigned queue waiting for Luis to notice. That
 * queue is now the exception — someone who arrived another way — rather than the
 * normal path.
 *
 * ONE INVITE PER ADDRESS. Re-inviting updates the existing row rather than
 * stacking duplicates, so "is this person invited" always has one answer.
 */
export const brokerInvites = pgTable("broker_invites", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** Lowercased at write time. The only thing an invite is ever matched on. */
  email: text("email").notNull(),

  /**
   * Where they land. Null is legitimate and means "decide when they arrive" —
   * they come in unassigned, exactly as before this table existed.
   *
   * `set null` on delete rather than cascade: deleting a firm must not silently
   * delete the record that someone was invited.
   */
  firmId: uuid("firm_id").references(() => brokerFirms.id, { onDelete: "set null" }),
  role: brokerRoleEnum("role").notNull().default("member"),

  /** Luis's note on why. Never shown to the broker. */
  note: text("note"),

  /** Clerk id of the staff member who issued it. Audit, not decoration. */
  invitedBy: text("invited_by"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),

  /**
   * Stamped when the invite is consumed, together with WHICH Clerk account
   * consumed it — so an invite is single-use and a forwarded link cannot be
   * replayed by a second person.
   */
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByUserId: text("accepted_by_user_id"),

  /**
   * Revoking blocks a FUTURE sign-in. It does not remove access from someone
   * who already accepted — by then a broker_users row exists and suspending
   * that row is the control that cuts them off. The screen has to say so.
   */
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  /** One invite per address, enforced by the database, not by the caller. */
  emailKey: uniqueIndex("broker_invites_email_key").on(t.email),
  firmIdx: index("broker_invites_firm_idx").on(t.firmId),
}));


/* ------------------------------------------------- application_properties */

/**
 * The properties on one application, in order.
 *
 * `applications.propertyId` stays as the SUBJECT property — the one the grid
 * shows and every existing query already joins on. This table is what lets a
 * portfolio carry the other nine without breaking any of that: a single-property
 * deal has one row here and the same id on the application, so the two never
 * disagree.
 *
 * Shaped like `participants` on purpose. That is the established way this schema
 * attaches many things to an application, and a second pattern for the same idea
 * is how a model stops being understandable.
 */
export const applicationProperties = pgTable("application_properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  /** 0-based, as the broker entered them. Order is meaningful on a schedule. */
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("application_properties_app_property_key").on(t.applicationId, t.propertyId),
  appIdx: index("application_properties_application_idx").on(t.applicationId),
}));

/* -------------------------------------------------------- content_requests */

/**
 * A request for a blog post, a LinkedIn post or an email — and what became of it.
 *
 * THE PORTAL ASKS; IT DOES NOT PUBLISH. A row lands here and something picks it
 * up and writes back where the draft is. For LinkedIn and email that is a
 * scheduled Claude task. For the blog, since 25 Sep 2026, it is the site's own
 * cron (app/api/cron/daily-blog), which talks to this table only through
 * /api/crm/content-queue. See CLAUDE.md, "The daily blog is a Vercel cron".
 *
 * `draft_url` points at the Gmail draft, the Klaviyo template or the MDX file;
 * `draft_summary` is one line for the list.
 *
 * ONE EXCEPTION, AND IT IS A PIPE, NOT A VAULT: `draft_body` (migration 0008).
 * A blog draft is an MDX file, and until 24 Sep 2026 the task delivered it by
 * writing onto Luis's laptop — so a sleeping laptop at 7am meant no post. The
 * draft now travels through here instead: the task posts it with the `drafted`
 * transition, `scripts/pull-drafts.mjs` writes it into content/blog when Luis
 * runs it, and from then on the MDX file is the only copy anyone edits. The
 * column is a transit copy of marketing copy, validated by lib/marketing/draft.ts
 * before it lands. Nothing about a borrower ever goes here; LinkedIn and email
 * drafts still live in Gmail and Klaviyo.
 */
export const contentRequests = pgTable("content_requests", {
  id: uuid("id").primaryKey().defaultRandom(),

  channel: contentChannelEnum("channel").notNull(),
  /** What Luis typed. Verbatim — it is the brief, not a label. */
  topic: text("topic").notNull(),
  notes: text("notes"),

  status: contentStatusEnum("status").notNull().default("requested"),

  requestedBy: text("requested_by"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),

  /** Set when a task takes the job, so two tasks cannot both work one request. */
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedBy: text("claimed_by"),

  draftedAt: timestamp("drafted_at", { withTimezone: true }),
  draftUrl: text("draft_url"),
  draftSummary: text("draft_summary"),
  /** Blog only: the full MDX, in transit to content/blog. See the note above. */
  draftBody: text("draft_body"),
  /**
   * The WORDS of the LinkedIn carousel that goes with a blog post — never
   * images. The site draws the slides from this on request
   * (app/api/crm/carousel/[id]), so a better design reaches every carousel on
   * the next push. Validated by lib/marketing/carousel.ts before it is stored.
   */
  carouselSpec: jsonb("carousel_spec").$type<unknown>(),
  carouselAt: timestamp("carousel_at", { withTimezone: true }),
  /**
   * The LinkedIn caption that goes with a blog post (migration 0012, 25 Sep
   * 2026). The daily blog now runs as a Vercel cron and cannot leave a Gmail
   * draft, so the caption waits here, shown on /crm/marketing to copy.
   * Marketing copy only.
   */
  linkedinCaption: text("linkedin_caption"),

  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedUrl: text("published_url"),

  /** Why it failed, in words a non-developer can act on. */
  error: text("error"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("content_requests_status_idx").on(t.status),
  channelIdx: index("content_requests_channel_idx").on(t.channel),
  requestedIdx: index("content_requests_requested_at_idx").on(t.requestedAt),
  /** The cadence indicator reads this one on every page load. */
  publishedIdx: index("content_requests_published_at_idx").on(t.publishedAt),
}));

/* ------------------------------------------------------- outbound_messages */

/**
 * The transactional outbox for texts the CRM sends through Quo. Migration 0011.
 *
 * EVERY ATTEMPT IS A ROW, INCLUDING THE ONES THAT NEVER LEFT. A text the
 * consent gate refused is written as `blocked` with the reason, so "why didn't
 * this person get a text?" has an answer on file. The gate itself is
 * `canText()` in lib/comms/consent.ts, called by the EXECUTOR
 * (lib/comms/outbox.server.ts) on every send and every retry — never only by
 * the screen, which is a convenience and can be bypassed with a crafted POST.
 *
 * `idempotency_key` is generated in the browser once per compose, so a
 * double-click or a network retry of the same Send cannot text anyone twice:
 * the second insert collides on the unique index and does nothing.
 *
 * `consent_version` and `consent_at` record WHICH consent the send relied on,
 * copied from the contact at the moment of sending. If the wording is later
 * bumped, this row still shows what the person had agreed to when they were
 * texted — the TCPA question that matters.
 *
 * Status:
 *   queued       written, no attempt yet (a function that died before trying)
 *   sending      handed to Quo, no answer yet — OUTCOME UNKNOWN. Never retried
 *                automatically: Quo may have sent it. Quo's delivery webhook
 *                heals it to `delivered` if it went.
 *   sent         Quo accepted it (HTTP 202)
 *   delivered    Quo's `message.delivered` webhook confirmed it
 *   undelivered  the carrier refused it (new-format webhooks only)
 *   failed       Quo refused it; `error` says why in plain English
 *   blocked      the consent gate refused it; nothing was sent
 *
 * `status` is text with a CHECK rather than a pgEnum so a new state does not
 * need an enum migration, and so schema-sync has nothing to label.
 */
export const OUTBOUND_STATUSES = [
  "queued", "sending", "sent", "delivered", "undelivered", "failed", "blocked",
] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

export const outboundMessages = pgTable("outbound_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
  channel: text("channel").notNull().default("sms"),
  toPhone: text("to_phone"),
  fromPhone: text("from_phone"),
  body: text("body").notNull(),
  status: text("status").$type<OutboundStatus>().notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  /** Why it failed or was blocked, in words Luis can act on. */
  error: text("error"),
  consentVersion: text("consent_version"),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  /** Clerk user id of whoever pressed Send. */
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (t) => ({
  channelCheck: check("outbound_messages_channel_check", sql`${t.channel} IN ('sms')`),
  statusCheck: check(
    "outbound_messages_status_check",
    sql`${t.status} IN ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'blocked')`,
  ),
  bodyLength: check("outbound_messages_body_length_check", sql`char_length(${t.body}) BETWEEN 1 AND 1000`),
  idemKey: uniqueIndex("outbound_messages_idempotency_key").on(t.idempotencyKey),
  providerKey: uniqueIndex("outbound_messages_provider_message_id_key")
    .on(t.providerMessageId)
    .where(sql`${t.providerMessageId} IS NOT NULL`),
  contactIdx: index("outbound_messages_contact_idx").on(t.contactId),
  appIdx: index("outbound_messages_application_idx").on(t.applicationId),
  openIdx: index("outbound_messages_open_status_idx")
    .on(t.status)
    .where(sql`${t.status} IN ('queued', 'sending', 'failed')`),
}));

export type OutboundMessage = typeof outboundMessages.$inferSelect;

/* ---------------------------------------------------------- webhook_events */

/**
 * Every signed webhook delivery we accepted, claimed by the provider's OWN
 * event id. Migration 0011.
 *
 * `INSERT … ON CONFLICT (provider, event_id) DO NOTHING RETURNING id` is the
 * claim: an at-least-once provider retrying an event gets an empty RETURNING
 * and a 200, and nothing is written twice. Never a hash of the body — Quo
 * re-signs retries with a new timestamp, and a body hash would also make two
 * genuinely different events with identical content collide.
 *
 * `processed_at` is set in the same db.batch as the event's own writes. A row
 * with a null `processed_at` is an event that was claimed and then failed
 * part-way; the next retry reprocesses it (every write it makes is itself
 * idempotent) instead of being swallowed as a duplicate.
 *
 * `payload` keeps the event so an unmatched text or call — a number not in the
 * CRM yet — can be replayed onto the contact once they exist.
 */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  /** What processing did, in a few words: "logged text", "no contact for +1…". */
  outcome: text("outcome"),
  payload: jsonb("payload").$type<unknown>().notNull(),
}, (t) => ({
  providerEventKey: uniqueIndex("webhook_events_provider_event_key").on(t.provider, t.eventId),
  receivedIdx: index("webhook_events_received_at_idx").on(t.receivedAt),
}));

/* -------------------------------------------------------- mail_connections */

/**
 * A staff member's Gmail, connected once for sending from the record card.
 * Migration 0013.
 *
 * `refresh_token_enc` is the Google refresh token ENCRYPTED with
 * `GMAIL_TOKEN_KEY` (lib/comms/tokenCrypto.ts). The token is a standing key to
 * send mail as that person; stored in the clear, any database dump could send
 * email from their address. The key lives only in Vercel.
 *
 * One row per mailbox. `email` is the address Google confirmed at connect
 * time, and it must equal the Lending OS sign-in address — nobody can connect
 * someone else's mailbox, and nobody can send from someone else's.
 * `last_error` records a revoked or expired grant, so the card can say
 * "reconnect" instead of failing mysteriously.
 */
export const mailConnections = pgTable("mail_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("google"),
  email: text("email").notNull(),
  clerkUserId: text("clerk_user_id").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  scopes: text("scopes").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  lastError: text("last_error"),
}, (t) => ({
  providerCheck: check("mail_connections_provider_check", sql`${t.provider} IN ('google')`),
  providerEmailKey: uniqueIndex("mail_connections_provider_email_key").on(t.provider, sql`lower(${t.email})`),
}));

/* --------------------------------------------------------- outbound_emails */

/**
 * The outbox for email sent from the record card through Gmail. Migration 0013.
 *
 * Kept apart from `outbound_messages` (texts) on purpose: texting has consent
 * versions, delivery receipts and a retry window that email does not, and the
 * texting code reads that table as "texts". Two small tables are easier to
 * reason about than one table with two meanings.
 *
 * Same shape of guarantee as texting: a browser-minted idempotency key, UNIQUE,
 * so a double-click sends once; every attempt is a row, including the ones the
 * gate refused (`blocked`, with the reason). A `sending` row that never
 * finished is an outcome-unknown send — check Gmail's Sent folder before
 * sending again. The `email_out` activity is written only once Gmail accepts
 * the message, keyed `gmail:<message id>:<recipient>` — the same key the
 * Apps Script Gmail sync uses, so the sync finding it later adds nothing.
 */
export const OUTBOUND_EMAIL_STATUSES = ["sending", "sent", "failed", "blocked"] as const;
export type OutboundEmailStatus = (typeof OUTBOUND_EMAIL_STATUSES)[number];

export const outboundEmails = pgTable("outbound_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
  fromEmail: text("from_email").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  templateKey: text("template_key"),
  status: text("status").$type<OutboundEmailStatus>().notNull().default("sending"),
  providerMessageId: text("provider_message_id"),
  providerThreadId: text("provider_thread_id"),
  error: text("error"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => ({
  statusCheck: check("outbound_emails_status_check", sql`${t.status} IN ('sending', 'sent', 'failed', 'blocked')`),
  subjectLength: check("outbound_emails_subject_length_check", sql`char_length(${t.subject}) BETWEEN 1 AND 200`),
  bodyLength: check("outbound_emails_body_length_check", sql`char_length(${t.body}) BETWEEN 1 AND 20000`),
  idemKey: uniqueIndex("outbound_emails_idempotency_key").on(t.idempotencyKey),
  appIdx: index("outbound_emails_application_idx").on(t.applicationId),
  contactIdx: index("outbound_emails_contact_idx").on(t.contactId),
}));
