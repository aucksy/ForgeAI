-- R-149 (28 Oct 2026): the member app's floating feedback button says how a message was written.
-- ADDITIVE only: one new column with a default, so every older app (which never sends it) and the
-- old Worker keep working; their rows read ''.
ALTER TABLE feedback ADD COLUMN input TEXT NOT NULL DEFAULT ''; -- 'voice' | 'typed' | '' (not said)
