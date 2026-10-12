-- Совет: кого позвал Зевс — [{id:"rw-…",status:"pending|working|done|error"}] (читает Великое Древо).
-- Аддитивно и идемпотентно: безопасно накатывать ДО деплоя кода.
ALTER TABLE "council_sessions" ADD COLUMN IF NOT EXISTS "agents" jsonb;
