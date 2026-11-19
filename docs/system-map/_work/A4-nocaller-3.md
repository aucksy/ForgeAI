# A4-nocaller-3 checkpoint
Candidates: readers-raw.txt lines 1358-1451 (94 functions). Out file: docs/system-map/_work/out/A4-nocaller-3.jsonl

## Finished units
- lines 1358-1372 done (15 functions, RD-01..15): _push_note_measurement .. _report_tidy
- lines 1373-1387 done (15 functions, RD-16..30): _roster_app_members .. _talk_member_left
- lines 1388-1402 done (15 functions, RD-31..45): _talk_member_limits .. _timings_json
- lines 1403-1417 done (15 functions, RD-46..60): _tq_gym_row .. _trainer_recent_clean
- lines 1418-1432 done (15 functions, RD-61..75): _trainer_setup_view .. _web_push_live
- lines 1433-1447 done (15 functions, RD-76..90): _wod_clean .. owner_ai_member_rules
- lines 1448-1451 done (4 functions, RD-91..94): owner_receipt_history .. support_make_signin_code
- ALL DONE: 94 of 94 candidates have a reader row. 2 entity rows written (E-receipt-history, E-gym-talk-messages). File checked: 96 rows parse, ids in order, every path:line exists.

## Totals
- reader rows: 94 (notification 5, not-a-reader 89)
- notification (5): the push-note triggers for body measurements, shop orders, plan requests, report requests, workout plans
- not-a-reader (89): 70 helpers called by other database functions, 8 triggers that only write/delete/block, 2 helpers used by row access policies, 7 that nothing calls, 1 run by hand by support, 1 that does have an app caller the list missed

## Seen in passing
- Nothing calls ai_visitor_question_take (supabase/migrations/0078_ai_questions.sql:259): open to anyone (anon), only database tests run it.
- Nothing calls gate_enqueue (supabase/migrations/0058_entry_machines.sql:326): only database tests; the owner version from 0059 does the job.
- Nothing calls hq_db_reads (supabase/migrations/0097_direct_read_log.sql:251): the log of direct database reads is written, but no HQ screen or Worker shows it.
- Nothing calls hq_hide_gym_page (supabase/migrations/0080_gym_page.sql:408): HQ has no button to take a gym web page down.
- Nothing calls member_set_name (supabase/migrations/0002_shop.sql:331): open to anon and authenticated, no app code uses it.
- Nothing calls owner_ai_member_rules (supabase/migrations/0083_ai_members.sql:227): the panel names it only in a comment (apps/dashboard/src/crm/assistant/api.ts:240).
- Nothing calls owner_receipt_history (supabase/migrations/0021_receipt_rules.sql:91): every receipt change is recorded in receipt_history, but no screen shows it to the owner.
- support_make_signin_code (supabase/migrations/0031_branches.sql:428): no code calls it, by design (support runs it by hand, supabase/migrations/0010_signin_and_records.sql:17).
- page_chat_sweep (supabase/migrations/0094_page_chat.sql:124): the 90-day clean-up of web page chats has no timed job; it only runs by chance on about 1 in 50 visitor questions (0094:248), so a quiet gym's old chats can stay past 90 days. docs/gym-page/PLAN.md:262 lists the daily run as still to do.
- The candidate list is wrong for panel_test_alert_shown (supabase/migrations/0095_test_alert.sql:134): it HAS a caller, apps/dashboard/public/sw.js:144 calls it by web address (fetch to /rest/v1/rpc/...), which the script did not see. Other functions called this way may be mislisted as no-caller.
- _trainer_recent_clean (supabase/migrations/0053_ask_trainer_and_progress.sql:203) is called only by member_trainer_share2; whether the app still calls share2 (share3 exists since 0084) was not checked here.

## Could not check
- Whether each migration is really applied on the live database (no database query was allowed or needed; all rows come from the migration files).
- Timed jobs set up outside the repo (for example in the Supabase dashboard): the migrations and deploy/ hold no schedule for any of these functions.
- Whether the calling functions named in the reasons are themselves called by an app (they belong to other helpers' candidate lists).
