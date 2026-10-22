-- NOT APPLIED - needs owner yes (Project Tracker #47). Cloudflare D1 `forgeai-web` (our web server's
-- own small database), NOT the gym server: no gym or member data is in it.
-- Apply with: npx wrangler d1 migrations apply forgeai-web --remote   (from deploy/panel)
--
-- #47 AI import (23 Oct 2026): how many "Ask AI to match the columns" reads each gym used each India
-- day (aiMatch.js: 20 a gym a day, 1,000 for all gyms together), and the tokens they cost. Counts
-- only: nothing from the gym's file is stored. Rows older than 90 days can be deleted.
CREATE TABLE IF NOT EXISTS ai_usage (
  day        TEXT NOT NULL,              -- India date, YYYY-MM-DD
  gym_id     TEXT NOT NULL,              -- the gym server's gym id (from staff_me)
  kind       TEXT NOT NULL DEFAULT 'columns', -- 'columns' (spreadsheet matching); photos later
  calls      INTEGER NOT NULL DEFAULT 0, -- reads taken today (failed ones included)
  failed     INTEGER NOT NULL DEFAULT 0, -- reads where every AI failed
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  provider   TEXT NOT NULL DEFAULT '',   -- the last provider that answered: gemini | claude
  PRIMARY KEY (day, gym_id, kind)
);
CREATE INDEX IF NOT EXISTS ai_usage_day ON ai_usage (day);
