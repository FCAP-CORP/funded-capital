CREATE TABLE "crm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_on" date,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_tasks_title_length_check" CHECK (char_length("title") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_tasks_application_idx" ON "crm_tasks" USING btree ("application_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "crm_tasks_open_due_idx" ON "crm_tasks" USING btree ("due_on") WHERE "completed_at" IS NULL AND "deleted_at" IS NULL;
