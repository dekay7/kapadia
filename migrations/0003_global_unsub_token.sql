ALTER TABLE subscribers ADD COLUMN global_unsub_token TEXT;
CREATE INDEX IF NOT EXISTS idx_subscribers_global_unsub_token
  ON subscribers(global_unsub_token);
