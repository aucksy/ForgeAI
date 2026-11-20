# A5-server-database-3-1b checkpoint

F-server-516: 20 journeys, 28 type lines

Done. Merge dry run: 48 rows, 0 rejected, 0 with gaps.

## Seen in passing (not sure enough for a finding)
- Old alerts (over 30 days) are deleted only on about 1 in 100 new alert writes (random). A quiet gym can keep alerts longer than the "Kept 30 days" note says. 0075_gym_alerts.sql:75-77.
- "member_joined" is one alert per app member id for ever (tag 'joined:<id>'): if the same app member row is re-used when someone rejoins, no new alert. Did not check how rejoin is stored.
- The bell returns at most 50 alerts from the last 3 days; on a busy day older ones within 3 days drop off the list. By design per the comment.

## Could not check
- Entity for the gym's member list entry (crm_records kind member / membership) not looked up; left out of reads.
- supabase/tests/0075_gym_alerts.sql and 0095/0096 tests not opened, so every journey's coverage is "unknown".
