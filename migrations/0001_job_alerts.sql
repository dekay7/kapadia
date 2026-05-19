CREATE TABLE IF NOT EXISTS subscribers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL COLLATE NOCASE,
  category      TEXT    NOT NULL CHECK(category IN ('cybersecurity', 'it')),
  listing_type  TEXT    NOT NULL CHECK(listing_type IN ('internship', 'newgrad')),
  verified      INTEGER NOT NULL DEFAULT 0,
  verify_token  TEXT    NOT NULL,
  unsub_token   TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  verified_at   INTEGER,
  UNIQUE(email, category, listing_type)
);

CREATE TABLE IF NOT EXISTS job_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     TEXT    NOT NULL,
  category      TEXT    NOT NULL CHECK(category IN ('cybersecurity', 'it')),
  listing_type  TEXT    NOT NULL CHECK(listing_type IN ('internship', 'newgrad')),
  company_name  TEXT    NOT NULL,
  company_url   TEXT,
  title         TEXT    NOT NULL,
  url           TEXT,
  date_posted   INTEGER,
  date_updated  INTEGER,
  active        INTEGER NOT NULL DEFAULT 1,
  is_visible    INTEGER NOT NULL DEFAULT 1,
  locations     TEXT,
  first_seen_at INTEGER NOT NULL,
  UNIQUE(source_id, category, listing_type)
);

CREATE INDEX IF NOT EXISTS idx_job_cache_segment
  ON job_cache(category, listing_type, active, is_visible);

CREATE TABLE IF NOT EXISTS digest_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  segment      TEXT    NOT NULL,
  sent_at      INTEGER NOT NULL,
  jobs_sent    INTEGER NOT NULL,
  sent_job_ids TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_digest_log_segment
  ON digest_log(segment, sent_at DESC);
