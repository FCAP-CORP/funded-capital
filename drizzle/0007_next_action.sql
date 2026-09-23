ALTER TABLE "applications" ADD COLUMN "next_action_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "next_action_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "next_action_note" text;--> statement-breakpoint
CREATE INDEX "applications_next_action_at_idx" ON "applications" USING btree ("next_action_at") WHERE "next_action_at" IS NOT NULL;
