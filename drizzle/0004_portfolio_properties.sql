CREATE TABLE "application_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "is_portfolio" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "property_count" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "annual_taxes" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "annual_insurance" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "annual_hoa" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "sunk_costs" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "estimated_payoff" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "application_properties" ADD CONSTRAINT "application_properties_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_properties" ADD CONSTRAINT "application_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_properties_app_property_key" ON "application_properties" USING btree ("application_id","property_id");--> statement-breakpoint
CREATE INDEX "application_properties_application_idx" ON "application_properties" USING btree ("application_id");