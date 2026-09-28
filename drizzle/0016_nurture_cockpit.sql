ALTER TABLE "nurture_enrollments" DROP CONSTRAINT IF EXISTS "nurture_enrollments_sync_state_check";
--> statement-breakpoint
ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_sync_state_check" CHECK ("sync_state" IN ('queued', 'pending_add', 'added', 'pending_remove', 'removed'));
--> statement-breakpoint
ALTER TABLE "nurture_enrollments" ADD COLUMN IF NOT EXISTS "released_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nurture_enrollments_queued_idx" ON "nurture_enrollments" USING btree ("program", "enrolled_at") WHERE "sync_state" = 'queued';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nurture_enrollments_released_idx" ON "nurture_enrollments" USING btree ("released_at") WHERE "released_at" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nurture_enrollments_profile_idx" ON "nurture_enrollments" USING btree ("klaviyo_profile_id") WHERE "klaviyo_profile_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nurture_programs" (
	"program" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'review' NOT NULL,
	"flow_status" text,
	"flow_checked_at" timestamp with time zone,
	"flow_error" text,
	"flow_snapshot" jsonb,
	"previews_rendered_at" timestamp with time zone,
	"last_auto_enroll_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "nurture_programs_program_check" CHECK ("program" IN ('past_borrower', 'bp_no_term_sheet', 'quiet', 'lost', 'contacts')),
	CONSTRAINT "nurture_programs_mode_check" CHECK ("mode" IN ('review', 'auto'))
);
--> statement-breakpoint
INSERT INTO "nurture_programs" ("program", "mode") VALUES
	('past_borrower', 'auto'),
	('bp_no_term_sheet', 'auto'),
	('quiet', 'auto'),
	('lost', 'auto'),
	('contacts', 'review')
ON CONFLICT ("program") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nurture_control" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_reason" text,
	"paused_at" timestamp with time zone,
	"paused_by" text,
	"health_since" timestamp with time zone,
	"events_synced_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nurture_control_single_row_check" CHECK ("id" = 1)
);
--> statement-breakpoint
INSERT INTO "nurture_control" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nurture_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"klaviyo_event_id" text NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"program" text NOT NULL,
	"kind" text NOT NULL,
	"flow_message_id" text,
	"subject" text,
	"url" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nurture_events_kind_check" CHECK ("kind" IN ('sent', 'open', 'click', 'bounce', 'spam', 'unsub'))
);
--> statement-breakpoint
ALTER TABLE "nurture_events" ADD CONSTRAINT "nurture_events_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."nurture_enrollments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "nurture_events" ADD CONSTRAINT "nurture_events_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nurture_events_klaviyo_event_key" ON "nurture_events" USING btree ("klaviyo_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nurture_events_kind_time_idx" ON "nurture_events" USING btree ("kind", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nurture_events_enrollment_idx" ON "nurture_events" USING btree ("enrollment_id", "occurred_at");
