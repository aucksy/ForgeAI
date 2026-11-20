# A5-server-database-2-2 checkpoint

Done (all 8 features, 21 feature x role pairs; output _work/out/A5-server-database-2-2.jsonl, 254 rows):
F-server-409: 5 journeys, 7 type lines
F-server-410: 7 journeys, 17 type lines
F-server-411: 13 journeys, 23 type lines
F-server-412: 8 journeys, 16 type lines
F-server-413: 12 journeys, 24 type lines
F-server-414: 11 journeys, 25 type lines
F-server-416: 16 journeys, 32 type lines
F-server-418: 15 journeys, 21 type lines
Findings: FN-A5-server-database-2-2-01, FN-A5-server-database-2-2-02.

## Entities with no id (left out of writes/reads)
- gym_mate_workouts (0040): no entity; E-gym-mate-profiles used for the profile.
- member_checkin_tries, gym_checkin_misses (check-in try limits): no entity.
- gym_message_to (picked recipients of a message): no entity.

## Seen in passing (not sure enough for a finding)
- Messages: the 10-a-day limit counts every message made today (also taken-back ones and ones timed for a later day), while the pop-up rule counts by the day a message appears and skips taken-back ones. Copied from 0025 on purpose; the two counts can disagree.
- Messages: the pop-up rule is decided when a message is saved; a message timed earlier in the day but saved later can be quiet while an earlier-saved later one pops up (documented as "never changes").
- Plan requests: a cancelled request is deleted, so the 6-a-day limit does not count it (ask/cancel loop possible).
- Offline receipts: any receipt a desk marks "offline" with a desk-series number skips the over-due check, even if it was really sent online.
- Member photos: no suspended-gym guard on the photo table, and a member deleted from the list keeps their photo until someone removes it.
- Check-in: the guard on gym_phone_links also blocks deletes in a paused gym (removing an app member there would fail).
- Trainer view: help text P-A7-help-1-15 / whats-new P-A7-whats-new-2-45 read as if sharing starts off; the feature row says on by default.

## Could not check
- App words for most server refusals (OWNER_ONLY, NOT_SHARED, BAD_DATES, ...): the app code was not in this item.
- How a pass member's plan state shows on check-in (_checkin_plan_ok not read).
- Tests: no test file opened, so every journey is coverage "unknown".
