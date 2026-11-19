# A4-rpc-4 checkpoint

Source: docs/system-map/_sources/readers-raw.txt lines 1030-1163 (39 groups, 57 candidates).
Output: docs/system-map/_work/out/A4-rpc-4.jsonl (12 entity rows, 46 reader rows).

## Finished groups (all 39 looked at)
- groups 1-10 done: owner_set_trainer, owner_sign_out_person, owner_stop_offer, owner_talk_count, owner_talk_done, owner_talk_list, owner_talk_reply, owner_terms (left out), owner_test_alert (left out), owner_trainer_members (left out)
- groups 11-20 done: owner_trainer_schedule, owner_trainer_setup, owner_undo_reward, owner_web_push_on (left out), owner_withdraw_diet_plan, owner_withdraw_message, page_chat_ask, page_chat_contact, page_chat_reply, phone_code_has_account
- groups 21-30 done: phone_sign_in_find (left out), self_join_pay_gym, self_join_preview, self_join_send (left out), staff_give_reward, staff_key_status, staff_me, staff_pin_status, staff_reset_pin_with_proof, staff_set_pin
- groups 31-39 done: staff_sign_in, staff_sign_out, storage gym-logos (left out), storage gym-page-photos, storage PHOTO_BUCKET (left out), table gyms, table member_summary, table profiles (left out), table state.profile.name (left out)

## Entity rows written (12, the limit)
E-gym-trainers, E-gym-sessions, E-gym-offers, E-gym-talk-threads, E-gym-diet-plans, E-gym-messages, E-gym-page-chats, E-gym-staff, E-gym-staff-pins, E-gyms, E-member-summary, E-gym-page-photos

## Entity rows still to write (10 entities, 11 candidates left without a reader row)
- E-gym-terms-acceptance (table gym_terms_acceptance, supabase/migrations/0033_terms_acceptance.sql): owner_terms | apps/dashboard/src/crm/auth/terms.ts:79
- E-gym-alerts (table gym_alerts; function in supabase/migrations/0095_test_alert.sql:109): owner_test_alert | apps/dashboard/src/crm/shop/webPushApi.ts:179
- E-gym-progress-summaries (table gym_progress_summaries, supabase/migrations/0050_trainer_view.sql; kept 90 days, line 252): owner_trainer_members | apps/dashboard/src/crm/demo/demoServer.ts:456 and apps/dashboard/src/crm/shop/trainerApi.ts:49
- E-gym-web-push (table gym_web_push, supabase/migrations/0076_panel_web_push.sql:116): owner_web_push_on | apps/dashboard/src/crm/shop/webPushApi.ts:106
- E-crm-records (table crm_records; function supabase/migrations/0093_phone_sign_in.sql:35): phone_sign_in_find | apps/mobile/src/shop/gymApi.ts:701
- E-gym-self-joins (table gym_self_joins; function supabase/migrations/0089_trial_alert_words.sql:20, a writer): self_join_send | deploy/panel/selfJoin.js:146
- E-gym-logos (storage bucket gym-logos): apps/dashboard/src/crm/brand/logoUpload.ts:206
- E-product-photos (storage bucket product-photos, supabase/migrations/0004_product_photos.sql:16): apps/dashboard/src/crm/shop/photoUpload.ts:96 (PHOTO_BUCKET here is 'product-photos' from shop/photo.ts:16, not gym-page-photos; an upload, so not-a-reader)
- E-profiles (table profiles, supabase/migrations/0001_init.sql:23): apps/dashboard/src/hooks/useGymData.ts:39
- local key state.profile.name (phone): apps/mobile/src/shop/MateProfileScreen.tsx:118 (not opened; the script's ".from(" hit is likely not a table call)

## Choices made
- owner_trainer_schedule and owner_trainer_setup are filed under E-gym-trainers (they also read gym_pt_bookings, gym_trainer_profiles, gym_trainer_members: no entity row for those).
- owner_undo_reward / staff_give_reward are filed under E-gym-offers (the row they change is in offer_members, named in that entity's "stored").
- staff_me is filed under E-gym-staff (it also reads gyms and bumps gym_sessions.last_seen_at).
- A function that writes and hands back the changed row is not-a-reader. Demo stand-ins (demoServer.ts) are not-a-reader.
- Server-side lookups at request time (phoneCode.js, joinPay.js, aiMatch.js, pay.js) are "job": the closest allowed kind.

## Seen in passing
- owner_talk_list and owner_talk_count (reads the panel calls on every open) also delete threads older than 180 days; owner_trainer_members deletes progress summaries older than 90 days. Reading a list is what triggers the clean-up (supabase/migrations/0069_member_messages.sql:306, 0050_trainer_view.sql:252).
- apps/dashboard/src/hooks/useGymData.ts:56-63 reads gyms, member_summary and profiles straight from the tables with the old auth-user model (profiles.role owner/trainer), still wired into apps/dashboard/src/App.tsx:20, beside the newer key-based crm code. Not checked whether that screen is still reachable.

## Could not check
- Retention for 9 of the 12 entities: no file line found in the 100-line reads ("unknown").
- Whether offer and diet-plan rows count as personal data (they hold a staff name only): "unknown".
- _trainer_setup_view, _offer_give, _talk_visible bodies were not read (helper functions; not needed to place the callers).
