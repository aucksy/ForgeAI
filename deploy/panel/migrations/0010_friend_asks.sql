-- APPLIED LIVE 5 Nov 2026 (owner's yes, R-331) with `wrangler d1 execute --file` (not via `migrations apply`, because 0009 has no yes yet; re-runnable: IF NOT EXISTS only).
-- F147 Bring a friend (4 Nov 2026). (was not applied): needs the owner's yes
-- (npx wrangler d1 migrations apply forgeai-web --remote).
-- The friend invite page's form (app.mettleup.fit/f/<CODE>, friend.js) may be sent 5 times a day from one
-- network address. This keeps only WHEN and a salted, daily one-way hash of the address: never the name,
-- the number or the address itself. Rows older than 2 days are deleted by the daily clean-up (worker.js).
-- Until it is applied, friend.js still sends (the gym server's own limits still hold) and logs that the
-- table is missing.
CREATE TABLE IF NOT EXISTS friend_asks (
  at      TEXT NOT NULL,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS friend_asks_ip ON friend_asks (ip_hash, at);
