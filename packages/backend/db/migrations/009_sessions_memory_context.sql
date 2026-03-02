ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS memory_context_history JSONB NOT NULL DEFAULT '[]'::jsonb;
