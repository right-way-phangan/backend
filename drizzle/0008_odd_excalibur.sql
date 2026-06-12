ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "deal_value" double precision;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "commission_value" double precision;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "dd_status" text;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "dd_date" text;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "dd_lawyer" text;