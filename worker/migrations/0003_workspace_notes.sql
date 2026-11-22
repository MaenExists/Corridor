CREATE TABLE IF NOT EXISTS workspace_notes (
  id TEXT PRIMARY KEY,
  district TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role = 'analyst')
);
