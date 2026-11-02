-- NOT APPLIED - needs owner yes. Cloudflare D1 `forgeai-web` (our web server's own small database),
-- NOT the gym server: no gym or member records are in it.
-- Apply with: npx wrangler d1 migrations apply forgeai-web --remote   (from deploy/panel)
--
-- T22 step 1 (R-277, 2 Nov 2026): "Help and feedback" answers each message with Claude (help.js).
-- The answer is kept beside the message, with the person's "Did this solve it?" tap. Kept 1 year,
-- like the message. help_usage counts calls and tokens per India month, for the ₹500 monthly cap.
ALTER TABLE feedback ADD COLUMN answer TEXT NOT NULL DEFAULT '';   -- the AI's answer, '' if none
ALTER TABLE feedback ADD COLUMN helped TEXT NOT NULL DEFAULT '';   -- 'yes' | 'no' | '' (not tapped)
CREATE TABLE IF NOT EXISTS help_usage (
  month      TEXT PRIMARY KEY,           -- India month, YYYY-MM
  calls      INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0
);
