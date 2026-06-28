CREATE TABLE "visitor_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"vid" text NOT NULL,
	"kind" text NOT NULL,
	"rw_number" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "vid" text;--> statement-breakpoint
CREATE INDEX "visitor_events_vid_idx" ON "visitor_events" USING btree ("vid");