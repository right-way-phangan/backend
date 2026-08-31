-- Флаг «требует вычитки». Применялся к Neon вручную ДО деплоя кода
-- (правило backend-миграций); IF NOT EXISTS делает повтор безопасным.
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "needs_review" boolean DEFAULT false;
