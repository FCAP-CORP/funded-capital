CREATE TABLE IF NOT EXISTS "integration_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
INSERT INTO "integration_heartbeats" ("name", "last_seen_at", "detail") VALUES ('gmail_sync', now(), '{"seeded": 1}'::jsonb) ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
UPDATE "activities" SET "kind" = 'automation', "subject" = 'Automatic welcome email: ' || "subject", "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"auto": "welcome"}'::jsonb WHERE "source" = 'gmail' AND "kind" = 'email_out' AND "subject" ~ '^Your\s.{1,120}?\s[—–-]\s?Funded Capital$';
