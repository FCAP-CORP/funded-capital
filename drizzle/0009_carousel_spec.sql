ALTER TABLE "content_requests" ADD COLUMN "carousel_spec" jsonb;
--> statement-breakpoint
ALTER TABLE "content_requests" ADD COLUMN "carousel_at" timestamp with time zone;
