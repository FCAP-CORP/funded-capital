CREATE TABLE "broker_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"firm_id" uuid,
	"role" "broker_role" DEFAULT 'member' NOT NULL,
	"note" text,
	"invited_by" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broker_invites" ADD CONSTRAINT "broker_invites_firm_id_broker_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."broker_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broker_invites_email_key" ON "broker_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "broker_invites_firm_idx" ON "broker_invites" USING btree ("firm_id");
