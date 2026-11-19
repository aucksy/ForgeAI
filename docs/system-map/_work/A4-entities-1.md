# A4-entities-1 checkpoint

One list from four checkpoint files (A4-rpc-1..4): 62 names without repeats = 43 tables + 2 storage buckets to write, 17 already in entities.json, 0 not found (1 name was not a table).

## Finished units (rows appended to _work/out/A4-entities-1.jsonl at the same time)
- tables 1-10 done, rows written: E-entry-machines, E-gym-report-requests, E-hq-grants, E-gym-auto-reminders, E-gym-web-push, E-member-push-tokens, E-gym-challenges, E-gym-wods, E-gym-ai-questions, E-gym-friend-referrals
- tables 11-20 done, rows written: E-gym-pages, E-gym-ai-tasks, E-member-items, E-offer-members, E-gym-plus-settings, E-gym-friend-invites, E-entry-machine-members, E-entry-machine-punches, E-entry-machine-commands, E-member-push-notes
- tables 21-30 done, rows written: E-gym-groups, E-gym-exercise-starts, E-gym-trainer-members, E-gym-terms-acceptance, E-gym-alert-settings, E-gym-machine-setup, E-gym-phone-links, E-app-config, E-entry-machine-strangers, E-gym-page-asks
- tables 31-40 done, rows written: E-gym-page-reports, E-gym-access-log, E-db-read-log-state, E-push-jobs, E-gym-ai-member-rules, E-gym-challenge-hits, E-gym-owner-keys, E-gym-page-photo-slots, E-gym-receipts, E-gym-signin-codes
- tables 41-45 done, rows written: E-gym-trainer-profiles, E-photo-tickets, E-gym-self-joins, E-gym-logos, E-product-photos

## Skipped: already there (17)
- gym_staff_pins: skipped: already there (E-gym-staff-pins)
- gym_sessions: skipped: already there (E-gym-sessions)
- gym_staff: skipped: already there (E-gym-staff)
- gym_plan_requests: skipped: already there (E-gym-plan-requests)
- trainer_questions: skipped: already there (E-trainer-questions)
- gym_offers: skipped: already there (E-gym-offers)
- gym_messages: skipped: already there (E-gym-messages)
- shop_products: skipped: already there (E-shop-products)
- gym_diet_plans: skipped: already there (E-gym-diet-plans)
- gym_body_measurements: skipped: already there (E-gym-body-measurements)
- gym_timings: skipped: already there (E-gym-timings)
- gym_alerts: skipped: already there (E-gym-alerts)
- gym_member_board: skipped: already there (E-gym-member-board)
- gym_progress_summaries: skipped: already there (E-gym-progress-summaries)
- mettleup_payments: skipped: already there (E-mettleup-payments)
- crm_records: skipped: already there (E-crm-records)
- profiles: skipped: already there (E-profiles)

## Not written
- "local key state.profile.name (phone)" from A4-rpc-4: apps/mobile/src/shop/MateProfileScreen.tsx:118 is a text line that shows the mate's name (MATE_WORDS.from(state.profile.name)); it is screen state, not a table or a storage key. The data behind it is E-gym-mate-profiles, which is already there. No entity row.

## Choices made
- gym_report_files (the report file itself) is not in any list; it is named in "stored" of E-gym-report-requests so it is not lost.
- offer_members got its own row (E-offer-members) because its id was not in entities.json; A4-rpc-4 filed two of its candidates under E-gym-offers.
- The two storage buckets got ids E-gym-logos and E-product-photos (the ids A4-rpc-4 used).
- "personal" = yes when the table holds a member link, a phone number, a person's name (staff names too) or a device address tied to a person.
- visible_to is taken from the names of the database functions that touch each table in supabase/migrations (owner_ = owner and usually desk, member_ = member, hq_ = HQ, gate_ = the entry-machine worker). Every table here has row security on and no direct grants, except member_items (a member may read own rows directly).
- retention is written only where a delete line or a file comment states it.

## Seen in passing
- supabase/migrations/0058_entry_machines.sql:17 says every punch is kept and no delete of entry_machine_punches exists in any migration: door punches (member, time) pile up with no end date.
- supabase/migrations/0080_gym_page.sql:100-105 and 0077_self_join.sql:63-69: phone numbers left on the public gym page and the online join page (gym_page_asks, gym_self_joins) have no delete line in any migration.
- supabase/migrations/0076_panel_web_push.sql:33 allows push addresses of Chrome, Firefox, Safari and Windows only; a browser with another push company cannot turn alerts on (may be intended).

## Could not check
- Whether the live database matches the migration files (no database query in this step).
- Who really sees each table: function bodies and guards were not read one by one; visible_to for gym_page_reports is "unknown" (only a writer was found).
- Whether gym_ai_tasks.request, gym_receipts.details and gym_page_reports.details hold personal data (free text / JSON): "unknown".
- Later "alter table" lines were searched for every table; only the ones found by that search are in the evidence.

## Status
DONE: 45 entity rows written, 17 skipped as already there, 0 tables not found.
