ALTER TABLE photo_jobs
ADD COLUMN IF NOT EXISTS generation_options JSONB NOT NULL DEFAULT '{}'::jsonb;
