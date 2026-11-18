# A2-server-database-2 checkpoint

Output: docs/system-map/_work/out/A2-server-database-2.jsonl (34 rows, F-server-400 to F-server-433)

## Finished units
- [x] 1. Source list read (293 lines). All 293 item ids done; 0 left.
- [x] 2. Code opened: the header comment of every migration 0034 to 0062 (the first 22 to 60 lines of each, where each file states what it stores, who may call each function and whether it is applied live); 0062_plan_features.sql lines 1-215 in full; 0048 lines 436-467; 0056 lines 150-175. About 1,350 code lines read (limit 2,500).
- [x] 3. Switches and plan gates noted (below)
- [x] 4. Items grouped into 34 features
- [x] 5. Rows written; a script confirmed all 293 source ids are in at least one row, every row parses, every entry line exists
- [x] 6. No not-a-feature rows: every private helper (_name), table and trigger was put with the feature it serves

Units by migration, all done: 0034 0035 0036 0037 0038 0039 0040 0041 0042 0043 0044 0045 0046 0047 0048 0049 0050 0051 0052 0053 0054 0055 0056 0057 0058 0059 0060 0061 0062

## Switches and plan gates met
- plan_gate (app_config row, value {"on": false}) = server half of PLAN_GATE_ON: supabase/migrations/0062_plan_features.sql:56. While off, gym_has_feature answers true for everything (0062:103).
- Pro extras in plan_features: branding, shop, challenge, workoutOffer, trainerPlans, yourNumbers (0062:74-77). Server triggers: shop_products, shop_orders, gym_challenges, gym_offers, gym_diet_plans, gym_body_measurements (0062:133-150), gyms brand columns (0062:171), crm_records workout_plan (0062:191).
- Gym states when unpaid: active, grace (7 days), basic (30 more days), read_only (0062:80-91).
- Busy machines: per-gym owner switch, off by default (0049 header lines 13-15).
- Member phone switches: "show my name" (0037), "Messages from my gym" (0038), "Let my gym mates see my workouts", off by default (0040), "Share my workouts with my trainers", on by default (0050).
- friendRewardDays on the gym details record, 0 or empty = off (0056 header lines 43-45).
- phone_code_settings row and signup_check_required, off (0061 header lines 15-17, 34-35).
- Payment details row empty = "payment is not available yet" (0060 header lines 13-17).

## Could not check
- Function bodies were not read one by one (size limit): feature names, roles and status come from each file's own header comment plus the function names. A row may miss a behaviour that only the body shows.
- "Live" = the file's header says APPLIED LIVE. Not checked against the live database (no database reads in this step). Headers of 0046, 0058, 0059, 0060, 0061, 0062 say NOT APPLIED; whether they were applied later is unknown.
- Tier for entry machines (0058, 0059): unknown, no gate seen in this area.
- Functions defined in these files but absent from my source list because a later migration redefines them (other helper's area): member_board, owner_save_challenge (0091), member_ask_trainer (0074), apply_gym_payment (0063), hq_mettleup_payments (0064), _challenge_results, owner_challenges, owner_people, friend_invite_send.

## Seen in passing
- 0043_member_photos.sql:1-2 and 0045_report_requests.sql:1-2: header says the live code was "not yet compared with this file (a read of the live server was blocked)".
- 0062_plan_features.sql:184: in the 'basic' state every crm_records kind except member, membership, payment, visit is refused (PLAN_BASIC). Bring a friend writes an 'enquiry' row (0056 header lines 32-40), so a friend's public form for a gym in 'basic' may fail with a raw error once the gate is on. Not verified in the function body.
- 0062_plan_features.sql:42-44: messages to members are not gated in basic or read-only ("Not yet"); stated as a known gap in the file.
- 0061_phone_codes.sql header lines 36-37: with signup_check_required on, the device QA runs that create gyms without a code would get PHONE_CHECK.
- 0034 header lines 54-56 with 0061: re-running 0034 puts back its older gym_create_online; order of re-runs matters (0034 then 0061).
