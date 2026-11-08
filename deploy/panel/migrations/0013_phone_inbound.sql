-- NOT APPLIED. "Verify with WhatsApp" (8 Nov 2026): the person sends US a WhatsApp message with a code, so
-- nothing is sent by us (Meta blocks our sends with 131042). Needs the owner's yes to switch on
-- (npx wrangler d1 execute forgeai-web --remote --file migrations/0013_phone_inbound.sql; re-runnable).
-- Additive only: 0012 (phone_codes, phone_code_asks) stays as it is; the limits per number and per address
-- are still counted in phone_code_asks (sent stays 0: a message TO us costs nothing).
-- phoneInbound.js keeps here, per "Verify with WhatsApp" tap:
--   id_key      a keyed hash (HMAC-SHA256 with PHONE_CODE_SECRET) of the id only the panel holds
--   phone_key   a keyed hash of the typed number (the same key as phone_codes.phone_key); never the number
--   code_key    a keyed hash of the 6-digit code, to find the row when the message arrives; never the code
--   state       waiting | wrong_number (a message came from another number; still waiting) | verified | dead
--   wrong_msgs  messages with this code from another number (5 = dead, "too many")
--   no_code     1 = a message came from the typed number without this code (the message was changed)
--   sender_box  only once verified: the number, ENCRYPTED (AES-GCM, key from the secret), so the proof can
--               be made; emptied the moment the proof is handed out (proof_at)
-- Rows older than 2 days are deleted by the daily clean-up (worker.js scheduled). Times are milliseconds.
CREATE TABLE IF NOT EXISTS phone_inbound (
  id_key      TEXT PRIMARY KEY,
  phone_key   TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  code_key    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  state       TEXT NOT NULL DEFAULT 'waiting',
  wrong_msgs  INTEGER NOT NULL DEFAULT 0,
  no_code     INTEGER NOT NULL DEFAULT 0,
  sender_box  TEXT,
  verified_at INTEGER,
  proof_at    INTEGER
);
CREATE INDEX IF NOT EXISTS phone_inbound_code ON phone_inbound (code_key, state, expires_at);
CREATE INDEX IF NOT EXISTS phone_inbound_phone ON phone_inbound (phone_key, state, created_at);
