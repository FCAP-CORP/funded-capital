CREATE TYPE "public"."broker_role" AS ENUM('owner', 'lead', 'member');--> statement-breakpoint
CREATE TYPE "public"."broker_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "broker_firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "broker_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"firm_id" uuid,
	"role" "broker_role" DEFAULT 'member' NOT NULL,
	"status" "broker_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "submitted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "broker_firm_id" uuid;--> statement-breakpoint
ALTER TABLE "broker_users" ADD CONSTRAINT "broker_users_firm_id_broker_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."broker_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broker_firms_name_idx" ON "broker_firms" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "broker_users_clerk_user_id_key" ON "broker_users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "broker_users_firm_idx" ON "broker_users" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "broker_users_email_idx" ON "broker_users" USING btree ("email");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_broker_firm_id_broker_firms_id_fk" FOREIGN KEY ("broker_firm_id") REFERENCES "public"."broker_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_submitted_by_idx" ON "applications" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "applications_broker_firm_idx" ON "applications" USING btree ("broker_firm_id");