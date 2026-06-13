CREATE TABLE IF NOT EXISTS "valuation_comps" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'Land' NOT NULL,
	"district" text,
	"area_rai" double precision,
	"built_sqm" double precision,
	"bedrooms" double precision,
	"price_thb" double precision NOT NULL,
	"document_type" text,
	"sea_view" boolean DEFAULT false NOT NULL,
	"beachfront" boolean DEFAULT false NOT NULL,
	"electricity" boolean DEFAULT false NOT NULL,
	"road_type" text,
	"terrain" text,
	"zone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source_url" text,
	"note" text,
	"seen_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuation_factors" (
	"key" text PRIMARY KEY NOT NULL,
	"value" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuations" (
	"id" serial PRIMARY KEY NOT NULL,
	"rw_number" text,
	"subject" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"fair_value" double precision,
	"low_value" double precision,
	"high_value" double precision,
	"confidence" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "valuation_comps_district_idx" ON "valuation_comps" USING btree ("district");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "valuations_rw_idx" ON "valuations" USING btree ("rw_number");