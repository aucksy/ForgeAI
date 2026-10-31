-- R-243 (31 Oct 2026): messages from MettleUp HQ to every gym's admin app ("yes, build HQ messages").
-- HQ writes them (deploy/hq/web.js, the HQ page's Messages tab); the panel Worker hands them to the
-- admin app's notification bell (deploy/panel/hqNews.js, GET /api/hq-news). For every gym at once:
-- the text is the same for all, so no gym or member data is kept here.
-- ADDITIVE only: one new table. Until it is applied the bell shows only the app's own updates.
CREATE TABLE IF NOT EXISTS hq_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,              -- when HQ sent it (ISO)
  title      TEXT NOT NULL,              -- up to 80 letters
  body       TEXT NOT NULL,              -- up to 500 letters
  link       TEXT NOT NULL DEFAULT '',   -- '' | an admin app page ('/plans') | an https address
  label      TEXT NOT NULL DEFAULT '',   -- the link's button words, up to 30 letters
  removed_at TEXT                        -- HQ took it back: no longer shown
);
CREATE INDEX IF NOT EXISTS hq_messages_at ON hq_messages (at);
