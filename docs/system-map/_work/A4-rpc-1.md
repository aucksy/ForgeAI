# A4-rpc-1 checkpoint

Output: docs/system-map/_work/out/A4-rpc-1.jsonl
Source: lines 220-500 of docs/system-map/_sources/readers-raw.txt (91 groups, 100 candidate lines).

## Finished units
All 91 groups read (function's newest definition found, main table noted, calling code opened). ALL DONE within the 12-new-entity limit.
- Groups 1-10 (ai_question_back ... crm_push): done
- Groups 11-20 (delete_my_cloud_data ... gate_recent_punches): done
- Groups 21-30 (gate_save_punches ... hq_ai_grant): done
- Groups 31-40 (hq_ai_purge_old ... hq_billing_checks_waiting): done
- Groups 41-50 (hq_billing_daily ... hq_delete_gym): done
- Groups 51-60 (hq_delete_request_add ... hq_log): done
- Groups 61-70 (hq_mettleup_payments ... hq_payment_details): done
- Groups 71-80 (hq_purge_qa_gyms ... hq_set_trial): done
- Groups 81-91 (hq_set_web_page ... member_auto_reminders): done

Written: 12 entity rows, 64 reader rows (RD-A4-rpc-1-01 to -64). Left out: 36 candidate lines (their tables need entity rows beyond the limit of 12).

## Entity rows written (12)
gyms, profiles, crm_records, hq_audit, hq_delete_requests, platform_payment_details, mettleup_payments, gym_checkouts, gym_ai_credit_ledger, gym_alerts, gym_page_off, db_direct_reads

## Entity rows still to write (24 tables, 36 candidate lines left out)
Each line: table (entity id) <- function | candidate file:line | what I saw (newest definition).
- gym_ai_questions (E-gym-ai-questions) <- ai_question_back | deploy/panel/questionCredits.js:96 | only writes (gives a counted question back), 0083_ai_members.sql:199
- gym_ai_questions <- ai_question_take | deploy/panel/questionCredits.js:82 | counts one AI question against the gym's allowance through _ai_q_take (0078_ai_questions.sql:221, _ai_q_take newest in 0083_ai_members.sql:119); writes and answers allowed or not
- app_config (E-app-config) <- app_limits | apps/mobile/src/cloud/copyApi.ts:119 | read (limits the phone keeps), 0032_member_cloud.sql:111
- gym_friend_invites (E-gym-friend-invites) <- friend_invite_preview | deploy/panel/worker.js:279 | read for the friend page (gym name, inviter's first name), 0056_bring_a_friend.sql:140
- gym_friend_referrals (E-gym-friend-referrals) <- friend_invite_send | deploy/panel/friend.js:118 | writes the referral, an enquiry record and an alert, 0085_friend_known_number.sql:26
- entry_machines (E-entry-machines) <- gate_machine | apps/dashboard/src/crm/machines/supabaseStore.ts:58 | read (machine by serial), 0058_entry_machines.sql:135
- entry_machines <- gate_seen | supabaseStore.ts:83 | only writes (last seen), 0058:155
- entry_machine_strangers (E-entry-machine-strangers) <- gate_stranger | supabaseStore.ts:87 | only writes, 0058:173
- entry_machine_members (E-entry-machine-members) <- gate_member_nos | supabaseStore.ts:91 | read (machine number -> member), 0058:185
- entry_machine_punches (E-entry-machine-punches) <- gate_recent_punches | supabaseStore.ts:96 | read (last punch per number), 0058:196
- entry_machine_punches <- gate_save_punches | supabaseStore.ts:112 | writes punches and visit records in crm_records, 0058:213
- entry_machine_commands (E-entry-machine-commands) <- gate_take_commands | supabaseStore.ts:120 | reads due commands and marks them sent, 0058:277
- entry_machine_commands <- gate_command_results | supabaseStore.ts:135 | only writes, 0058:308
- gym_page_asks (E-gym-page-asks) <- gym_page_ask_send | deploy/panel/gymPageServe.js:239 | writes the question, an enquiry record and an alert, 0080_gym_page.sql:327
- gym_pages (E-gym-pages) <- gym_page_public | deploy/panel/gymPageServe.js:146 | read: the public gym web page, 0090_gym_page_switch.sql:58
- gym_page_reports (E-gym-page-reports) <- gym_page_report_send | deploy/panel/gymPageServe.js:249 | only writes, 0080_gym_page.sql:385
- gym_access_log (E-gym-access-log) <- hq_access_log | deploy/hq/api.js:368 | read: HQ's list of who opened a gym, 0028_hq_breakglass_and_logs.sql:285
- gym_ai_tasks (E-gym-ai-tasks) <- hq_ai_purge_old | deploy/hq/worker.js:209 | nightly delete of old AI requests, 0071_ai_assistant.sql:375
- db_read_log_state (E-db-read-log-state) <- hq_db_reads_cursor | deploy/hq/readLog.js:234 | read: where the last pull of the direct-read log stopped, 0097_direct_read_log.sql:147
- hq_grants (E-hq-grants) <- hq_end_access | deploy/hq/api.js:657 | only writes, 0028:238
- hq_grants <- hq_open_emergency | deploy/hq/api.js:652 | only writes, 0028:219
- member_push_notes (E-member-push-notes) <- hq_fee_request_notes | deploy/hq/payFeed.js:73 | writes notes for members through _push_note, 0073_member_push_more.sql:232
- member_push_notes <- hq_push_direct_next | deploy/hq/push.js:423 | reads notes due and marks them, to send pushes to members, 0054_member_alerts.sql:180
- gym_groups (E-gym-groups) <- hq_groups | deploy/hq/api.js:119 | read: gym groups with their branches for HQ, 0031_branches.sql:697
- gym_web_push (E-gym-web-push) <- hq_panel_drop_push | deploy/hq/panelPush.js:181 | only deletes dead browser addresses, 0076_panel_web_push.sql:273
- member_push_tokens (E-member-push-tokens) <- hq_push_drop | deploy/hq/push.js:390 and deploy/hq/push.js:468 (2 lines) | only deletes dead phone addresses, 0038_member_push.sql:236
- push_jobs (E-push-jobs) <- hq_push_next | deploy/hq/push.js:346 | reads the next pushes to send to members (messages, offers, trainer answers), 0053_ask_trainer_and_progress.sql:433
- gym_staff_pins (E-gym-staff-pins) <- hq_reset_owner_signin | deploy/hq/api.js:543 | only writes, 0034_signin_pin.sql:341
- gym_sessions (E-gym-sessions) <- hq_sign_out_gym | deploy/hq/api.js:548 | only writes (ends sessions), 0027_hq_actions.sql:252
- gym_report_requests (E-gym-report-requests) <- member_answer_report_request | apps/mobile/src/shop/gymApi.ts:363 | writes the member's yes or no, 0045_report_requests.sql:214
- gym_report_requests <- member_attach_report | apps/mobile/src/shop/gymApi.ts:372 | writes the report file, 0045:249
- gym_staff (E-gym-staff) <- member_ask_choices | apps/mobile/src/shop/gymApi.ts:558 | read: trainers a member may ask (also reads trainer_questions for "one is open"), 0053:246
- gym_plan_requests (E-gym-plan-requests) <- member_ask_plan_change | apps/mobile/src/shop/gymApi.ts:323 | writes a freeze or renew request, 0044_plan_requests.sql:165
- trainer_questions (E-trainer-questions) <- member_ask_trainer | apps/mobile/src/shop/gymApi.ts:566 | writes a question, 0074_ask_trainer_paid_plan.sql:38
- gym_auto_reminders (E-gym-auto-reminders) <- member_auto_reminders | apps/mobile/src/shop/gymApi.ts:210 | read: owner's reminder switches plus the member's own dates from crm_records, 0029_auto_reminders.sql:125

## How I classed things
- Main table of a function that touches several = the table the function exists for (hq_system, hq_gyms, hq_gym, plan/trial/status setters, create and delete of a gym -> gyms).
- The three "fn" lines (function name is a variable in a generic wrapper) = not-a-reader, entity E-gyms only because a row needs one.
- hq_backup_snapshot (deploy/hq/backup.js:96) reads EVERY public table and the sign-in accounts for the nightly backup: written once as an "export" on E-gyms; it is really a reader of every entity.
- Nightly jobs that pick rows by age or due date (hq_nightly_cleanup, hq_purge_qa_gyms, hq_billing_daily) = "job", surface server.
- Web-push senders (deploy/hq/panelPush.js) = "notification" / "digest" with surface "server" (the code runs there; the person sees it on the panel browser).
- crm_pull (the panel's sync pull that feeds every panel screen) = "job" on the panel.
- deploy/panel/worker.js:249 is a comment line; the real gym_preview use is :251 (join page shown to a visitor: surface web).

## Seen in passing
- deploy/hq/billing.js:422: runBillingDaily returns "sent: 0" always, though the line above counts the renewal messages really sent; whoever reads the result sees zero messages.
- hq_system (supabase/migrations/0026_hq_audit_and_counts.sql:210) hard-codes the database limit as 500 MB; if the plan changes the HQ System page shows the wrong "full" level.
- member_account_delete was assigned to profiles; it also deletes member_items and member_summary (0032_member_cloud.sql:216-229), which have no entity row yet.

## Could not check
- Whether each function's newest definition in supabase/migrations is what is live (no database query in this step).
- gyms: later columns beyond 0031 (searched "alter table gyms", read the first 40 hits only).
