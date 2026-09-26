CREATE TABLE "nurture_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"program" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrolled_by" text,
	"stopped_at" timestamp with time zone,
	"stop_reason" text,
	"stopped_by" text,
	"klaviyo_list_id" text NOT NULL,
	"klaviyo_profile_id" text,
	"sync_state" text DEFAULT 'pending_add' NOT NULL,
	"sync_attempts" integer DEFAULT 0 NOT NULL,
	"sync_error" text,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_claimed_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nurture_enrollments_program_check" CHECK ("program" IN ('past_borrower', 'bp_no_term_sheet', 'quiet', 'lost')),
	CONSTRAINT "nurture_enrollments_status_check" CHECK ("status" IN ('active', 'stopped')),
	CONSTRAINT "nurture_enrollments_stop_reason_check" CHECK ("stop_reason" IS NULL OR "stop_reason" IN ('replied', 'contacted', 'new_deal', 'deal_moved', 'unsubscribed', 'bounced', 'no_email', 'removed_in_klaviyo', 'stopped_by_staff')),
	CONSTRAINT "nurture_enrollments_stopped_consistent_check" CHECK (("status" = 'active') = ("stopped_at" IS NULL)),
	CONSTRAINT "nurture_enrollments_sync_state_check" CHECK ("sync_state" IN ('pending_add', 'added', 'pending_remove', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "nurture_enrollments_contact_program_key" ON "nurture_enrollments" USING btree ("contact_id", "program");
--> statement-breakpoint
CREATE UNIQUE INDEX "nurture_enrollments_one_active_key" ON "nurture_enrollments" USING btree ("contact_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX "nurture_enrollments_sync_due_idx" ON "nurture_enrollments" USING btree ("next_sync_at") WHERE "sync_state" IN ('pending_add', 'pending_remove');
--> statement-breakpoint
CREATE INDEX "nurture_enrollments_program_status_idx" ON "nurture_enrollments" USING btree ("program", "status");
