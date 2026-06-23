CREATE TABLE "social_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"pair_id" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"channel" text DEFAULT 'telegram' NOT NULL,
	"topic" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewer_note" text,
	"created_by" text DEFAULT 'germes' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "social_posts_status_idx" ON "social_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "social_posts_pair_idx" ON "social_posts" USING btree ("pair_id");