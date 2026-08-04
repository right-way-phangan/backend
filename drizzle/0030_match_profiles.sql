-- RW Match — сохранённые профили подбора + алерты «новые совпадения».
-- Применять ВРУЧНУЮ и ДО деплоя кода (правило backend-миграций).
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
DO $$ BEGIN
 ALTER TABLE "match_profiles" ADD CONSTRAINT "match_profiles_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_profiles" ADD CONSTRAINT "match_profiles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_profiles_active_idx" ON "match_profiles" ("active");
