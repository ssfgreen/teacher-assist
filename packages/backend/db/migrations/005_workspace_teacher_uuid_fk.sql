ALTER TABLE workspace_files
ALTER COLUMN teacher_id TYPE UUID USING teacher_id::uuid;

DELETE FROM workspace_files wf
WHERE NOT EXISTS (
  SELECT 1 FROM teachers t WHERE t.id = wf.teacher_id
);

ALTER TABLE workspace_files
ADD CONSTRAINT workspace_files_teacher_fk
FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS workspace_files_teacher_id_idx;
CREATE INDEX IF NOT EXISTS workspace_files_teacher_id_idx
ON workspace_files(teacher_id);
