-- Журнал хода стройки. Применялся к Neon вручную ДО деплоя кода
-- (правило backend-миграций); IF NOT EXISTS делает повтор безопасным.
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "construction_updates" jsonb;
