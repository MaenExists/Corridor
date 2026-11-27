-- Public tips on Cloudflare. Same record as the local tips.jsonl: no names, a 1 km square, a salted reporter key.
CREATE TABLE IF NOT EXISTS tips (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  reporter TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tips_day ON tips (day);
