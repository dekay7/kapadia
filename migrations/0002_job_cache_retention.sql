CREATE INDEX IF NOT EXISTS idx_job_cache_first_seen
  ON job_cache(first_seen_at);
