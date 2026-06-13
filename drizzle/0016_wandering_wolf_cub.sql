CREATE TABLE IF NOT EXISTS "object_events_daily" (
	"rw_number" text NOT NULL,
	"kind" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "object_events_daily_rw_number_kind_day_pk" PRIMARY KEY("rw_number","kind","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "object_view_visitors" (
	"rw_number" text NOT NULL,
	"vid" text NOT NULL,
	"day" text NOT NULL,
	CONSTRAINT "object_view_visitors_rw_number_vid_day_pk" PRIMARY KEY("rw_number","vid","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referrals_daily" (
	"source" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "referrals_daily_source_day_pk" PRIMARY KEY("source","day")
);
