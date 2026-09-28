ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "followup_stopped_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"broker_email" text,
	"broker_name" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"label" text,
	"step" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "application_drafts_status_check" CHECK ("status" IN ('open', 'submitted', 'discarded', 'expired')),
	CONSTRAINT "application_drafts_step_check" CHECK ("step" BETWEEN 1 AND 5),
	CONSTRAINT "application_drafts_size_check" CHECK (octet_length("data"::text) <= 60000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_drafts_owner_open_idx" ON "application_drafts" USING btree ("clerk_user_id", "updated_at") WHERE "status" = 'open';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_drafts_open_idx" ON "application_drafts" USING btree ("updated_at") WHERE "status" = 'open';
