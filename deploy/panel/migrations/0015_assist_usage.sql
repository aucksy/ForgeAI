-- NOT APPLIED. Needs the owner's yes. Cloudflare D1 `forgeai-web` (our web server's own small database),
-- NOT the gym server: no gym or member records are in it.
-- Apply ONCE with (from deploy/panel; this one file only, so no other waiting migration goes with it):
--   npx wrangler d1 execute forgeai-web --remote --file migrations/0015_assist_usage.sql
--
-- F201 (12 Nov 2026): the AI assistant for gym owners (assist.js). assist_usage counts the assistant's Claude calls
-- and tokens per India month, for its own monthly money cap (MONTHLY_CAP_USD in assist.js, $15 unless the var
-- ASSIST_MONTHLY_CAP_USD says otherwise), apart from help answers' $80 (help_usage, 0008).
-- Each gym's daily allowance uses the existing ai_usage table (0003): kind 'assist' (requests) and kind
-- 'assist-voice' (spoken seconds). Counts only: never the owner's words.
-- Until this is applied the assistant answers "not switched on yet" and nothing is called.
CREATE TABLE IF NOT EXISTS assist_usage (
  month      TEXT PRIMARY KEY,           -- India month, YYYY-MM
  calls      INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0
);
