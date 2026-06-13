CREATE TABLE IF NOT EXISTS "object_views_daily" (
	"rw_number" text NOT NULL,
	"day" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "object_views_daily_rw_number_day_pk" PRIMARY KEY("rw_number","day")
);
