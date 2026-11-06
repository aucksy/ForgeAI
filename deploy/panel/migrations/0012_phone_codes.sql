-- NOT APPLIED. F187 sign-in codes by WhatsApp (R-383, 6 Nov 2026). Needs the owner's yes to switch on
-- (npx wrangler d1 execute forgeai-web --remote --file migrations/0012_phone_codes.sql; re-runnable).
-- phoneCode.js keeps here:
--   phone_codes      each 6-digit code: a salted one-way hash only (HMAC-SHA256 with the secret
--                    PHONE_CODE_SECRET), 10 minutes, 5 wrong tries, one use. Never the code, never the number
--                    (phone_key is a keyed hash of it).
--   phone_code_asks  each "send me a code": when, a keyed hash of the number and of the network address,
--                    and whether WhatsApp took a message (sent = 1, the paid ones). The limits per number,
--                    per address and the daily cap for everyone are counted from it.
-- Rows older than 2 days are deleted by the daily clean-up (worker.js scheduled). Times are milliseconds.
CREATE TABLE IF NOT EXISTS phone_codes (
  id          TEXT PRIMARY KEY,
  phone_key   TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  wrong_tries INTEGER NOT NULL DEFAULT 0,
  used_at     INTEGER,
  dead        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS phone_codes_phone ON phone_codes (phone_key, purpose, created_at);

CREATE TABLE IF NOT EXISTS phone_code_asks (
  at        INTEGER NOT NULL,
  phone_key TEXT NOT NULL,
  ip_key    TEXT NOT NULL,
  sent      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS phone_code_asks_phone ON phone_code_asks (phone_key, at);
CREATE INDEX IF NOT EXISTS phone_code_asks_ip ON phone_code_asks (ip_key, at);
CREATE INDEX IF NOT EXISTS phone_code_asks_sent ON phone_code_asks (sent, at);
