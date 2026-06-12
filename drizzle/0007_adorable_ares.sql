CREATE TABLE IF NOT EXISTS "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"topic" text DEFAULT 'Guide' NOT NULL,
	"body_md" text NOT NULL,
	"takeaways" text[],
	"read_mins" integer,
	"cover_image" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_note" text,
	"created_by" text DEFAULT 'claude' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_status_idx" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_lang_status_idx" ON "articles" USING btree ("lang","status");