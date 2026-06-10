ALTER TABLE "contacts" ADD COLUMN "amo_contact_id" bigint;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "amo_lead_id" bigint;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_amo_contact_id_unique" UNIQUE("amo_contact_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_amo_lead_id_unique" UNIQUE("amo_lead_id");