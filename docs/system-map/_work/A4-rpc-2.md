# A4-rpc-2 checkpoint

Status: DONE (one pass). Output: docs/system-map/_work/out/A4-rpc-2.jsonl (12 entity rows + 59 reader rows).
Input: readers-raw.txt lines 502-778 = 89 groups, 100 candidates. All 89 groups looked at (newest function definition found for every one).

## Finished groups (reader rows written: 59 candidates, 53 groups)
member_board, member_board_push, member_cancel_order, member_check_in, member_claim_phone, member_find_gyms,
member_gym_busy, member_gym_pack, member_gym_plans, member_join, member_join_day, member_leave, member_mate_board,
member_mate_profile, member_mate_share, member_mate_stop, member_me (2), member_membership, member_orders (2),
member_pay_me, member_place_order, member_talk_list, member_talk_reply, member_talk_send, member_talk_send_to,
member_talk_unread, member_trainer_help, member_trainer_share, member_trainer_share2, member_trainer_share3,
member_trainer_status, member_trainer_stop, member_questions, member_withdraw_question, owner_add_branch,
owner_branches, owner_ai_refund, owner_ai_spend, owner_ai_wallet, owner_ai_status, owner_alert_list,
owner_alert_opened, owner_alert_remove, owner_alerts, owner_alerts_read, owner_answer_question (3),
owner_app_members (2), owner_billing, owner_board (2), owner_book_pt (2), owner_cancel_pt (2)

## Entity rows written (12, the limit)
E-gyms, E-crm-records, E-gym-talk-threads, E-gym-progress-summaries, E-gym-members, E-trainer-questions,
E-gym-alerts, E-shop-orders, E-gym-member-board, E-gym-pt-bookings, E-gym-mate-profiles, E-gym-ai-credit-ledger

## Entity rows still to write (reader rows left out: 41 candidates, 36 groups)
Format: table (entity id) <- function @ candidate | newest definition
- gym_plan_requests (E-gym-plan-requests) <- member_plan_requests gymApi.ts:309, member_cancel_plan_request gymApi.ts:332 (write), member_saw_plan_requests gymApi.ts:340 (write) | 0044_plan_requests.sql
- member_items (E-member-items) <- member_copy_count copyApi.ts:100, member_copy_get copyApi.ts:73, member_copy_put copyApi.ts:48 (write) | 0032_member_cloud.sql
- gym_challenges (E-gym-challenges) <- owner_challenges demoServer.ts:611 (demo) + challengesApi.ts:21, owner_cancel_challenge challengesApi.ts:31 (write) | 0091_challenge_checkins.sql, 0037_leaderboard.sql
- offer_members (E-offer-members) <- member_join_offer gymApi.ts:441 (write), member_leave_offer gymApi.ts:451 (write), member_offer_days gymApi.ts:446 (write + reads) | 0025_workout_offer.sql
- gym_offers (E-gym-offers) <- member_offers gymApi.ts:436 | 0025_workout_offer.sql:477
- gym_messages (E-gym-messages) <- member_messages gymApi.ts:117, member_saw_messages gymApi.ts:123 (write to gym_message_seen) | 0025_workout_offer.sql:762-794
- member_push_tokens (E-member-push-tokens) <- member_save_push_token gymApi.ts:474 (write), member_clear_push_token gymApi.ts:481 (write) | 0038_member_push.sql
- gym_exercise_starts (E-gym-exercise-starts) <- member_machine_busy gymApi.ts:495, member_machine_push gymApi.ts:503 (write) | 0049_busy_by_exercise.sql
- gym_ai_tasks (E-gym-ai-tasks) <- owner_ai_tasks assistant/api.ts:383, owner_ai_task_save assistant/execute.ts:339 (write) | 0071_ai_assistant.sql
- gym_ai_questions (E-gym-ai-questions) <- owner_ai_questions assistant/api.ts:298 | 0083_ai_members.sql:248
- gym_wods (E-gym-wods) <- member_gym_wod gymApi.ts:232, owner_clear_gym_wod wodApi.ts:57 (write) | 0051_gym_videos_and_wod.sql
- gym_trainer_members (E-gym-trainer-members) <- owner_assign_trainer demoServer.ts:467 (demo) + trainerApi.ts:88 (write) | 0050_trainer_view.sql:300
- gym_auto_reminders (E-gym-auto-reminders) <- owner_auto_reminders demoServer.ts:532 (demo) + shop/api.ts:191 | 0029_auto_reminders.sql:91-106
- gym_staff (E-gym-staff) <- owner_add_person auth/api.ts:130 (write), member_talk_choices gymApi.ts:660 (reads gym_staff + gym_trainers) | 0031_branches.sql:338, 0096_message_recipient.sql:206
- shop_products (E-shop-products) <- member_products gymApi.ts:153, owner_add_stock shop/api.ts:216 (write) | 0002_shop.sql:347, 0018_staff_and_owner_rules.sql:262
- gym_diet_plans (E-gym-diet-plans) <- member_diet_plans gymApi.ts:251 | 0035_trainer_measurements_diet.sql:392
- gym_body_measurements (E-gym-body-measurements) <- member_measurements gymApi.ts:243 | 0035_trainer_measurements_diet.sql:313
- gym_timings (E-gym-timings) <- member_gym_timings gymApi.ts:262 | 0036_gym_timings.sql:190
- gym_friend_invites (E-gym-friend-invites) <- member_friend_invite gymApi.ts:623 (creates the invite if none, returns it) | 0056_bring_a_friend.sql:104
- gym_plus_settings (E-gym-plus-settings) <- member_plus_lock gymApi.ts:728 | 0070_member_plus_lock.sql:64
- gym_report_requests (E-gym-report-requests) <- member_report_requests gymApi.ts:355 | 0045_report_requests.sql:193
- gym_terms_acceptance (E-gym-terms-acceptance) <- owner_accept_terms auth/terms.ts:87 (write) | 0033_terms_acceptance.sql:114
- entry_machines (E-entry-machines) <- owner_add_entry_machine entryMachinesApi.ts:114 (write) | 0059_entry_machines_owner.sql:77
- gym_alert_settings (E-gym-alert-settings) <- owner_alert_settings webPushApi.ts:52 | 0076_panel_web_push.sql:126

## Notes on choices
- Main table per function was taken from the newest definition in supabase/migrations (last file that creates it).
- demoServer.ts candidates = not-a-reader (demo stand-in, no database call). deploy/panel/proxy.js:75 = not-a-reader (a list of names only).
- Server code (deploy/panel) that uses a row to do its work is written as reader_kind "job" (closest allowed kind; these are request handlers, not scheduled jobs).
- owner_alert_opened / owner_alert_remove / owner_alerts_read write to gym_alert_reads, not gym_alerts; filed under E-gym-alerts as not-a-reader.
- owner_ai_status reads only gyms (billing, paid_until, trial_ends_at), so it is under E-gyms, not the credit ledger.
- member_me also updates gym_members.last_seen on every read (0005_gym_theme.sql:121); kept as a reader of E-gyms.

## Seen in passing
- none clear enough to call a bug. (Small: the comment at apps/mobile/src/shop/gymApi.ts:183 says member_check_in is "0015"; the newest definition is 0048_security_fixes.sql:61.)

## Could not check
- Which phone or panel screen each wrapper finally feeds: reader_kind was decided from the wrapper and the function's answer, not by following to the screen.
- visible_to is read from the function guards named in each definition (_member, _owner_gym, _owner_only_gym, _staff), not from a live policy list. No database query was run.
- retention: no file read states it; all "unknown".
