CREATE TYPE "public"."activity_kind" AS ENUM('email_in', 'email_out', 'call', 'sms_in', 'sms_out', 'note', 'field_change', 'stage_change', 'automation', 'form_submission');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('website', 'biggerpockets', 'referral', 'broker', 'linkedin', 'cold_email', 'reia', 'wholesale', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('borrower', 'co_borrower', 'guarantor', 'ubo', 'broker');--> statement-breakpoint
CREATE TYPE "public"."product" AS ENUM('fix_and_flip', 'ground_up', 'dscr', 'bridge', 'multifamily', 'multiple', 'not_our_product', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('lead', 'qualified', 'term_sheet_issued', 'term_sheet_signed', 'application_in', 'underwriting', 'conditional_approval', 'conditions_clearing', 'clear_to_close', 'docs_out', 'funded', 'active', 'draw_cycle', 'payoff', 'extension', 'closed_lost');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"application_id" uuid,
	"kind" "activity_kind" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text,
	"subject" text,
	"body" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"dedup_key" text
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" "stage" DEFAULT 'lead' NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product" "product" DEFAULT 'unknown' NOT NULL,
	"lead_source" "lead_source" DEFAULT 'unknown' NOT NULL,
	"channel" text,
	"owner_name" text,
	"entity_id" uuid,
	"property_id" uuid,
	"requested_amount" numeric(14, 2),
	"down_payment" numeric(14, 2),
	"ltc" numeric(6, 4),
	"ltarv" numeric(6, 4),
	"ltv" numeric(6, 4),
	"binding_ratio" text,
	"exit_strategy" text,
	"timeline" text,
	"term_sheet_issued_at" timestamp with time zone,
	"term_sheet_signed_at" timestamp with time zone,
	"decisioned_at" timestamp with time zone,
	"funded_at" timestamp with time zone,
	"lost_reason" text,
	"borrower_message" text,
	"notes" text,
	"legacy_source" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"phone_raw" text,
	"lead_source" "lead_source" DEFAULT 'unknown' NOT NULL,
	"target_market" text,
	"state" text,
	"claimed_deals" integer,
	"verified_deals" integer,
	"verification_method" text,
	"credit_band" text,
	"email_subscribed" boolean,
	"sms_consent_at" timestamp with time zone,
	"sms_consent_version" text,
	"sms_opted_out" boolean DEFAULT false NOT NULL,
	"owner_name" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"legacy_contact_id" text,
	"external_ids" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid,
	"contact_id" uuid,
	"name" text NOT NULL,
	"doc_type" text,
	"drive_file_id" text,
	"drive_folder_id" text,
	"requested_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"expires_on" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_type" text,
	"formation_state" text,
	"primary_contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" "participant_role" DEFAULT 'borrower' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address_line1" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"property_type" text,
	"units" integer,
	"purchase_price" numeric(14, 2),
	"as_is_value" numeric(14, 2),
	"rehab_budget" numeric(14, 2),
	"arv" numeric(14, 2),
	"arv_source" text,
	"arv_as_of" timestamp with time zone,
	"arv_comp_reference" text,
	"arv_stressed" numeric(14, 2),
	"monthly_rent" numeric(12, 2),
	"lien_position" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_stage" "stage",
	"to_stage" "stage" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" text,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_contact_idx" ON "activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "activities_application_idx" ON "activities" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "activities_occurred_at_idx" ON "activities" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_dedup_key" ON "activities" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "applications_lead_source_idx" ON "applications" USING btree ("lead_source");--> statement-breakpoint
CREATE INDEX "applications_submitted_at_idx" ON "applications" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email_key" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contacts_phone_idx" ON "contacts" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_legacy_id_key" ON "contacts" USING btree ("legacy_contact_id");--> statement-breakpoint
CREATE INDEX "contacts_lead_source_idx" ON "contacts" USING btree ("lead_source");--> statement-breakpoint
CREATE INDEX "documents_application_idx" ON "documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "entities_primary_contact_idx" ON "entities" USING btree ("primary_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_app_contact_role_key" ON "participants" USING btree ("application_id","contact_id","role");--> statement-breakpoint
CREATE INDEX "participants_application_idx" ON "participants" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "participants_contact_idx" ON "participants" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "properties_state_idx" ON "properties" USING btree ("state");--> statement-breakpoint
CREATE INDEX "stage_transitions_application_idx" ON "stage_transitions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "stage_transitions_changed_at_idx" ON "stage_transitions" USING btree ("changed_at");