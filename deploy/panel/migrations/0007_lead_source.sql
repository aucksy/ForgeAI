-- F184 (R-242, 31 Oct 2026): where a demo request came from. The member website (mettleup.fit) lets a
-- member send their gym owner a link to gyms.mettleup.fit/?from=member; a demo request sent from that
-- visit is kept with source 'member-referral', so HQ can count leads that members brought in.
-- ADDITIVE only: one new column with a default. Every older row and every form without it reads ''
-- (the gym found us by itself). Until this is applied, leads.js saves leads without the source.
ALTER TABLE leads ADD COLUMN source TEXT NOT NULL DEFAULT ''; -- '' | 'member-referral'
