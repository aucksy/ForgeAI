# A4-rpc-1b checkpoint

Source: the "entity rows still to write" parts of A4-rpc-1.md (36 candidate lines) and A4-rpc-4.md (11 candidate lines): 47 in all.
Output: docs/system-map/_work/out/A4-rpc-1b.jsonl (0 entity rows, 46 reader rows, RD-A4-rpc-1b-01 to -46).

## Finished units
- candidates 1-10 done (rows 01-10): ai_question_back, ai_question_take, app_limits, friend_invite_preview, friend_invite_send, gate_machine, gate_seen, gate_stranger, gate_member_nos, gate_recent_punches
- candidates 11-20 done (rows 11-20): gate_save_punches, gate_take_commands, gate_command_results, gym_page_ask_send, gym_page_public, gym_page_report_send, hq_access_log, hq_ai_purge_old, hq_db_reads_cursor, hq_end_access
- candidates 21-30 done (rows 21-30): hq_open_emergency, hq_fee_request_notes, hq_push_direct_next, hq_groups, hq_panel_drop_push, hq_push_drop (2 lines), hq_push_next, hq_reset_owner_signin, hq_sign_out_gym
- candidates 31-40 done (rows 31-40): member_answer_report_request, member_attach_report, member_ask_choices, member_ask_plan_change, member_ask_trainer, member_auto_reminders, owner_terms, owner_test_alert, owner_trainer_members (demoServer + trainerApi)
- candidates 41-47 done (rows 41-46): owner_web_push_on, phone_sign_in_find, self_join_send, storage gym-logos, storage product-photos, table profiles; state.profile.name = no row (see below)

ALL DONE. Nothing left.

## Entity rows
None written: all 36 entity ids needed are already in docs/system-map/entities.json.

## Candidate with no row (1)
- apps/mobile/src/shop/MateProfileScreen.tsx:118 "state.profile.name": opened; it is screen text, MATE_WORDS.from(state.profile.name), not a table or storage call. No row.

## Choices made
- Kinds: not-a-reader 24, job 8, screen 6, list 5, notification 3 (46 rows).
- apps/dashboard/src/crm/machines/supabaseStore.ts (8 gate_* lines): surface "server", because the file's own header says it is used only by the gate Worker (deploy/gate/worker.ts:19 imports it), never by the panel.
- Server-side lookups at request time (ai_question_take, gate_machine, gate_member_nos, gate_recent_punches, gate_take_commands, hq_db_reads_cursor) and the nightly delete hq_ai_purge_old = "job", as the earlier helpers did.
- app_limits on the phone = "job": read in the background and kept (copyApi.ts:118 comment), not shown on a screen at that line.
- member_auto_reminders on the phone = "notification": the owner's switches and the member's dates drive the phone's automatic reminders (gymApi.ts:204-208 comment). The screen that schedules them was not opened.
- A function that writes and hands back the changed row = not-a-reader (same rule as A4-rpc-4).
- deploy/panel/worker.js:279 and deploy/panel/gymPageServe.js:239 and :249 are settings lines that name the function; the call itself happens in a shared helper. "where" is kept as the candidate's own line, as the brief says.
- owner_test_alert (webPushApi.ts:179) reads the browser's latest test alert from gym_alerts (supabase/migrations/0095_test_alert.sql:119-121): "screen" on E-gym-alerts.
- phone_sign_in_find filed under E-crm-records as the earlier checkpoint named it; the function body (0093_phone_sign_in.sql:35) was not read past its header.

## Seen in passing
- apps/dashboard/src/crm/machines/supabaseStore.ts:3-4 says migration 0058 is NOT APPLIED and the gate Worker is NOT DEPLOYED: the 8 entry-machine rows describe code that is not live, if that comment is still true.
- deploy/panel/questionCredits.js:74-76: with no PHONE_CODE_SECRET set, the AI question is not counted against the gym's allowance (state "skip", only a console warning); whether the question is still answered was not checked.

## Could not check
- Whether each function's newest definition in supabase/migrations is what is live (no database query in this step).
- Whether the supabaseStore.ts "NOT APPLIED / NOT DEPLOYED" header is still true.
- Which phone screen shows the result of member_auto_reminders, app_limits and member_ask_choices (only the API line was opened).
- Whether apps/dashboard/src/hooks/useGymData.ts (old profiles read) is still reachable by a user.
