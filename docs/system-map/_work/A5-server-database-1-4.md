# A5-server-database-1-4 checkpoint

F-server-328: 10 journeys, 14 type lines
F-server-329: 4 journeys, 8 type lines
F-server-331: 9 journeys, 15 type lines
F-server-332: 9 journeys, 15 type lines
F-server-312: 5 journeys, 7 type lines
F-server-333: 10 journeys, 14 type lines
F-server-334: 5 journeys, 7 type lines
F-server-336: 5 journeys, 7 type lines

Done: all 8 features, 12 feature x role pairs. Output: _work/out/A5-server-database-1-4.jsonl (144 rows: 57 journeys, 87 type lines). Findings: 0.
Fix after merge reject: JT-F-server-332-hq-admin-10 and -11 got real reasons; dry merge with --a5cover: 144 passed, 0 rejected, 0 with gaps.

No entity fits (left out of writes/reads): gym_creator_ips (creator addresses), gym_signin_fails (wrong codes), branch_lookups (look-up counter).

Seen in passing (not sure enough for a finding):
- owner_accept_terms (0033): the "same version already accepted" check runs with no lock; two owners pressing at once can write two rows for one version.
- owner_add_branch (0031): copies the FIRST branch's status; if the first branch is paused but the caller's is not, the new branch is born paused and the owner insert fails with SUSPENDED (no forgeai.branch_people set there).
- member_copy_put (0032): tombstones count toward the 30,000-row cap, so deleting items never frees room.
- hq_set_plan (0030): accepts a paid-until date in the past (only > 3 years ahead is refused).
- owner_add_branch / owner_add_person / gym_create_online cut names to 60 letters with no message.

Could not check: the screens that call these functions (other features); live database state (0031-0033 say NOT APPLIED); tests not opened, so no coverage claimed.
