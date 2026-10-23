-- NOT APPLIED - main session applies after review (owner said yes, #51). Cloudflare D1 `forgeai-web`,
-- NOT the gym server. Apply with: npx wrangler d1 migrations apply forgeai-web --remote (deploy/panel).
--
-- ForgeAI HQ step 2 (#51): one gym's own daily limit for "Ask AI to match the columns", set from HQ.
-- No row = the normal limit (aiMatch.js PER_GYM_PER_DAY). 0 switches AI matching off for that gym.
CREATE TABLE IF NOT EXISTS ai_limits (
  gym_id  TEXT PRIMARY KEY,           -- the gym server's gym id
  per_day INTEGER NOT NULL CHECK (per_day BETWEEN 0 AND 200),
  set_at  TEXT NOT NULL DEFAULT ''    -- ISO time HQ set it (who: HQ's audit log in Supabase)
);
