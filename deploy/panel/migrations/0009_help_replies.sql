-- APPLIED LIVE 9 Nov 2026 (owner: "yes, apply 0009"); recorded in d1_migrations. Cloudflare D1 `forgeai-web` (our web server's own small database),
-- NOT the gym server: no gym or member records are in it.
-- Apply with: npx wrangler d1 migrations apply forgeai-web --remote   (from deploy/panel)
--
-- R-319 item 10 (4 Nov 2026): the owner answers help questions from HQ, and the person who asked reads
-- the reply in their app's "Help and feedback" (with a pop-up on a phone that has one).
-- ADDITIVE only: new columns with defaults and one index. Older apps never send the new fields and
-- keep working; the Workers read '' for them. Until this is applied the Workers carry on as before
-- (help.js, hq web.js fall back to the old columns and log one line).
ALTER TABLE feedback ADD COLUMN covered   TEXT NOT NULL DEFAULT ''; -- help box only: 'yes' (the AI answered from the articles) | 'no' (the AI said the team will reply) | 'none' (no AI answer) | '' plain feedback
ALTER TABLE feedback ADD COLUMN reply     TEXT NOT NULL DEFAULT ''; -- the MettleUp team's reply, written in HQ
ALTER TABLE feedback ADD COLUMN reply_at  TEXT NOT NULL DEFAULT ''; -- ISO time of the reply
ALTER TABLE feedback ADD COLUMN reply_key TEXT NOT NULL DEFAULT ''; -- SHA-256 (hex) of a random secret the app made for this question; only that app can read the answer and the reply
ALTER TABLE feedback ADD COLUMN push_to   TEXT NOT NULL DEFAULT ''; -- the phone's push address, used once for "the team replied"; cleared when the reply is sent
CREATE INDEX IF NOT EXISTS feedback_sender ON feedback (sender, at);
