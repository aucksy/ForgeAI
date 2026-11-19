# A4-rpc-2b checkpoint

Status: DONE. Output: docs/system-map/_work/out/A4-rpc-2b.jsonl (41 reader rows, 0 entity rows).
Input: the 41 left-out candidates listed in docs/system-map/_work/A4-rpc-2.md ("Entity rows still to write").

## Finished units
- Candidates 1-10 done (rows 01-10): gym_plan_requests (3), member_items (3), gym_challenges (3), member_join_offer.
- Candidates 11-20 done (rows 11-20): member_leave_offer, member_offer_days, member_offers, gym_messages (2), member_push_tokens (2), gym_exercise_starts (2), owner_ai_tasks.
- Candidates 21-30 done (rows 21-30): owner_ai_task_save, owner_ai_questions, gym_wods (2), gym_trainer_members (2), gym_auto_reminders (2), gym_staff (2).
- Candidates 31-41 done (rows 31-41): shop_products (2), gym_diet_plans, gym_body_measurements, gym_timings, gym_friend_invites, gym_plus_settings, gym_report_requests, gym_terms_acceptance, entry_machines, gym_alert_settings.

## Counts
- 41 reader rows: 21 readers, 20 not-a-reader (17 writes, 3 demo stand-ins).
- All 24 entity ids already exist in entities.json; none written here.

## Notes on choices
- A write whose answer is the refreshed row or view (member_join_offer, owner_assign_trainer, owner_add_person, owner_add_stock, owner_accept_terms) = not-a-reader; the reason says what comes back.
- member_offer_days = reader (count): it reads the member's joining row (daily send limit, window) to decide what to count, and returns the progress (0025_workout_offer.sql:584-641).
- member_friend_invite = reader (screen): it makes the invite if there is none, then returns the code and the joined count.
- member_copy_get = "job" (the phone's restore of its cloud copy, page by page; closest allowed kind).
- member_plus_lock = "screen" (a gym setting the phone uses to lock paid extras; no closer kind).
- member_saw_messages writes to gym_message_seen, which has no entity row; filed under E-gym-messages as not-a-reader (same choice as A4-rpc-2 made for alert reads).

## Seen in passing
- gym_message_seen has no entity row in entities.json (written by member_saw_messages, 0025_workout_offer.sql:781). Not written here: it is not one of this item's tables.

## Could not check
- Definitions read in this pass: member_join_offer, member_offer_days, member_leave_offer, owner_assign_trainer, owner_add_stock, owner_add_person, owner_accept_terms. For the other functions the read/write label is the one A4-rpc-2 recorded from the newest definition; not re-read.
- Which phone or panel screen each wrapper finally feeds: reader_kind was decided from the wrapper, its comment and the function's answer, not by following to the screen.
- No database query was run.
