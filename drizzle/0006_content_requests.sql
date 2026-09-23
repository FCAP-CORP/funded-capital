CREATE TYPE "content_channel" AS ENUM('blog', 'linkedin', 'email');--> statement-breakpoint
CREATE TYPE "content_status" AS ENUM('requested', 'in_progress', 'drafted', 'published', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "content_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "content_channel" NOT NULL,
	"topic" text NOT NULL,
	"notes" text,
	"status" "content_status" DEFAULT 'requested' NOT NULL,
	"requested_by" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"drafted_at" timestamp with time zone,
	"draft_url" text,
	"draft_summary" text,
	"published_at" timestamp with time zone,
	"published_url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_requests_status_idx" ON "content_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_requests_channel_idx" ON "content_requests" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "content_requests_requested_at_idx" ON "content_requests" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "content_requests_published_at_idx" ON "content_requests" USING btree ("published_at");
