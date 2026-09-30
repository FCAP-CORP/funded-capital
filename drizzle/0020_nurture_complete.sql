ALTER TABLE "nurture_enrollments" DROP CONSTRAINT IF EXISTS "nurture_enrollments_stop_reason_check";
--> statement-breakpoint
ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_stop_reason_check" CHECK ("stop_reason" IS NULL OR "stop_reason" IN ('replied', 'contacted', 'new_deal', 'deal_moved', 'unsubscribed', 'bounced', 'no_email', 'removed_in_klaviyo', 'stopped_by_staff', 'finished'));
--> statement-breakpoint
ALTER TABLE "nurture_control" ADD COLUMN IF NOT EXISTS "klaviyo_read_at" timestamp with time zone;
