ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS approval_mode TEXT;

UPDATE sessions
SET approval_mode = COALESCE(approval_mode, 'feedforward');

ALTER TABLE sessions
ALTER COLUMN approval_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_approval_mode_check'
  ) THEN
    ALTER TABLE sessions
    ADD CONSTRAINT sessions_approval_mode_check
    CHECK (approval_mode IN ('automation', 'feedforward'));
  END IF;
END
$$;
