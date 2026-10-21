-- Launch H7 (21 Oct 2026): "Send feedback" from both apps. Cloudflare D1 `forgeai-web`, not the gym
-- server. Rows older than 1 year are deleted by the sorting run (docs/launch/FEEDBACK.md).
CREATE TABLE IF NOT EXISTS feedback (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,              -- ISO time it arrived
  source    TEXT NOT NULL,              -- 'member' | 'admin'
  text      TEXT NOT NULL,
  app       TEXT NOT NULL DEFAULT '',   -- app version
  device    TEXT NOT NULL DEFAULT '',   -- phone model + Android, or the browser
  screen    TEXT NOT NULL DEFAULT '',
  gym       TEXT NOT NULL DEFAULT '',   -- 6-letter gym code, if any
  sender    TEXT NOT NULL DEFAULT '',   -- random id per install (no name, no number)
  ip_hash   TEXT NOT NULL DEFAULT '',   -- one-way hash, only for the 20-a-day limit
  status    TEXT NOT NULL DEFAULT 'new',-- new | bug | idea | question | praise | spam | done
  note      TEXT NOT NULL DEFAULT '',   -- Claude's sorting note (finding id, backlog row, reply)
  sorted_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS feedback_status ON feedback (status, at);
CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, at);
