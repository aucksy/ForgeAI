# A5-server-database-1-3 checkpoint

F-server-320: 13 journeys, 23 type lines
F-server-321: 9 journeys, 15 type lines
F-server-322: 5 journeys, 7 type lines
F-server-310: 13 journeys, 23 type lines
F-server-323: 5 journeys, 7 type lines
F-server-324: 15 journeys, 33 type lines
F-server-325: 5 journeys, 7 type lines
F-server-326: 5 journeys, 7 type lines
F-server-327: 9 journeys, 15 type lines

All 9 features done (18 feature x role pairs). Output: _work/out/A5-server-database-1-3.jsonl (217 rows: 79 journeys, 137 type lines, 1 finding).

## Entities not found
- offer_days, offer_log, gym_message_seen, gym_message_to, crm_push_log, gym_creator_ips: no entity id; left out of writes/reads.

## Seen in passing (not sure enough for a finding)
- Pause (F-server-324): the feature name says every gym table refuses writes; 0027 guards only its listed tables, later migrations add guards one by one (0031-0082). Whether every later gym table (talk threads, trainer questions, PT bookings ...) is guarded was not checked.
- owner_send_message has no retry key: a send retried after a dropped answer sends the message twice.
- hq_create_gym has no duplicate check: a double tap makes two gyms for one lead.
- owner_hq_access lists support looks by time window; looks inside two overlapping windows (gym's hour and an HQ emergency) show under both.
- owner_hq_access 'actions' omits support_close and delete-request steps; plain HQ views of the gym (view_gym, view_access_log, which show the owner's mobile and counts) are not shown to the owner, while the card says "Every look is listed here" (promise P-A7-legal-2-16 already GAP).
- member_saw_messages accepts a seen mark on a taken-back message (harmless; not shown).

## Could not check
- Tests: supabase/tests/0025_workout_offer.sql, 0026_hq.sql, 0027_hq_actions.sql, 0028 not opened; every journey coverage left unknown.
- Live behaviour: no database query run (not needed for code-read journeys).
