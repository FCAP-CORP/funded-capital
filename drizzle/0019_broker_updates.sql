ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "broker_updates_off" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "nurture_control" ADD COLUMN IF NOT EXISTS "unsubs_synced_until" timestamp with time zone;
