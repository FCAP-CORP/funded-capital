ALTER TABLE "nurture_enrollments" DROP CONSTRAINT IF EXISTS "nurture_enrollments_program_check";
--> statement-breakpoint
ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_program_check" CHECK ("program" IN ('past_borrower', 'bp_no_term_sheet', 'quiet', 'lost', 'contacts'));
