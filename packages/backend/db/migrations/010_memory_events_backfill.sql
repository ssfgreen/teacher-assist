CREATE TABLE IF NOT EXISTS memory_events (
  id BIGSERIAL PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  memory_file_id BIGINT REFERENCES memory_files(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  class_id TEXT,
  path TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_id UUID,
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_events_teacher ON memory_events (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_events_session ON memory_events (session_id);
