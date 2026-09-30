-- Revenue Share read mirror.
--
-- These tables are a CACHE of the FundedCapital_RevenueShare_Participant_Tracker
-- spreadsheet, never the source of truth. The sheet stays the system of record
-- and stays Luis's working surface; a sync job copies it here every few minutes
-- and the portal reads from here instead of calling Apps Script on every request.
--
-- Why: the Apps Script round trip is ~3 seconds of the Program Book's 3.2s load,
-- it timed out a capital-return write that had actually succeeded, and it carries
-- the read secret in a URL that lands in Google's request logs. None of those is
-- fixable in the portal — they are properties of the transport.
--
-- Because this is a cache, it is always safe to truncate and re-sync, and the
-- portal keeps its Apps Script path as a fallback.
--
-- PREFIX: rs_ keeps participant data visibly separate from the Lending OS tables.
-- The two have different compliance boundaries and must not be joined casually.

CREATE TABLE IF NOT EXISTS "rs_participations" (
	"participation_id" text PRIMARY KEY NOT NULL,
	"full_name" text,
	"entity_name" text,
	"email" text NOT NULL,
	"program_version" text,
	"tier" text,
	"capital_contributed" numeric(14, 2),
	"designated_loan_size" numeric(14, 2),
	"monthly_revenue_share" numeric(14, 2),
	"loan_reference" text,
	"property" text,
	"funding_date" text,
	"term_months" integer,
	"maturity_date" text,
	"first_payment_due" text,
	"payment_method" text,
	"status" text,
	"lock_up_ends" text,
	"payments_logged" integer,
	"total_paid_to_date" numeric(14, 2),
	"days_to_maturity" integer,
	"documents_folder" text,
	"payoff_date" text,
	"capital_return_due" text,
	"capital_returned" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- Dates are TEXT in YYYY-MM-DD, deliberately, not DATE.
	-- The portal's whole date layer parses ISO strings directly and never
	-- constructs a Date, because doing so shifted a payment due date by a day
	-- and flipped eleven participations to PAYMENT BEHIND. Storing these as
	-- text keeps that discipline end to end.
	CONSTRAINT "rs_participations_funding_date_iso" CHECK ("funding_date" IS NULL OR "funding_date" = '' OR "funding_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "rs_participations_maturity_date_iso" CHECK ("maturity_date" IS NULL OR "maturity_date" = '' OR "maturity_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "rs_participations_payoff_date_iso" CHECK ("payoff_date" IS NULL OR "payoff_date" = '' OR "payoff_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "rs_participations_capital_returned_iso" CHECK ("capital_returned" IS NULL OR "capital_returned" = '' OR "capital_returned" ~ '^\d{4}-\d{2}-\d{2}$')
);
--> statement-breakpoint
-- The participant lookup. Email is stored already lowercased by the sync; the
-- portal resolves a holder from the Clerk session email and nothing else.
CREATE INDEX IF NOT EXISTS "rs_participations_email_idx" ON "rs_participations" USING btree ("email");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rs_schedule" (
	"participation_id" text NOT NULL,
	"payment_number" integer NOT NULL,
	"due_date" text,
	"scheduled_amount" numeric(14, 2),
	"status" text,
	"date_paid" text,
	"amount_paid" numeric(14, 2),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rs_schedule_pk" PRIMARY KEY ("participation_id", "payment_number"),
	CONSTRAINT "rs_schedule_due_date_iso" CHECK ("due_date" IS NULL OR "due_date" = '' OR "due_date" ~ '^\d{4}-\d{2}-\d{2}$')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rs_schedule_due_idx" ON "rs_schedule" USING btree ("due_date");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rs_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participation_id" text NOT NULL,
	"date_sent" text,
	"payment_period" text,
	"amount_sent" numeric(14, 2),
	"method" text,
	"confirmation_ref" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- A payment log row has no id of its own in the sheet, so its identity is the
-- tuple. This is what lets the sync upsert rather than delete-and-reinsert —
-- the neon-http driver has no transactions, so a delete-then-insert would leave
-- a window where a participant's history is empty.
CREATE UNIQUE INDEX IF NOT EXISTS "rs_payments_natural_uq" ON "rs_payments"
	USING btree ("participation_id", "payment_period", "date_sent", "amount_sent");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rs_payments_participation_idx" ON "rs_payments" USING btree ("participation_id");
--> statement-breakpoint

-- Every sync attempt, successful or not.
--
-- Without this a failed refresh is silent and the portal serves yesterday's
-- figures looking exactly as confident as today's. The Program Book reads the
-- latest row and says how old the data is.
CREATE TABLE IF NOT EXISTS "rs_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"participation_count" integer,
	"schedule_count" integer,
	"payment_count" integer,
	"removed_count" integer,
	"duration_ms" integer,
	"error" text,
	CONSTRAINT "rs_sync_runs_status_check" CHECK ("status" IN ('running', 'ok', 'failed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rs_sync_runs_recent_idx" ON "rs_sync_runs" USING btree ("started_at" DESC);
--> statement-breakpoint

-- Which participation a rolled-over one became.
--
-- Kizzy's FC-015 rolled into FC-016 on 14 September: the capital never left, it
-- was redeployed. Nothing in the tracker records that, so all-time capital
-- raised counts the same $20,000 twice and the two rows are related only in
-- Luis's head. Kept out of rs_participations because the sync overwrites that
-- table wholesale and this fact does not come from the sheet.
CREATE TABLE IF NOT EXISTS "rs_rollovers" (
	"from_participation_id" text PRIMARY KEY NOT NULL,
	"to_participation_id" text NOT NULL,
	"rolled_on" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rs_rollovers_not_self" CHECK ("from_participation_id" <> "to_participation_id"),
	CONSTRAINT "rs_rollovers_rolled_on_iso" CHECK ("rolled_on" IS NULL OR "rolled_on" ~ '^\d{4}-\d{2}-\d{2}$')
);
