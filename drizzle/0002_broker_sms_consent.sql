ALTER TABLE "broker_users" ADD COLUMN "sms_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "broker_users" ADD COLUMN "sms_consent_version" text;