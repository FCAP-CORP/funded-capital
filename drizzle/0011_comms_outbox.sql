CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"contact_id" uuid,
	"application_id" uuid,
	"channel" text DEFAULT 'sms' NOT NULL,
	"to_phone" text,
	"from_phone" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"consent_version" text,
	"consent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "outbound_messages_channel_check" CHECK ("channel" IN ('sms')),
	CONSTRAINT "outbound_messages_status_check" CHECK ("status" IN ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'blocked')),
	CONSTRAINT "outbound_messages_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_messages_idempotency_key" ON "outbound_messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_messages_provider_message_id_key" ON "outbound_messages" USING btree ("provider_message_id") WHERE "provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "outbound_messages_contact_idx" ON "outbound_messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "outbound_messages_application_idx" ON "outbound_messages" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "outbound_messages_open_status_idx" ON "outbound_messages" USING btree ("status") WHERE "status" IN ('queued', 'sending', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_key" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events" USING btree ("received_at");
