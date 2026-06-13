CREATE TABLE IF NOT EXISTS "search_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'filter' NOT NULL,
	"query" text,
	"matched" boolean,
	"types" text[],
	"districts" text[],
	"tenure" text[],
	"features" text[],
	"price_min_m" double precision,
	"price_max_m" double precision,
	"bedrooms_min" double precision,
	"result_count" integer,
	"locale" text,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "deal_checklist" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_events_created_idx" ON "search_events" USING btree ("created_at");