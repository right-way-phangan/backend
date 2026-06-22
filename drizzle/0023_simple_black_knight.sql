ALTER TABLE "council_sessions" ALTER COLUMN "answer" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "council_sessions" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "council_sessions" ADD COLUMN "error_text" text;--> statement-breakpoint
ALTER TABLE "council_sessions" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "council_sessions_status_idx" ON "council_sessions" USING btree ("status");