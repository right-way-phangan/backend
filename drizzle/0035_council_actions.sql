-- Действия совета под гейтом (follow-up, пост, трата, деплой, задача): proposed → done|rejected|failed.
-- Решение — из бота или из Великого Древа (POST /council-actions/:id/decide).
-- Аддитивно и идемпотентно: безопасно накатывать ДО деплоя кода.
CREATE TABLE IF NOT EXISTS "council_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"agent_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "council_actions_status_idx" ON "council_actions" USING btree ("status");
