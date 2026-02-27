CREATE TABLE IF NOT EXISTS workspace_files (
  teacher_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (teacher_id, path)
);

CREATE INDEX IF NOT EXISTS workspace_files_teacher_id_idx ON workspace_files(teacher_id);
