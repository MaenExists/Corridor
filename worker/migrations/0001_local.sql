CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, source_ref TEXT NOT NULL UNIQUE,
  event_date TEXT, publication_date TEXT NOT NULL, first_seen_at TEXT NOT NULL, district TEXT NOT NULL,
  title_hash TEXT NOT NULL, duplicate_of TEXT REFERENCES review_items(id),
  status TEXT NOT NULL CHECK(status IN ('new','possible_duplicate','verified','rejected')),
  verified_at TEXT, reviewer_role TEXT
);
CREATE TABLE IF NOT EXISTS cues (
  id TEXT PRIMARY KEY, review_item_id TEXT NOT NULL UNIQUE REFERENCES review_items(id),
  district TEXT NOT NULL, event_date TEXT NOT NULL, verified_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, district TEXT NOT NULL, category TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('new','reviewed','closed'))
);
CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY, district TEXT NOT NULL, horizon_days INTEGER NOT NULL CHECK(horizon_days IN (7,28)),
  assessment TEXT NOT NULL, next_step TEXT NOT NULL, updated_at TEXT NOT NULL, role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_history (
  id TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, state TEXT NOT NULL,
  reviewer_role TEXT NOT NULL, recorded_at TEXT NOT NULL
);
