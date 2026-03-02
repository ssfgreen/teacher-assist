CREATE TABLE IF NOT EXISTS memory_files (
  id BIGSERIAL PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id TEXT,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  UNIQUE (teacher_id, class_id, path)
);

CREATE INDEX IF NOT EXISTS idx_memory_files_teacher ON memory_files (teacher_id);
CREATE INDEX IF NOT EXISTS idx_memory_files_teacher_class ON memory_files (teacher_id, class_id);

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
