CREATE TABLE IF NOT EXISTS "document_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"hint" text,
	"note" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"review_note" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by" text,
	"received_at" timestamp with time zone,
	"received_file_count" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_requests_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE cascade,
	CONSTRAINT "document_requests_status_check" CHECK ("status" IN ('requested', 'received', 'accepted', 'waived', 'removed')),
	CONSTRAINT "document_requests_label_check" CHECK (char_length("label") BETWEEN 2 AND 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_requests_app_item_uq" ON "document_requests" USING btree ("application_id", "item_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_requests_open_idx" ON "document_requests" USING btree ("application_id") WHERE "status" = 'requested';
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "request_id" uuid REFERENCES "document_requests"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_request_idx" ON "documents" USING btree ("request_id");
