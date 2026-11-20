# A5-phone-onboarding-db-1 checkpoint

F-phone-1620: 8 journeys, 16 type lines
F-phone-1616: 10 journeys, 14 type lines
F-phone-1617: 10 journeys, 14 type lines
F-phone-1615: 10 journeys, 14 type lines
F-phone-1611: 10 journeys, 14 type lines
F-phone-1601: 8 journeys, 16 type lines
F-phone-1606: 5 journeys, 7 type lines
F-phone-1607: 9 journeys, 15 type lines
F-phone-1604: 18 journeys, 30 type lines

findings: FN-A5-phone-onboarding-db-1-01, FN-A5-phone-onboarding-db-1-02

entities: no entity id exists for the phone's own SQLite data (plans, workouts, sets, records, profile, body weight, intro mark); writes/reads left empty and type lines use 'unknown' for those.

seen in passing (not sure, not findings):
- planRepo getActivePlan drops a plan exercise whose exercise row is gone, with no word to the member.
- prRepo checkAndRecordPrs: the best-weight record ignores easy-week workouts' rule that the e1rm record follows; unclear whether easy-week workouts should set weight records.
- WelcomeGoogle offers the newest Drive file it peeked at, but the restore runs its own search (checkForBackup); if a newer file appears in between, a different backup may be restored than the one named.
- saveDataFile leaves the consistent copy in the cache folder after sharing (a full copy of private data stays on the phone).
- WelcomePhone (staff): the problem words for join failures for staff go through the gym join screen, not checked here.

could-not-check: Today screen wording for today's plan day (not opened); recommend message text (not opened); checkName message words; 'What my gym can see' screen words were taken from promises.json, not the screen.

rows: 230 (journeys 88, type lines 140, findings 2)
