ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS class_ref TEXT;

CREATE OR REPLACE FUNCTION session_messages_to_text(input_messages JSONB)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(string_agg(elem->>'content', ' '), '')
  FROM jsonb_array_elements(COALESCE(input_messages, '[]'::jsonb)) AS elem
  WHERE elem->>'role' IN ('user', 'assistant', 'tool');
$$;

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector('english', session_messages_to_text(messages))
) STORED;

CREATE INDEX IF NOT EXISTS idx_sessions_search_vector ON sessions USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_sessions_class_ref ON sessions (class_ref);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at DESC);
