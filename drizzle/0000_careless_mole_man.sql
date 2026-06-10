CREATE TABLE IF NOT EXISTS "object_docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"object_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "object_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"object_id" integer NOT NULL,
	"url" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "objects" (
	"id" serial PRIMARY KEY NOT NULL,
	"rw_number" text NOT NULL,
	"amo_element_id" bigint,
	"circle_code" text,
	"title_en" text,
	"type" text DEFAULT 'Land' NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"district" text,
	"zone" text,
	"document_type" text,
	"tenure" text[],
	"area_rai" double precision,
	"area_sqm" double precision,
	"area_note" text,
	"altitude" double precision,
	"terrain" text,
	"price_thb" double precision,
	"price_per_rai" double precision,
	"rent_per_rai_month" double precision,
	"lease_term_years" double precision,
	"lease_esc_percent" double precision,
	"lease_esc_period_years" double precision,
	"lease_esc_notes" text,
	"lease_additional_terms" text,
	"bedrooms" double precision,
	"bathrooms" double precision,
	"build_year" integer,
	"condition" text,
	"pool" boolean DEFAULT false NOT NULL,
	"private_garden" boolean DEFAULT false NOT NULL,
	"parking" boolean DEFAULT false NOT NULL,
	"gated" boolean DEFAULT false NOT NULL,
	"sea_view" boolean DEFAULT false NOT NULL,
	"beachfront" boolean DEFAULT false NOT NULL,
	"mountain_view" boolean DEFAULT false NOT NULL,
	"jungle_view" boolean DEFAULT false NOT NULL,
	"flat_land" boolean DEFAULT false NOT NULL,
	"quiet" boolean DEFAULT false NOT NULL,
	"electricity" boolean DEFAULT false NOT NULL,
	"road_type" text,
	"water_type" text,
	"internet_type" text,
	"stage" text,
	"developer" text,
	"completion" text,
	"payment_terms" text,
	"furnishing" text,
	"net_yield_pct" double precision,
	"est_net_income_year" double precision,
	"lease_prepayment" double precision,
	"units_total" integer,
	"units_available" integer,
	"video_urls" text[],
	"floorplan_urls" text[],
	"price_stages" jsonb,
	"timeline" jsonb,
	"team" jsonb,
	"owner_name" text,
	"building_rules" text,
	"reason_for_selling" text,
	"time_on_market_months" double precision,
	"date_added" text,
	"drive_folder" text,
	"location_url" text,
	"lat" double precision,
	"lng" double precision,
	"site_url" text,
	"description_raw" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objects_rw_number_unique" UNIQUE("rw_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"object_id" integer NOT NULL,
	"unit_code" text NOT NULL,
	"status" text,
	"price_thb" double precision,
	"bedrooms" double precision,
	"area_sqm" double precision,
	"note" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "object_docs" ADD CONSTRAINT "object_docs_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "object_photos" ADD CONSTRAINT "object_photos_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_units" ADD CONSTRAINT "project_units_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "object_docs_object_idx" ON "object_docs" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "object_photos_object_idx" ON "object_photos" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "objects_status_type_idx" ON "objects" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "objects_district_idx" ON "objects" USING btree ("district");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_units_object_idx" ON "project_units" USING btree ("object_id");