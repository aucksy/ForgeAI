# A5-server-database-3-1 checkpoint

F-server-504: 13 journeys, 23 type lines
F-server-505: 4 journeys, 8 type lines
F-server-506: 5 journeys, 7 type lines
F-server-507: 10 journeys, 14 type lines
F-server-508: 20 journeys, 28 type lines
F-server-510: 12 journeys, 24 type lines
F-server-511: 15 journeys, 21 type lines
F-server-514: 10 journeys, 14 type lines
F-server-515: 18 journeys, 30 type lines

LIMIT REACHED: 1 item left: F-server-516 (4 roles). 23 pairs x 12 rows = 276 rows + 2 findings = 278; F-server-516 needs
48 more rows, over the 300-row limit. Next helper: start at F-server-516.

Findings: FN-A5-server-database-3-1-01 (QA purge by name), FN-A5-server-database-3-1-02 (AI refund never checks failure).

No entity fits: member_find_tries (0068, the 5-searches-per-proof log) has no E- id; left out of writes.

Seen in passing (not sure enough for a finding):
- 0070 member_plus_lock: header says BAD_KEY after Leave, but the function does not check left_at (other member calls do).
  Not checked whether Leave clears the key.
- 0068 member_claim_phone saves the proven number on the gym member row, while the Find my gym screen says "Your number is
  checked once and is not kept for this." The promise probably means the search only.
- 0073 workout/diet "changed" pop-up is tagged by a hash of the content: a plan changed back to an earlier version, or a
  member removed and added again, gets no pop-up.
- 0065 owner_book_pt does not check that the member has a running plan or PT classes left; only the "ahead" count is shown.
- 0071 header still says NOT APPLIED while the feature row says live (already in the feature name).

Could not check:
- The supabase/tests files for these migrations were not opened; every journey has coverage "unknown".
- The admin app Trainers screen words (F-server-504) were not read; those journeys use the server's refusals, not exact words.
- No live data was read.
