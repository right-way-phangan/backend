-- Лиды ARQA: intent / idempotency / attribution / qualification, расширенный контакт, users.developer.
-- Аддитивно и идемпотентно: безопасно накатывать ДО деплоя кода (старый код колонок не трогает).
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "telegram" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "whatsapp" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "preferred_channel" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "intent" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "attribution" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualification" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "developer" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_idempotency_key_uq" ON "leads" USING btree ("idempotency_key") WHERE "leads"."idempotency_key" is not null;
