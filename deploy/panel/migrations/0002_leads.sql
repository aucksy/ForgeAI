-- Launch I3 (21 Oct 2026): the landing page's "free demo" form. Cloudflare D1 `forgeai-web`, not the
-- gym server. Deleted after 12 months if no deal (scripts/leads.py purge).
CREATE TABLE IF NOT EXISTS leads (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       TEXT NOT NULL,
  phone    TEXT NOT NULL,             -- 10 digits
  gym      TEXT NOT NULL,
  city     TEXT NOT NULL,
  size     TEXT NOT NULL DEFAULT '',
  today    TEXT NOT NULL DEFAULT '',  -- register | excel | ggms | other
  lang     TEXT NOT NULL DEFAULT 'en',
  ip_hash  TEXT NOT NULL DEFAULT '',  -- salted daily one-way hash, only for the limits
  status   TEXT NOT NULL DEFAULT 'new', -- new | called | demo | won | lost
  note     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS leads_at ON leads (at);
