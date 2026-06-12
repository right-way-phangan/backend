ALTER TABLE "articles" DROP CONSTRAINT "articles_slug_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "articles_slug_lang_unique" ON "articles" USING btree ("slug","lang");