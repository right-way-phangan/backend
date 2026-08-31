-- Синхронизация снапшота drizzle со схемой.
-- Миграции 0027_needs_review…0030_match_profiles применялись к Neon ВРУЧНУЮ и
-- не были внесены в журнал, поэтому meta/0027_snapshot.json их не знал: любой
-- следующий `drizzle-kit generate` выдавал этот же DDL повторно и валил
-- migrate() ошибкой «already exists». Файл приводит снапшот в соответствие со
-- схемой; каждая операция идемпотентна, поэтому безопасен и на проде, и на
-- чистой БД, поднятой из репозитория.

CREATE TABLE IF NOT EXISTS "match_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"contact_id" integer,
	"profile" jsonb NOT NULL,
	"lang" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "lease_registered" boolean;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "construction_updates" jsonb;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "needs_review" boolean DEFAULT false;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_profiles" ADD CONSTRAINT "match_profiles_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_profiles" ADD CONSTRAINT "match_profiles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_profiles_active_idx" ON "match_profiles" USING btree ("active");