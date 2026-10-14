CREATE TABLE IF NOT EXISTS photo_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  original_path TEXT NOT NULL,
  original_url TEXT NOT NULL,
  suggestions JSONB,
  error_message TEXT,
  user_id UUID,
  caption TEXT NOT NULL DEFAULT ''
);
