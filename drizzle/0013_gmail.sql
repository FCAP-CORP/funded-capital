CREATE TABLE "mail_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"email" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scopes" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "mail_connections_provider_check" CHECK ("provider" IN ('google'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_connections_provider_email_key" ON "mail_connections" USING btree ("provider", lower("email"));
--> statement-breakpoint
CREATE TABLE "outbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"contact_id" uuid,
	"application_id" uuid,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"template_key" text,
	"status" text DEFAULT 'sending' NOT NULL,
	"provider_message_id" text,
	"provider_thread_id" text,
	"error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "outbound_emails_status_check" CHECK ("status" IN ('sending', 'sent', 'failed', 'blocked')),
	CONSTRAINT "outbound_emails_subject_length_check" CHECK (char_length("subject") BETWEEN 1 AND 200),
	CONSTRAINT "outbound_emails_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 20000)
);
--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_emails_idempotency_key" ON "outbound_emails" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "outbound_emails_application_idx" ON "outbound_emails" USING btree ("application_id");
--> statement-breakpoint
CREATE INDEX "outbound_emails_contact_idx" ON "outbound_emails" USING btree ("contact_id");
