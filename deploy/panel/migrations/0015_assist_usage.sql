-- NOT APPLIED. Needs the owner's yes. Cloudflare D1 `forgeai-web` (our web server's own small database),
-- NOT the gym server: no gym or member records are in it.
-- Apply ONCE with (from deploy/panel; this one file only, so no other waiting migration goes with it):
--   npx wrangler d1 execute forgeai-web --remote --file migrations/0015_assist_usage.sql
--
-- F201 (12 Nov 2026): the AI assistant for gym owners (assist.js). assist_usage counts the assistant's Claude calls
-- and tokens per India month: row 'YYYY-MM' = all gyms (for HQ), row 'YYYY-MM:trial' = trial and unpaid gyms, the only
-- ones with a money cap (TRIAL_CAP_USD in assist.js, $15 unless the secret ASSIST_TRIAL_CAP_USD says otherwise; owner
-- R-475: a paying gym is never stopped by a money cap), apart from help answers' $80 (help_usage, 0008).
-- Each gym's daily allowance uses the existing ai_usage table (0003): kind 'assist' (requests) and kind
-- 'assist-voice' (spoken seconds). Counts only: never the owner's words.
-- assist_limits: one gym's own fair-use allowance set by MettleUp HQ (R-467, 12 Nov 2026: normal is 50 requests
-- and 10 spoken minutes a day; 0 switches that part off for the gym). No row = the normal allowance.
-- Until this is applied the assistant answers "not switched on yet" and nothing is called.
CREATE TABLE IF NOT EXISTS assist_usage (
  month      TEXT PRIMARY KEY,           -- India month, YYYY-MM
  calls      INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS assist_limits (
  gym_id        TEXT PRIMARY KEY,
  per_day       INTEGER NOT NULL,        -- AI requests a day (asks and rewrites)
  voice_minutes INTEGER NOT NULL,        -- spoken minutes a day
  set_at        TEXT NOT NULL
);
