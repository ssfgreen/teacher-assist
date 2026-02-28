ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS provider TEXT,
ADD COLUMN IF NOT EXISTS model TEXT;

UPDATE sessions
SET provider = COALESCE(provider, 'openai'),
    model = COALESCE(model, 'mock-openai');

ALTER TABLE sessions
ALTER COLUMN provider SET NOT NULL,
ALTER COLUMN model SET NOT NULL;

ALTER TABLE sessions
ADD CONSTRAINT sessions_provider_check
CHECK (provider IN ('openai', 'anthropic'));

CREATE INDEX IF NOT EXISTS sessions_teacher_updated_idx
ON sessions(teacher_id, updated_at DESC);
