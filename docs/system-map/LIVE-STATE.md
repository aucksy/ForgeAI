# What is really live (MettleUp)

One row per feature: is it in the code on main, in the live web app (gym panel or HQ), on the live database,
and in the Play app. Each H5 helper adds ONE section for its own area below; never rewrite another section.

Words: **yes** = proved live; **off** = in the code but switched off live; **n/a** = that part does not exist for
this feature; **unknown** = could not be proved (reason in the notes).

## Whole-system facts (read 2026-11-25)

| Thing | Live | Proof |
|---|---|---|
| Gym database: migration history | Holds one row (0098). Most files were pasted in by hand, so the list proves little. | Supabase list_migrations; docs/system-map/_sources/live-state-facts.md:8-18 |
| Gym database: files 0058, 0059, 0060, 0063, 0064, 0071, 0072, 0097, 0098 | **Live**, though the first line of most of them says "not applied" | catalog read 2026-11-25: entry_machines, owner_add_entry_machine, _mettleup_extend, gym_payment_ledger, _billing_on, hq_billing_checks, _ai_balance, gym_ai_credit_ledger, _plan_word, db_direct_reads, hq_db_reads present |
| Gym database: files 0046, 0091, 0092, 0094 | **Not live** | catalog read 2026-11-25: member_gym_pack, _challenge_checkin_days, member_join_day, page_chat_ask, gym_page_chats all absent |
| Gym database: every function HQ calls (53) | **All present** | catalog read 2026-11-25 (hq_* function list) against the names in deploy/hq/*.js |
| Small web database (Cloudflare D1 forgeai-web) | unknown per file; 0013 proved live by a public answer; 0016 marked live | no live read possible from here (no wrangler on this laptop); live-state-facts.md:54-76 |
| HQ (hq.mettleup.fit) | Put live by hand, no version label; public files match main; app pages behind Google sign-in not compared | machine live-state.csv; .github/workflows/ci.yml:158-160 (tests only, no deploy) |
| HQ online plan buying (BILLING) | **Off**: no BILLING setting in the HQ server settings | deploy/hq/wrangler.jsonc:56-72; deploy/hq/api.js:98-100 |
| Gym panel switches | gymPages off, joinPay off, aiCharge on, pageAi off | public /api/switches, 2026-11-19 (live-state-facts.md:88) |
| Play app | production 0.77.0; internal 0.79.0; main 0.79.0 | machine live-state.csv (Play Console read 21 Nov) |

## HQ (surface hq, area hq/app) — 33 features, written by H5-hq-app on 2026-11-25

HQ has no Play app and no gym-panel part, so the "Play app" column is n/a for every row. "Live HQ" = the HQ
server and page; its exact build could not be compared with main (finding FN-H5-hq-app-01), so "yes" there means
"in main, and every database part it needs is live".

| Feature | Main | Live HQ | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-hq-100 Menu and page frame | yes | yes | n/a | n/a | |
| F-hq-101 Needs you list | yes | yes | yes | n/a | payments part needs 0060 (live) |
| F-hq-102 Needs you sound and pop-up | yes | yes | n/a | n/a | browser side only |
| F-hq-103 Read-log warning line | yes | yes | yes | n/a | 0097 live (db_direct_reads, hq_db_reads present); the logs key is a secret, not checked |
| F-hq-104 All gyms list | yes | yes | yes | n/a | hq_gyms present |
| F-hq-105 Gyms with branches | yes | yes | yes | n/a | hq_groups present |
| F-hq-106 Export gyms as CSV | yes | yes | yes | n/a | |
| F-hq-107 Make a gym by hand | yes | yes | yes | n/a | hq_create_gym present |
| F-hq-108 One gym's page | yes | yes | yes | n/a | hq_gym present |
| F-hq-109 Change free trial end | yes | **yes** (listed "behind switch") | yes | n/a | its switch waits for 0030, which is live: FN-H5-hq-app-02 |
| F-hq-110 Set plan by hand | yes | **yes** (listed "behind switch") | yes | n/a | same as above |
| F-hq-111 Gym status | yes | yes | yes | n/a | hq_set_gym_status present |
| F-hq-112 New owner sign-in code | yes | yes | yes | n/a | hq_reset_owner_signin present |
| F-hq-113 Sign a gym out everywhere | yes | yes | yes | n/a | hq_sign_out_gym present |
| F-hq-114 AI column matching limit | yes | yes | unknown | n/a | lives in the small web database (D1) |
| F-hq-115 AI Assistant credits | yes | **yes** (listed "behind switch") | yes | n/a | switch waits for 0071, which is live: FN-H5-hq-app-02 |
| F-hq-116 AI Assistant daily limit | yes | unknown | unknown | n/a | waits for D1 file 0015 (first line "not applied"; update notes say live 13 Nov); not provable from here |
| F-hq-117 Gym web page on/off | yes | yes | yes | n/a | works, but gym web pages are switched off for everyone (gymPages off), so it changes nothing visible yet |
| F-hq-118 Support access | yes | yes | yes | n/a | hq_open_emergency, hq_end_access, hq_gym_records present |
| F-hq-119 Sign-in history | yes | yes | yes | n/a | hq_access_log present |
| F-hq-120 System page | yes | yes | yes | n/a | Cloudflare figures need a secret token, not checked |
| F-hq-122 Feedback inbox | yes | yes | unknown | n/a | D1 0001 (no applied line) |
| F-hq-123 Reply to feedback | yes | yes | unknown | n/a | D1 0009 marked live 9 Nov; phone pop-up part not checked |
| F-hq-124 English helper | yes | unknown | n/a | n/a | needs the Gemini key on the HQ server (secret, not readable) |
| F-hq-125 Leads | yes | yes | unknown | n/a | D1 0002 (no applied line) |
| F-hq-126 Delete requests | yes | yes | yes | n/a | hq_delete_requests present |
| F-hq-127 Delete a gym for ever | yes | yes | yes | n/a | hq_delete_gym present |
| F-hq-128 Messages to every gym | yes | unknown | unknown | n/a | waits for D1 file 0006 (no applied line); panel update notes describe "From MettleUp" bell group as live |
| F-hq-129 Payments to MettleUp | yes | **yes** (listed "behind switch") | yes | n/a | switch waits for 0060, which is live: FN-H5-hq-app-02 |
| F-hq-130 Online payments to check | yes | **off** | yes | n/a | 0063 and 0064 are live, but HQ has no BILLING setting, so the card stays away |
| F-hq-131 Your payment details | yes | yes | yes | n/a | hq_payment_details present |
| F-hq-132 Log | yes | yes | yes | n/a | hq_audit_list present |
| F-hq-133 Install HQ on the phone | yes | yes | n/a | n/a | offline page and install file match main byte for byte (except line endings) |

## H5-panel-assistant (surface panel, area panel/assistant) — 18 features, written by H5-panel-assistant on 2026-11-25

The AI Assistant is for gym owners in the web panel only, so the "Play app" column is n/a for every row.
"Live panel" = the panel build at app.mettleup.fit, which matches the newest green build of main (machine
live-state.csv, panel row; no panel page change since). The feature list marks all 18 "behind switch", but every
part of that switch is live: the gym database holds all 11 functions the assistant calls (catalog read 2026-11-25:
owner_ai_wallet, owner_ai_spend, owner_ai_refund, owner_ai_task_save, owner_ai_tasks, owner_ai_questions,
owner_ai_member_rules, owner_save_ai_member_rules, owner_ai_status, ai_question_take, ai_question_back), the panel
server answers "Sign in first" (not "switched off") on /api/assist, /assist/voice, /assist/plan and /assist/rewrite
(public probe 2026-11-25, so its AI key is set: deploy/panel/assist.js:519-528), and aiCharge is on (/api/switches
2026-11-25). So the assistant is live, as What's new told owners on 13 Nov (apps/dashboard/src/crm/logic/whatsNew.ts:237-253);
the "behind switch" mark is stale (FN-H5-hq-app-02, same fault). One part stays **unknown**: each question also needs the
small web database's usage tables (files 0003, 0004, 0015, first lines say "not applied"); if one is missing every ask is
refused as "off" and the assistant hides itself (deploy/panel/assist.js:548-572; ui/useConversation.ts:43). That
database cannot be read from here (FN-L14-server-panel-worker-02).

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-900 Open the AI Assistant | yes | **yes** (listed "behind switch") | yes | n/a | shows once owner_ai_wallet answers (present) |
| F-panel-901 Ask a question, get an answer card | yes | yes | yes | n/a | gym DB parts present; web usage table 0015: unknown |
| F-panel-902 Send a message by asking | yes | yes | yes | n/a | owner_ai_spend / refund / task_save present; ask step needs 0015 (unknown) |
| F-panel-903 Save a change by asking | yes | yes | yes | n/a | same as 902 |
| F-panel-904 AI writes a workout plan | yes | yes | yes | n/a | in-code switch on (ui/AssistantHome.tsx:32); /api/assist/plan answers |
| F-panel-905 Diet plan request answer | yes | yes | n/a | n/a | browser only |
| F-panel-906 Speak a request | yes | yes | n/a | n/a | /api/assist/voice answers; the speech key (Sarvam or Groq) is a secret, not checked: unknown |
| F-panel-907 AI credits sheet | yes | yes | yes | n/a | owner_ai_wallet, owner_ai_tasks present |
| F-panel-908 AI answers for members switch and limit | yes | yes | yes | n/a | 0083 functions present; aiCharge on |
| F-panel-909 AI questions this month | yes | yes | yes | n/a | owner_ai_questions (0078) present |
| F-panel-910 Daily question allowance | yes | yes | unknown | n/a | count lives in the small web database (0003/0004/0015): cannot be read from here |
| F-panel-911 Today for you ideas | yes | yes | n/a | n/a | worked out in the browser |
| F-panel-912 AI Assistant card on Today | yes | yes | yes | n/a | shown with the wallet |
| F-panel-913 History of past AI tasks | yes | yes | yes | n/a | owner_ai_tasks present |
| F-panel-914 Try saying examples | yes | yes | n/a | n/a | browser only |
| F-panel-915 Helper cards | yes | yes | n/a | n/a | browser only |
| F-panel-916 Find the member named | yes | yes | n/a | n/a | browser only |
| F-panel-917 Phone and email masked before the AI | yes | yes | n/a | n/a | browser only, before the server is asked |

## H5-panel-auth-data (surface panel, area panel/auth-data) — 30 features, written by H5-panel-auth-data on 2026-11-25

Sign-in, staff, terms, support access and the gym's records store, all in the web panel, so the "Play app" column is
n/a for every row. "Live panel" = the build at app.mettleup.fit: its script and style names (index-fj5xgbKr.js,
index-Bnm1IIYj.css) were read again on 2026-11-25 and still match the newest green build of main, and nothing under
apps/dashboard/src changed on main since (machine live-state.csv, panel row). "Live DB" = every gym-database function
the feature calls is in the live grant list (machine db-security.json routine_grants, read 2026-11-20): all 25 that
this area calls are there (crm_pull, crm_push, staff_sign_in, staff_me, staff_sign_out, staff_key_status,
staff_pin_status, staff_set_pin, staff_reset_pin_with_proof, gym_create_online with its PIN, terms and WhatsApp-proof
inputs, owner_go_online, owner_retire_key, owner_people, owner_add_person, owner_set_person_job, owner_remove_person,
owner_make_signin_code, owner_sign_out_person, owner_terms, owner_accept_terms, owner_hq_access, owner_hq_grant,
owner_hq_end, _phone_sig_ok). WhatsApp checks: public /api/phone-code/status answered available, mode "inbound" on
2026-11-25, so "Verify with WhatsApp" is on; the older "we send you a code" way is not offered while it is
(deploy/panel/phoneCode.js:244-245). The two features listed "behind switch" (1002, 1003) are therefore live; the
mark is stale (same fault as FN-H5-hq-app-02). Side note for the whole-system table: /api/switches answered
joinPay **true** on 2026-11-25 (main now sets JOIN_PAY "live": deploy/panel/wrangler.jsonc:92), so the "joinPay off"
line above dates from 19 Nov.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-1000 Sign in (mobile + PIN or code) | yes | yes | yes | n/a | staff_sign_in present |
| F-panel-1001 Set up a new gym online | yes | yes | yes | n/a | gym_create_online takes PIN, terms and WhatsApp proof live |
| F-panel-1002 Verify mobile with WhatsApp | yes | **yes** (listed "behind switch") | yes | n/a | status = inbound on 25 Nov; the "type a code we send" way is off while inbound is on |
| F-panel-1003 Forgot PIN by WhatsApp | yes | **yes** (listed "behind switch") | yes | n/a | staff_reset_pin_with_proof present; inbound on |
| F-panel-1004 Other ways back in | yes | yes | yes | n/a | owner_make_signin_code present; "email MettleUp" is a plain mail link |
| F-panel-1005 Set or change my PIN | yes | yes | yes | n/a | staff_pin_status, staff_set_pin present |
| F-panel-1006 One-time set-your-PIN prompt | yes | yes | yes | n/a | browser side, uses staff_pin_status |
| F-panel-1007 Staff & sign-in screen | yes | yes | yes | n/a | owner_people present |
| F-panel-1008 Add a person | yes | yes | yes | n/a | owner_add_person present |
| F-panel-1009 Name a staff member's job | yes | yes | yes | n/a | owner_set_person_job (0079) present, so jobs save on the server; the "kept on this browser" fallback no longer runs live |
| F-panel-1010 Make a sign-in code | yes | yes | yes | n/a | owner_make_signin_code present |
| F-panel-1011 Sign a person out everywhere | yes | yes | yes | n/a | owner_sign_out_person present |
| F-panel-1012 Remove a person | yes | yes | yes | n/a | owner_remove_person present |
| F-panel-1013 Sign out of this device | yes | yes | yes | n/a | staff_sign_out present; the rest is browser side |
| F-panel-1014 Told why you were signed out | yes | yes | yes | n/a | staff_key_status (0022) present |
| F-panel-1015 Put your records online | yes | yes | yes | n/a | owner_go_online, owner_retire_key, crm_push present |
| F-panel-1016 Agree to terms | yes | yes | yes | n/a | owner_terms, owner_accept_terms, _terms_versions present; which version is live not read (no SQL allowed in this run) |
| F-panel-1017 MettleUp access | yes | yes | yes | n/a | owner_hq_access, owner_hq_grant, owner_hq_end present |
| F-panel-1018 Staff limits | yes | yes | yes | n/a | screen side in the panel; server refusals ride on crm_push |
| F-panel-1019 Gym's records online | yes | yes | yes | n/a | crm_pull, crm_push present |
| F-panel-1020 Gym kept in this browser only | yes | yes | n/a | n/a | browser only |
| F-panel-1021 Demo copy of the gym | yes | yes | n/a | n/a | page memory only |
| F-panel-1022 Offline front desk (saved copy) | yes | yes | n/a | n/a | copy kept on the device |
| F-panel-1023 Offline waiting list | yes | yes | yes | n/a | sends through crm_push; 0041 (offline receipts) first line says applied live 30 Oct |
| F-panel-1024 Import preview | yes | yes | n/a | n/a | worked out in the browser |
| F-panel-1025 Mark a person as trainer | yes | yes | yes | n/a | owner_trainer_setup and owner_set_trainer (0050) present |
| F-panel-1101 Sign-in group (all of the above) | yes | yes | yes | n/a | |
| F-panel-1102 Staff & sign-in group | yes | yes | yes | n/a | |
| F-panel-1103 Gym records store group | yes | yes | yes | n/a | |
| F-panel-1136 Demo gym at /demo | yes | yes | n/a | n/a | page memory, no network |

## H5-panel-brand-shell (surface panel, area panel/brand-shell) — 2 features, written by H5-panel-brand-shell on 2026-11-26

"Live panel" = the build at app.mettleup.fit read on 2026-11-26: its script is now index--GfMsOId.js (the style
index-Bnm1IIYj.css is unchanged), so the panel was deployed again after the 25 Nov reading. That live script holds both
branding What's new lines ("takes the box off", "suggests a gym colour from your logo") and the gym-logos upload
folder, so both features are in the live panel. "Live DB" = owner_gym, owner_set_brand and owner_photo_ticket are in the
live grant list, and the gym-logos folder's upload rule is live (machine db-security.json, read 2026-11-20).
Branding is meant to be Pro only, but the plan switch is off in the panel (packages/theme/src/plans.ts:40), so every
gym, Starter too, gets it (already finding FN-A3-website-1-07). The server's own plan switch (0062, live) could not be
read here; if it were on while the panel's stays off, a Starter gym's Save would be refused. Unknown.
The member app shows the gym's name and colours since 0.54.0 (apps/mobile/src/lib/whatsNew.ts:528-532), so Play
production 0.77.0 has it.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-1105 Branding: logo, colours, logo upload, remove logo background, phone and shortcut preview | yes | yes | yes | yes (member app shows the look since 0.54.0) | Pro switch off, so open to every gym (FN-A3-website-1-07); server plan switch value unknown |
| F-panel-3101 Branding: suggest a gym colour from the logo | yes | yes | n/a | n/a | worked out in the browser; line found in the live script |

## H5-panel-forms (surface panel, area panel/forms) — 25 features, written by H5-panel-forms on 2026-11-26

The member, sale, payment, freeze, start-date and cancel-receipt sheets of the web panel, so "Play app" is n/a for
every row. "Live panel" = the build at app.mettleup.fit read on 2026-11-26 (script index--GfMsOId.js): every long
on-screen sentence of the six sheets on main (32 of 32) is in that live script, so the live panel runs these sheets as
they are on main. "Live DB" = the sheets save through crm_push / crm_pull, and the desk photo through
owner_member_photos, owner_save_member_photo and owner_remove_member_photo; all are in the live grant list (machine
db-security.json routine_grants, read 2026-11-20). The every-branch tick needs 0031 (live by dependency) and pass
members need 0055 (first line: applied live). Two of the three "behind switch" marks are conditions, not switches:
the desk camera shows whenever the gym is online and the photo function answers (it is live), and "train at every
branch" shows whenever a gym has 2 or more branches (same stale-mark fault as FN-H5-hq-app-02). Online payment:
the UPI QR needs only the gym's UPI ID; payment links run in test mode only (PAY_LIVE "off" on main; the live value
is not on any public page), and What's new says so honestly. Online-payment storage (small web database files 0011,
0016) is marked applied live but cannot be read from here.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-400 Change a future start date | yes | yes | yes | n/a | saves through crm_push |
| F-panel-401 Collect a payment against dues | yes | yes | yes | n/a | crm_push |
| F-panel-402 Take the money online (UPI QR, payment link) | yes | **partly**: UPI QR yes; links test mode only | unknown (small web database 0011/0016 not readable) | n/a | PAY_LIVE off on main; no real money moves |
| F-panel-403 Close open online links before the desk takes the money | yes | yes | unknown (small web database) | n/a | runs only for gyms with a link open |
| F-panel-404 Freeze or add extra days | yes | yes | yes | n/a | crm_push |
| F-panel-405 Gift reward days from the workout offer | yes | yes | yes | n/a | 0025 workout offer: first line applied live |
| F-panel-406 Add a member | yes | yes | yes | n/a | crm_push |
| F-panel-407 Edit a member | yes | yes | yes | n/a | crm_push |
| F-panel-408 Add from an enquiry or join page, filled in | yes | yes | yes | n/a | join page itself is off (GYM_PAGES off); enquiry route live |
| F-panel-409 Desk camera photo while adding | yes | **yes** (listed "behind switch") | yes | n/a | photo functions present; shows only on Add, online |
| F-panel-410 Put a member in a batch | yes | yes | yes | n/a | crm_push |
| F-panel-411 Comes with a pass | yes | yes | yes | n/a | 0055 applied live |
| F-panel-412 Train at every branch | yes | **yes** for gyms with 2+ branches (listed "behind switch") | yes | n/a | 0031 live by dependency |
| F-panel-413 Mobile already used: who has it | yes | yes | yes | n/a | crm_push duplicate answer |
| F-panel-414 Sell a membership | yes | yes | yes | n/a | crm_push |
| F-panel-415 Renew a membership | yes | yes | yes | n/a | crm_push |
| F-panel-416 Sell or renew a PT pack | yes | yes | yes | n/a | crm_push |
| F-panel-417 Part payment, rest as dues | yes | yes | yes | n/a | crm_push |
| F-panel-418 Ask once on an unusual price or date | yes | yes | n/a | n/a | worked out in the browser |
| F-panel-419 Front desk money limits | yes | yes | yes | n/a | server rules 0019/0021 (base files, no applied line) |
| F-panel-420 Receipt records who took the money | yes | yes | yes | n/a | 0019 taker |
| F-panel-421 Keep taking payments offline | yes | yes | yes | n/a | 0041 first line applied live 30 Oct |
| F-panel-422 No plans yet: what to do | yes | yes | n/a | n/a | browser only |
| F-panel-423 Cancel a receipt with a reason | yes | yes | yes | n/a | crm_push |
| F-panel-512 Sell/renew/freeze/change start/cancel group | yes | yes | yes | n/a | |

## H5-panel-logic-1 (surface panel, area panel/logic-1) — 36 features, written by H5-panel-logic-1 on 2026-11-26

The web panel's own rules for import, the bell, Today, members, money, plans for members and settings. "Live panel" =
the build at app.mettleup.fit read on 2026-11-26 (script index--GfMsOId.js, unchanged since the H5-panel-forms read):
the long on-screen sentences of these 36 files on main are in that live script (the only misses are code and comment
fragments), with one exception: the "your MettleUp plan has ended" banner's words are not in it at all, because the
plan switch is off on main (packages/theme/src/plans.ts:40) and the build drops the banner. "Live DB" = every
gym-database function these screens call is in the live grant list (machine db-security.json routine_grants, read
2026-11-20). Public probes on 2026-11-26: POST /api/ai/match-columns with no sign-in answered 401 "Sign in first",
not 503 "not switched on", so the AI key and the small web database link are set (deploy/panel/aiMatch.js:722-731);
/api/switches answered joinPay true, aiCharge true; /api/hq-news answered with one message, a leftover test
("Test HQ to Admin Message", 31 Oct) that every gym's bell shows (finding FN-H5-panel-logic-1-01).
Three "behind switch" marks are stale: AI import (key live), Ask a trainer (its functions are live; the "not switched
on" words show only when they are missing) and Busy machines (an owner's own setting, not a launch switch). Same fault
as FN-H5-hq-app-02. Paying MettleUp online stays off: HQ has no BILLING setting (live-state-facts.md), and the
database switch value (app_config billing_checkout) is not readable here. "Play app" = member-app side, from the
member app's What's new; Play production is 0.77.0.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-600 Import members from Excel/CSV | yes | yes | yes | n/a | saves through crm_push |
| F-panel-601 AI column matching for import | yes | **yes** (listed "behind switch") | yes | n/a | probe 401 = key and link set; daily count in small web database not readable |
| F-panel-602 Import into several branches | yes | yes | yes | n/a | 0031 live by dependency |
| F-panel-603 Aadhaar/PAN left out of import | yes | yes | n/a | n/a | worked out in the browser |
| F-panel-604 Notification bell to-do list | yes | yes | yes | n/a | owner_alerts, owner_alert_list, owner_alerts_read, owner_alert_remove present; 0098 on the live list |
| F-panel-605 Latest from your members (handled drop off) | yes | yes | yes | n/a | owner_alert_opened present |
| F-panel-606 Ask a trainer: read and reply | yes | **yes** (listed "behind switch") | yes | unknown | owner_questions, owner_answer_question present; member side member_ask_trainer present; no member What's new line names the version |
| F-panel-607 Attendance and Away list | yes | yes | yes | n/a | crm_pull records |
| F-panel-608 Choose who gets a message | yes | yes | yes | yes | owner_send_message present |
| F-panel-609 Automatic reminders | yes | yes | yes | n/a | owner_auto_reminders, owner_save_auto_reminders present |
| F-panel-610 Automatic birthday wish | yes | yes | yes | yes | owner_app_members present |
| F-panel-611 Batches | yes | yes | yes | n/a | crm_push |
| F-panel-612 Pay MettleUp online | yes | **partly**: UPI/bank page yes; online buy and plan-end reminder off | yes | n/a | owner_billing, owner_receipt, owner_pay_mettleup present; HQ BILLING not set; switch row unreadable |
| F-panel-613 Body measurements | yes | yes | yes | yes (Progress → Body) | owner_save_measurement present |
| F-panel-614 Your growth | yes | yes | yes | n/a | worked out from crm_pull records |
| F-panel-615 Busy machines setup | yes | **yes** (listed "behind switch") | yes | yes (Gym tab) | owner_machine_setup present; switched on per gym by the owner |
| F-panel-616 Came in today: ended, no plan, owing | yes | yes | yes | n/a | crm_pull |
| F-panel-617 Challenges and leaderboard | yes | yes | yes | yes | owner_save_challenge, owner_board present |
| F-panel-618 Check workout code | yes | yes | yes | unknown | matched in the browser; member-app version not read |
| F-panel-619 Collections and dues | yes | yes | yes | n/a | crm_pull |
| F-panel-620 Excel-safe CSV | yes | yes | n/a | n/a | browser only |
| F-panel-622 Diet plans | yes | yes | yes | yes | owner_save_diet_plan present |
| F-panel-623 Enquiries | yes | yes | yes | n/a | crm_push |
| F-panel-624 Workout plan exercise list | yes | yes | n/a | n/a | list inside the app |
| F-panel-625 Expenses | yes | yes | yes | n/a | crm_push |
| F-panel-626 Help and feedback | yes | yes | unknown | n/a | small web database (0001, 0005, 0008, 0009, 0014) not readable; /api/help/replies route answers |
| F-panel-627 Updated 20 s ago | yes | yes | n/a | n/a | browser only |
| F-panel-628 Get started card | yes | yes | yes | n/a | reads the gym's records |
| F-panel-629 GST on receipts | yes | yes | yes | n/a | crm_push |
| F-panel-630 Download all your gym's data | yes | yes | yes | n/a | crm_pull |
| F-panel-631 Request a workout report | yes | yes | yes | yes | owner_request_report, owner_report_file present |
| F-panel-632 Plan or trial ended banner | yes | **off** (words not in the live script) | yes | n/a | PLAN_GATE_ON false on main; owner_gym_state, _plan_gate_on present |
| F-panel-633 Gym timings | yes | yes | yes | yes | owner_save_gym_timings present |
| F-panel-634 Workout of the day | yes | yes | yes | yes (Workout tab) | owner_save_gym_wod present |
| F-panel-635 Home tiles | yes | yes | yes | n/a | crm_pull |
| F-panel-636 Messages from HQ in the bell | yes | yes | yes (small web database 0006 proved by the public answer) | n/a | live list holds a leftover test message |

## H5-panel-logic-2 (surface panel, area panel/logic-2) — 39 features, written by H5-panel-logic-2 on 2026-11-26

The web panel's rules for members, memberships, receipts, joining online, member messages, trainers, alerts, offers and
What's new. "Live panel" = the build at app.mettleup.fit read on 2026-11-26 (script index--GfMsOId.js): 436 of the 440
on-screen sentences in these 39 files on main are in it. The 4 misses: the two What's new entries kept back until their
switch goes on (gym web pages; MettleUp Plus lock) and one unused word the build drops. "Live DB" = every one of the 94
gym-database functions the panel calls is in the live grant list (machine db-security.json, read 2026-11-20), and each
change file these features stand on is present, except 0094 (web page chat: none of its 8 functions or its table is
live). Switches on 2026-11-26 (public /api/switches): gymPages off, joinPay on, aiCharge on, pageAi off. The members'
paid-plan switch is off on main (packages/theme/src/memberPlan.ts:28), so the Plus lock card stays hidden.
Two "behind switch" marks are stale: Member messages (0069, 0087, 0096 live) and Trainer pages (0065 live); their
"not switched on" words show only when the database lacks the functions. Same fault as FN-H5-hq-app-02.
"Play app" = the member-app side. Play production was 0.77.0 when last read (21 Nov); the panel's 25 Nov note says
0.79.0 reached production on 25 Nov (apps/dashboard/src/crm/logic/whatsNew.ts:41-42), not re-read here. Main is 0.80.0.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-3100 Mobile boxes keep 10 digits | yes | yes | n/a | n/a | worked out in the browser; the join pages too |
| F-panel-700 Import from another software | yes | yes | yes | n/a | saves through crm_push; undo import 0017 |
| F-panel-701 Joined online (make member, approve paid, free trial) | yes | yes | yes | n/a | 0077 and 0088 live; joinPay on live |
| F-panel-702 Member ID card | yes | yes | n/a | n/a | made in the browser |
| F-panel-703 Member messages | yes | **yes** (listed "behind switch") | yes | yes; "pick who reads it" needs 0.79.0 | 0069, 0087, 0096 functions live |
| F-panel-704 Member photo at the desk | yes | yes | yes | n/a | 0043 live |
| F-panel-705 Training progress for gym and trainers | yes | yes | yes | yes (12 months needs a newer app) | 0053, 0084 live |
| F-panel-706 Add and edit members | yes | yes | yes | n/a | crm_push |
| F-panel-707 Sell, renew, extend a membership | yes | yes | yes | n/a | crm_push |
| F-panel-709 Receipts | yes | yes | yes | n/a | receipt rules 0021 |
| F-panel-710 Side menu in five groups | yes | yes | n/a | n/a | browser only |
| F-panel-711 Needs you on Today | yes | yes | yes | n/a | counts from live functions |
| F-panel-712 New gym ready card | yes | yes | yes | n/a | shown after Create my gym |
| F-panel-713 Owner numbers on Today | yes | yes | yes | n/a | worked out from crm_pull records |
| F-panel-714 Web page chat in Enquiries | yes | **off** (pageAi off) | **no** (0094 not live) | n/a | needs both the switch and 0094 |
| F-panel-715 Refresh from the top bar | yes | yes | n/a | n/a | browser only |
| F-panel-716 Pass members | yes | yes | yes | n/a | 0055 live |
| F-panel-717 Pay MettleUp for a plan | yes | **partly**: UPI/bank page yes; online buy off | yes | n/a | 0060, 0063 live; HQ has no BILLING setting |
| F-panel-718 Numbers to confirm | yes | yes | yes | n/a | owner_phone_links, owner_decide_phone_link live |
| F-panel-719 Pause and renew requests | yes | yes | yes | yes | 0044 live |
| F-panel-720 MettleUp Plus lock switch | yes | **off** (card hidden) | yes (0070 live) | off | members' paid-plan switch off on main |
| F-panel-721 Personal training packs | yes | yes | yes | n/a | crm_push |
| F-panel-722 Quick action buttons | yes | yes | n/a | n/a | browser only |
| F-panel-723 Ready-made challenges | yes | yes | yes | yes | 0047 live |
| F-panel-724 Bring a friend reward | yes | yes | yes | yes | 0056, 0085 live |
| F-panel-725 WhatsApp message to one member | yes | yes | n/a | n/a | opens WhatsApp from the browser |
| F-panel-726 Messages & offers | yes | yes | yes | yes | owner_send_message live |
| F-panel-727 One line under each setting | yes | yes | n/a | n/a | words only |
| F-panel-728 Settings tabs with new dots | yes | yes | n/a | n/a | browser only |
| F-panel-729 Set-up cards on Today | yes | yes | n/a | n/a | browser only |
| F-panel-730 Add a person with a job | yes | yes | yes | n/a | 0079 live |
| F-panel-731 Trainer profiles and bookings | yes | **yes** (listed "behind switch") | yes | unknown | 0065 functions live |
| F-panel-732 Gym's own form videos | yes | yes | yes | yes | 0051 live |
| F-panel-733 Free-trial banner | yes | yes | yes | n/a | reads the gym's plan state |
| F-panel-734 Alerts with the app closed | yes | yes | yes | n/a | 0076, 0095 live; HQ server sends them |
| F-panel-735 Monday summary | yes | yes | n/a | n/a | worked out in the browser |
| F-panel-736 Workout offer | yes | yes | yes | yes | 0025 live |
| F-panel-737 Workout plans | yes | yes | yes | yes | 0024 live |
| F-panel-738 What's new in the admin app | yes | yes (newest entry 2026-11-25) | n/a | n/a | two pending entries held back, as they should be |

## H5-panel-pay-machines (surface panel, area panel/pay-machines) — 31 features, written by H5-panel-pay-machines on 2026-11-26

Branches, the demo gym, the entry-machine (door) server parts, online-payment settings and the Pro pack gate of the web
panel, so "Play app" is n/a for every row. "Live panel" = the build at app.mettleup.fit read on 2026-11-26 (script
index--GfMsOId.js): it holds this area's words and calls (payments screen lines, "Part of the Pro pack", the entry
machine address, owner_rename_group, branch_undo_visitor, the demo gym's sample products and questions). "Live DB" =
catalog read 2026-11-26: owner_branches, owner_add_branch, owner_open_branch, owner_rename_group, branch_find_visitor,
branch_check_in_visitor, branch_visitors, branch_undo_visitor, all eight gate_* functions and self_join_pay_gym are
present; owner_gym_pack (0046) is ABSENT. Live switches (public /api/switches, 2026-11-26): joinPay **true** (it was
false on 19 Nov; main now has JOIN_PAY "live"), gymPages false. PAY_LIVE is "off" on main (test mode; the live value is
not on any public page). The door service (gate Worker) is **not deployed**: its address gate.mettleup.fit has no DNS
answer and its route is commented out, although Settings > Entry machines is open live (finding FN-H5-panel-pay-machines-01).

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-100 Entry machine reports in | yes | **no**: door service not deployed | yes (gate_machine, gate_seen, gate_stranger) | n/a | database part live; header still says 0058 not applied |
| F-panel-101 Machine punch becomes a visit | yes | **no**: door service not deployed | yes (gate_member_nos, gate_recent_punches, gate_save_punches) | n/a | |
| F-panel-102 Machine picks up queued jobs | yes | **no**: door service not deployed | yes (gate_take_commands, gate_command_results) | n/a | the panel already queues jobs for added machines |
| F-panel-103 See branches, switch branch | yes | yes | yes (owner_branches, owner_open_branch) | n/a | 0031 live |
| F-panel-104 Add a branch | yes | yes | yes (owner_add_branch) | n/a | |
| F-panel-105 Rename the business | yes | yes | yes (owner_rename_group) | n/a | |
| F-panel-106 Visitor from another branch | yes | yes | yes (branch_* four) | n/a | |
| F-panel-107 All branches page | yes | yes for gyms with 2+ branches | yes | n/a | |
| F-panel-1104 Branches group (listed "behind switch") | yes | **yes** for gyms with 2+ branches | yes | n/a | a condition, not a switch (same stale-mark fault as FN-H5-hq-app-02) |
| F-panel-108 Demo gym opens as sample gym | yes | yes | n/a (in the browser) | n/a | demo strings in the live script |
| F-panel-109 Demo gym: Staff and PIN status | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-110 Demo gym: Training progress and trainer setup | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-111 Demo gym: Member questions | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-112 Demo gym: Member messages | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-113 Demo gym: Messages and offers | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-114 Demo gym: Automatic reminders | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-115 Demo gym: Workout offer | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-116 Demo gym: Shop products and orders | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-117 Demo gym: Body measurements | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-118 Demo gym: Diet plans | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-119 Demo gym: Trainer schedule and PT classes | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-120 Demo gym: Challenges and leaderboard | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-121 Demo gym: Gym timings | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-122 Demo gym: Bring a friend | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-123 Demo gym: Renew/pause requests | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-1137 Demo gym: Demo copy of server-backed features | yes | yes | n/a (in the browser) | n/a | pretend server only |
| F-panel-124 Pro pack gate | yes, switch **off** (PLAN_GATE_ON false) | **off**: every gym gets every feature | **no**: owner_gym_pack (0046) absent | n/a | switching it on today would still lock nothing (finding FN-H5-panel-pay-machines-02) |
| F-panel-125 UPI QR status | yes | yes | n/a (browser, gym's UPI ID) | n/a | |
| F-panel-1114 Online payments group | yes | **partly**: UPI QR yes; company links test mode only | unknown (small web database 0011/0016 not readable) | n/a | PAY_LIVE off on main |
| F-panel-126 Connect a payment company | yes | yes, **test mode**; company sign-in off (PAY_OAUTH_* off) | unknown (small web database) | n/a | |
| F-panel-127 Where members can pay online switches | yes | yes; the join switch now **shows** (JOIN_PAY live since 19-26 Nov) | unknown (small web database 0016) | n/a | join page takes UPI only until PAY_LIVE is on |

## H5-panel-screens-1 (surface panel, area panel/screens-1) — 62 features, written by H5-panel-screens-1 on 2026-11-26

The owner and desk screens from AI Assistant to Body measurements (Visits, Bring a friend, Busy machines, Challenges,
Diet plans, Enquiries, Entry machines, Expenses, Help and feedback, Gym timings, Import members, the member page).
"Live panel" = the build at app.mettleup.fit read on 2026-11-26 (script index--GfMsOId.js, which already holds the
25 Nov What's new entry): every long on-screen sentence of the 14 screen files on main (79 of 79) is in it. "Live DB" =
every gym-database function these screens call is in the live grant list (machine db-security.json routine_grants):
crm_push, crm_pull, the six body and diet functions, the two timings, three photo, two busy-machine, six challenge,
five entry-machine and three MettleUp-access functions, and owner_friend_summary. The web page chat functions (0094)
are absent. Live switches (public /api/switches, 2026-11-26): gymPages false, pageAi false, joinPay true, aiCharge true.
"Play app" = the member-app part, where one exists: busy-machine tips (0.70.0), invite a friend (0.72.0), leaderboard
and challenge (0.58.0), diet plan, gym measurements and timings (0.57.0) are all older than the Play production build
(0.77.0 read 21 Nov; the 25 Nov What's new note says 0.79.0 reached production that day), so "yes".
Entry machines: the screen and its database part are live, but the door service is not (FN-H5-panel-pay-machines-01).
Bring a friend and the member photo are marked "behind switch" but wait only for database parts that are live (same
stale-mark fault as FN-H5-hq-app-02). The small web database parts (help questions 0008/0014) cannot be read from here.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-1110 Members group (list, member page, photo, card, share) | yes | yes | yes (crm_push/crm_pull, photo functions) | n/a | |
| F-panel-1111 Import members group | yes | yes | yes (crm_push) | n/a | AI column guess: /api/ai/match-columns answers "Sign in first" (live) |
| F-panel-1116 Enquiries group | yes | yes, except the web page chat (off) | yes | n/a | |
| F-panel-1126 Diet plans and body measurements | yes | yes | yes (owner_diet_plans, owner_save_measurement and 4 more) | yes (0.57.0) | |
| F-panel-1127 Challenges group | yes | yes | yes (six challenge and board functions) | yes (0.58.0) | |
| F-panel-1128 Expenses | yes | yes | yes (crm_push) | n/a | |
| F-panel-1130 AI Assistant group (listed "behind switch") | yes | **yes** | yes | n/a | see the H5-panel-assistant section: every part of the switch is live |
| F-panel-1132 Member-app settings (timings, busy machines, plus lock) | yes | yes; the plus lock is **off** (MEMBER_PLAN_GATE_ON false) | yes | yes | plus lock: see H5-panel-logic-2 |
| F-panel-1133 Entry machines group (listed "behind switch") | yes | **open**, but machines never come online | yes (five entry-machine functions) | n/a | door service not deployed: FN-H5-panel-pay-machines-01 |
| F-panel-1135 Help and feedback group | yes | yes | yes (owner_hq_access/grant/end); help store unknown | n/a | small web database 0008/0014 not readable |
| F-panel-200 AI Assistant page (listed "behind switch") | yes | **yes** | yes | n/a | aiCharge on |
| F-panel-201 Visits register, check in, undo | yes | yes | yes (crm_push) | n/a | |
| F-panel-202 Losing the habit list | yes | yes | yes (crm_pull) | n/a | worked out in the browser |
| F-panel-203 Links to Check-in QR and Pass visits | yes | yes | yes | n/a | Pass visits shows once the gym has a pass member; 0055 applied live |
| F-panel-204 Bring a friend Settings card (listed "behind switch") | yes | **yes** | yes (owner_friend_summary, 0056) | yes (0.72.0) | a condition, not a switch (FN-H5-hq-app-02) |
| F-panel-205 Bring a friend thank-you | yes | yes | yes (crm_push) | n/a | |
| F-panel-206 Busy machines setup (listed "behind switch") | yes | yes; each gym's own on/off | yes (owner_machine_setup, owner_save_machine_setup) | yes (0.70.0) | the switch is the owner's own setting |
| F-panel-207 Create, cancel and confirm a challenge | yes | yes | yes | yes (0.58.0) | |
| F-panel-208 Leaderboard, hide a member | yes | yes | yes (owner_board, owner_hide_on_board) | yes (0.58.0) | |
| F-panel-209 Build and send diet plans | yes | yes | yes | yes (0.57.0) | |
| F-panel-210 Diet plan on the member page | yes | yes | yes | yes (0.57.0) | |
| F-panel-211 Enquiries list and follow-ups | yes | yes | yes (crm_push) | n/a | |
| F-panel-212 Add an enquiry by hand | yes | yes | yes | n/a | |
| F-panel-213 Make an enquiry a member | yes | yes | yes | n/a | |
| F-panel-214 Web page question and AI chat on an enquiry (listed "behind switch") | yes | **off** (gymPages false, pageAi false) | **no** (page chat, 0094, absent) | n/a | really off; correct mark |
| F-panel-215 Add or remove a door machine (listed "hidden") | yes | **open**, machines never come online | yes | n/a | FN-H5-panel-pay-machines-01 |
| F-panel-216 Machine number on the member page (listed "hidden") | yes | shows once a machine is added | yes (owner_set_machine_numbers) | n/a | the number does nothing while the door service is off |
| F-panel-217 Expenses month by month | yes | yes | yes (crm_push) | n/a | |
| F-panel-218 Help: write, answer, rate, past questions | yes | yes | unknown (small web database 0008/0014) | n/a | 0009 marked applied live 9 Nov |
| F-panel-219 MettleUp access card | yes | yes | yes (owner_hq_access, owner_hq_grant, owner_hq_end) | n/a | |
| F-panel-220 Gym timings | yes | yes | yes (owner_gym_timings, owner_save_gym_timings) | yes (0.57.0) | |
| F-panel-221 Import from Excel or CSV | yes | yes | yes (crm_push) | n/a | |
| F-panel-222 Import: AI matches the columns | yes | yes | n/a (panel server) | n/a | /api/ai/match-columns live |
| F-panel-223 Import into the right branch | yes | yes for gyms with 2+ branches | yes (0031 live) | n/a | |
| F-panel-224 Undo a past import | yes | yes | yes (crm_push) | n/a | |
| F-panel-225 Member page | yes | yes | yes (crm_pull) | n/a | |
| F-panel-226 Check in from the member page | yes | yes | yes | n/a | |
| F-panel-227 Archive or restore a member | yes | yes | yes | n/a | |
| F-panel-228 Member card | yes | yes | n/a (browser) | n/a | |
| F-panel-229 Share app link | yes | yes (25 Nov wording live) | n/a | yes | app.mettleup.fit/app is live and sends Android to Google Play |
| F-panel-230 WhatsApp with the message typed | yes | yes | n/a (browser) | n/a | |
| F-panel-231 Member photo (listed "behind switch") | yes | **yes** while online | yes (three photo functions) | n/a | a condition, not a switch (FN-H5-hq-app-02) |
| F-panel-232 Sell, renew, collect | yes | yes | yes (crm_push) | n/a | |
| F-panel-233 Cancel a membership and undo | yes | yes | yes | n/a | |
| F-panel-234 Freeze, extra days, move start | yes | yes | yes | n/a | |
| F-panel-235 Personal training sessions | yes | yes | yes | n/a | |
| F-panel-236 Cancel a receipt | yes | yes | yes | n/a | |
| F-panel-237 Check a workout code | yes | yes | yes | n/a | 0025 applied live |
| F-panel-238 Send or build a workout plan | yes | yes | yes | n/a | |
| F-panel-239 Body measurements at the desk | yes | yes | yes (owner_member_measurements and 2 more) | yes (0.57.0) | |
| F-panel-514 Expenses and profit | yes | yes | yes | n/a | |
| F-panel-516 Visits, stopped coming, pass visits | yes | yes | yes | n/a | |
| F-panel-517 Enquiries | yes | yes | yes | n/a | |
| F-panel-518 Bring a friend (listed "behind switch") | yes | **yes** | yes (0056) | yes (0.72.0) | FN-H5-hq-app-02 |
| F-panel-519 Import members | yes | yes | yes | n/a | |
| F-panel-526 Diet plans and body measurements | yes | yes | yes | yes (0.57.0) | |
| F-panel-527 Challenges and leaderboard | yes | yes | yes | yes (0.58.0) | |
| F-panel-529 Gym timings | yes | yes | yes | yes (0.57.0) | |
| F-panel-531 Entry machines (listed "unknown") | yes | **open**, machines never come online | yes | n/a | door service not deployed: FN-H5-panel-pay-machines-01 |
| F-panel-532 Busy machines (listed "behind switch") | yes | yes; each gym's own on/off | yes | yes (0.70.0) | |
| F-panel-537 AI Assistant (listed "behind switch") | yes | **yes** | yes | n/a | see H5-panel-assistant |
| F-panel-538 Help and feedback | yes | yes | yes; help store unknown | n/a | |

## H5-panel-screens-2 (surface panel, area panel/screens-2) — 66 features, written by H5-panel-screens-2 on 2026-11-26

The owner and desk screens from Member messages to Workout plans (Members, Messages & offers, Money, More, Training
progress, Set-up steps, Pass visits, Pay MettleUp, Plans, Plus lock, Questions, Receipts, Settings, Today, Trainers,
Your web page, Workout of the day). "Live panel" = the build at app.mettleup.fit read on 2026-11-26 (scripts
index--GfMsOId.js and index-BK-HUjiz.js): it holds this area's calls (owner_talk_list, owner_trainer_schedule,
owner_save_gym_wod, owner_save_plus_lock, owner_answer_question, owner_save_gym_page, owner_pay_mettleup,
self_join_preview, owner_member_progress, owner_undo_reward, owner_save_auto_reminders) but NOT owner_billing or
owner_receipt: the MettleUp receipt page and "pay online" for MettleUp are compiled out (BILLING_ONLINE_ON false).
"Live DB" = all 39 gym-database functions these screens call are in the live grant list (machine db-security.json
routine_grants). Live switches (public /api/switches, 2026-11-26): gymPages false, pageAi false, joinPay true, aiCharge true.
Code switches on main: PLAN_GATE_ON false (so "Your numbers" and the workout offer are open to every gym),
MEMBER_PLAN_GATE_ON false (the Plus lock card is hidden), BILLING_ONLINE_ON false.
Most "behind switch" marks here are a condition on a live database part, not a switch (FN-H5-hq-app-02). Two screen
notes still say "not live" (Pay MettleUp, Trainers): FN-H5-panel-logic-2-01. Unknown: whether MettleUp's UPI ID and
bank details are saved, so whether an owner sees the QR code on Pay MettleUp (the catalog count was refused by the
database guard). "Play app" = the member-app part where one exists; Play production is 0.79.0 since 25 Nov (panel
What's new note); versions named are when the phone part shipped.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-1100 Panel frame, menu, More | yes | yes | n/a (browser) | n/a | |
| F-panel-1106 Your web page group (listed "behind switch") | yes | **off** (gymPages false) | yes (owner_gym_page, owner_save_gym_page, photo slot) | n/a | really off; correct mark. Page AI chat off and its database part (0094) absent |
| F-panel-1107 Today home | yes | yes | yes (crm_pull) | n/a | |
| F-panel-1112 Plans and memberships | yes | yes | yes (crm_push) | n/a | |
| F-panel-1113 Money | yes | yes | yes (crm_push) | n/a | |
| F-panel-1118 Set up your gym | yes | yes | n/a (browser) | n/a | |
| F-panel-1120 Messages & offers group | yes | yes | yes (owner_send_message, owner_offers, owner_auto_reminders) | yes (0.55.0 offer, 0.59.0 pop-ups) | |
| F-panel-1122 Member messages group (listed "behind switch") | yes | **yes** | yes (owner_talk_list, reply, done, count) | yes (0.78.0, recipient 0.79.0) | a condition, not a switch (FN-H5-hq-app-02) |
| F-panel-1123 Trainers group (listed "behind switch") | yes | **yes** | yes (owner_trainer_schedule, owner_book_pt, owner_cancel_pt, owner_save_trainer_profile) | n/a | screen note says 0065 not applied: FN-H5-panel-logic-2-01 |
| F-panel-1124 Training progress and Member questions (listed "behind switch") | yes | **yes** | yes (owner_member_progress, owner_questions, owner_answer_question) | yes (share with trainers 0.70.0) | FN-H5-hq-app-02 |
| F-panel-1125 Workout plans group | yes | yes | yes (crm_push; owner_gym_wods) | yes (0.48.0 plans, 0.70.0 WOD and videos) | |
| F-panel-1131 Settings group | yes | yes | yes | n/a | |
| F-panel-1134 Paying MettleUp group (listed "behind switch") | yes | **partly**: Pay MettleUp by UPI/bank yes; pay online and MettleUp receipt **off** (BILLING_ONLINE_ON false) | yes (owner_pay_mettleup, owner_report_mettleup_payment, 0060; 0063 live) | n/a | saved MettleUp pay details unknown |
| F-panel-300 Member messages page (listed "behind switch") | yes | **yes** | yes (four owner_talk_* functions) | yes (0.78.0) | FN-H5-hq-app-02 |
| F-panel-301 Members list | yes | yes | yes (crm_pull) | n/a | |
| F-panel-302 Joined in the app tab | yes | yes | yes (owner_app_members) | yes | |
| F-panel-303 Messages & offers page | yes | yes | yes (owner_send_message, owner_messages, owner_withdraw_message) | yes (0.59.0) | |
| F-panel-304 Workout offer (listed "behind switch") | yes | **yes** for every gym (PLAN_GATE_ON false) | yes (owner_offers, owner_save_offer, owner_stop_offer, owner_undo_reward) | yes (0.55.0) | a Pro-pack mark, not a switch that hides it today |
| F-panel-305 Automatic reminders | yes | yes | yes (owner_auto_reminders, owner_save_auto_reminders) | n/a | |
| F-panel-306 MettleUp receipt (listed "behind switch") | yes | **off**: route compiled out (BILLING_ONLINE_ON false) | yes (owner_receipt in grants) | n/a | correct mark; owner_receipt not in the live script |
| F-panel-307 Money: Collections | yes | yes | yes (crm_push) | n/a | |
| F-panel-308 Money: Dues | yes | yes | yes | n/a | |
| F-panel-310 More menu on a phone | yes | yes | n/a | n/a | |
| F-panel-311 Training progress (listed "behind switch") | yes | **yes** | yes (owner_member_progress) | yes (0.70.0; 12 months since joining with 0.79.0) | FN-H5-hq-app-02 |
| F-panel-312 Find and join online step (listed "behind switch") | yes | **partly**: join link, QR poster and pay-at-desk yes; the web page part off (gymPages false); join pay row shows (joinPay true) | yes (self_join_preview; owner_save_gym_page) | n/a | pay wording: FN-B-truth-panel-screens-2-a-01 |
| F-panel-313 Pass visits | yes | yes | yes (crm_pull) | n/a | |
| F-panel-314 Pay MettleUp (listed "behind switch") | yes | **yes** (UPI/bank); pay online off | yes (0060) | n/a | screen note says 0060 not applied: FN-H5-panel-logic-2-01; pay details unknown |
| F-panel-315 Membership plans | yes | yes | yes | n/a | |
| F-panel-317 Plus lock switch (listed "behind switch") | yes | **off**: card hidden (MEMBER_PLAN_GATE_ON false) | yes (owner_plus_lock, owner_save_plus_lock) | n/a | correct mark |
| F-panel-318 Member questions (listed "behind switch") | yes | **yes** | yes (owner_questions, owner_answer_question, owner_question_count) | unknown (version of "Ask a trainer" not found in phone notes) | FN-H5-hq-app-02 |
| F-panel-319 Member receipt | yes | yes | yes (crm_push) | n/a | |
| F-panel-320 Settings: Gym tab | yes | yes | yes | n/a | |
| F-panel-321 Settings: Member app tab | yes | yes; plus lock card hidden | yes | yes | |
| F-panel-322 Settings: Sign-in & data tab | yes | yes | yes | n/a | |
| F-panel-324 Set up your gym page | yes | yes | n/a | n/a | |
| F-panel-325 Today tiles and lists | yes | yes | yes (crm_pull) | n/a | |
| F-panel-326 Today: Your numbers (listed "behind switch") | yes | **yes** for every gym (PLAN_GATE_ON false) | n/a (browser) | n/a | a Pro-pack mark, not a switch that hides it today |
| F-panel-327 Today nudges | yes | yes | n/a | n/a | |
| F-panel-328 Today: Message link | yes | yes | n/a (wa.me) | n/a | |
| F-panel-330 Trainers page (listed "behind switch") | yes | **yes** | yes (owner_trainer_schedule) | n/a | FN-H5-hq-app-02 |
| F-panel-331 Book a PT session (listed "behind switch") | yes | **yes** | yes (owner_book_pt) | n/a | FN-H5-hq-app-02 |
| F-panel-332 See or cancel a PT booking (listed "behind switch") | yes | **yes** | yes (owner_cancel_pt) | n/a | FN-H5-hq-app-02 |
| F-panel-333 Edit a trainer profile (listed "behind switch") | yes | **yes** | yes (owner_save_trainer_profile) | n/a | FN-H5-hq-app-02 |
| F-panel-334 Your web page editor (listed "behind switch") | yes | **off** (gymPages false) | yes (owner_save_gym_page) | n/a | correct mark |
| F-panel-335 See your page preview (listed "behind switch") | yes | **off** | n/a (browser) | n/a | correct mark |
| F-panel-336 Share the web page (listed "behind switch") | yes | **off** | n/a | n/a | correct mark |
| F-panel-337 Workout of the day (listed "behind switch") | yes | **yes** | yes (owner_gym_wods, owner_save_gym_wod, owner_clear_gym_wod; 0051) | yes (0.70.0) | a condition, not a switch (FN-H5-hq-app-02) |
| F-panel-338 Workout plans list | yes | yes | yes (crm_push) | yes (0.48.0) | |
| F-panel-339 Workout plan builder | yes | yes | yes | yes (0.48.0) | |
| F-panel-340 New workout plan | yes | yes | n/a | n/a | |
| F-panel-341 Send a plan to one member | yes | yes | yes | yes (0.48.0) | |
| F-panel-342 Own video link on an exercise (listed "behind switch") | yes | **yes** (shows once owner_gym_wods answers) | yes (0051) | yes (0.70.0 "Watch your trainer") | FN-H5-hq-app-02 |
| F-panel-504 Set up your gym and join online | yes | yes; web page part off | yes | n/a | |
| F-panel-507 Today first screen | yes | yes | yes | n/a | |
| F-panel-510 Members | yes | yes | yes | n/a | |
| F-panel-513 Money | yes | yes | yes | n/a | |
| F-panel-515 Plans price list | yes | yes | yes | n/a | |
| F-panel-520 Messages and offers | yes | yes | yes | yes | |
| F-panel-522 Member messages and Member questions | yes | yes | yes | yes (0.78.0) | |
| F-panel-523 Training progress (listed "behind switch") | yes | **yes** | yes | yes (0.70.0) | FN-H5-hq-app-02 |
| F-panel-524 Trainers | yes | yes | yes | n/a | |
| F-panel-525 Workout plans and workout of the day | yes | yes | yes | yes (0.48.0, 0.70.0) | |
| F-panel-528 Settings | yes | yes | yes | n/a | |
| F-panel-530 Your web page (listed "behind switch") | yes | **off** (gymPages false) | yes | n/a | correct mark |
| F-panel-533 Plus lock (listed "hidden") | yes | **off**: hidden | yes (0070) | n/a | correct mark |
| F-panel-534 Pay MettleUp | yes | yes (UPI/bank); pay online off | yes (0060) | n/a | pay details unknown |

## H5-panel-shop (surface panel, area panel/shop) — 42 features, written by H5-panel-shop on 2026-11-26

The gym panel's member-app side (shop, invite and join online, alerts, check-in poster, and the calls behind the
member-app tools), so "Play app" is n/a for every row. "Live panel" = the build at app.mettleup.fit read on 2026-11-26
(script index--GfMsOId.js, newest What's new day 2026-11-25, the same as main): every one of the 94 gym-server calls this
folder makes is in that script, except owner_billing and owner_receipt, which the build leaves out because online plan
buying is switched off (BILLING_ONLINE_ON false, packages/theme/src/plans.ts:231). "Live DB" = catalog read 2026-11-26:
all 94 functions are present. So every "until 00xx is on the server" guard in this folder now passes, and the features
the list marks "behind switch" only because of that guard are really live (same stale-mark fault as FN-H5-hq-app-02;
stale code notes: FN-H5-panel-logic-2-01). Live switches (public answers, 2026-11-26): joinPay true, gymPages false;
/api/links gives join = app.mettleup.fit (join.mettleup.fit has no DNS answer yet); /api/push/web-key answers;
the join page /m/<code> is served ("Become a member of your gym").

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-1108 Alerts group | yes | yes | yes (owner_alerts, owner_alert_list, owner_alerts_read) | n/a | web key live |
| F-panel-1115 Visits group | yes | yes | yes | n/a | |
| F-panel-1117 Invite and join online (listed "behind switch") | yes | **yes** for open gyms with a plan | yes (self_join_preview) | n/a | readiness check, not a switch; gym web pages part off (gymPages false) |
| F-panel-1119 Shop group | yes | yes | yes (owner_products, owner_orders) | n/a | |
| F-panel-800 Shop orders | yes | yes | yes (owner_orders, owner_set_order_status) | n/a | |
| F-panel-801 Shop products | yes | yes | yes (owner_save_product, owner_add_stock, owner_delete_product) | n/a | |
| F-panel-802 Product photo upload | yes | yes | yes (owner_photo_ticket, owner_set_product_photo) | n/a | photo store bucket not readable (guard): unknown |
| F-panel-803 Shop card on Today | yes | yes | yes | n/a | |
| F-panel-804 Start demo gym / turn on member app | yes | yes | yes (demo_start_gym) | n/a | |
| F-panel-805 Gym look in member app | yes | yes | yes (owner_set_brand) | n/a | |
| F-panel-806 Rename the gym | yes | yes | yes (owner_rename_gym) | n/a | |
| F-panel-807 App members list | yes | yes | yes (owner_app_members) | n/a | |
| F-panel-808 Messages & offers | yes | yes | yes (owner_send_message, owner_withdraw_message) | n/a | |
| F-panel-809 Workout offer (listed "behind switch") | yes | **yes** | yes (owner_offers, owner_save_offer, staff_give_reward, owner_undo_reward) | n/a | stale mark |
| F-panel-810 Automatic reminders (listed "behind switch") | yes | **yes**; each reminder is the owner's own switch | yes (owner_auto_reminders, owner_save_auto_reminders) | n/a | stale mark |
| F-panel-811 Invite members | yes | yes | yes | n/a | |
| F-panel-812 Join online link (listed "behind switch") | yes | **yes** for open gyms with a plan | yes (self_join_preview) | n/a | message drops "pay at the desk" since joinPay is on |
| F-panel-813 Free trial on joining (listed "behind switch") | yes | **yes** when the join page works | yes (0088 key; Crispy check refused by guard) | n/a | stale mark |
| F-panel-814 Check-in QR poster | yes | yes | n/a (made in the browser) | n/a | |
| F-panel-815 Gym alerts list (listed "behind switch") | yes | **yes** | yes (owner_alert_opened, owner_alert_remove) | n/a | 0075/0098 live |
| F-panel-816 MettleUp billing online | yes, switch **off** (BILLING_ONLINE_ON false) | **off**: calls cut out of the build; checkout answers "not switched on yet" | yes (owner_billing, owner_receipt) | n/a | HQ BILLING also off |
| F-panel-817 Body measurements (listed "behind switch") | yes | **yes** | yes (owner_member_measurements, owner_save_measurement) | n/a | stale mark |
| F-panel-818 Diet plans (listed "behind switch") | yes | **yes** | yes (owner_diet_plans, owner_save_diet_plan) | n/a | stale mark |
| F-panel-819 Challenges and leaderboard (listed "behind switch") | yes | **yes** | yes (owner_challenges, owner_board) | n/a | stale mark |
| F-panel-820 Entry machines (listed "behind switch") | yes | **open, but the door service is not live** | yes (owner_entry_machines, owner_add_entry_machine) | n/a | FN-H5-panel-pay-machines-01 |
| F-panel-821 Bring a friend count (listed "behind switch") | yes | **yes** | yes (owner_friend_summary) | n/a | stale mark |
| F-panel-822 Workout reports (listed "behind switch") | yes | **yes** | yes (owner_request_report, owner_report_file) | n/a | stale mark |
| F-panel-823 Busy machines (listed "behind switch") | yes | **yes**; owner switch | yes (owner_machine_setup) | n/a | stale mark |
| F-panel-824 Member messages (listed "behind switch") | yes | **yes** | yes (owner_talk_*) | n/a | stale mark |
| F-panel-825 Member photo at the desk (listed "behind switch") | yes | **yes** | yes (owner_member_photos, owner_save_member_photo) | n/a | stale mark |
| F-panel-826 Pay MettleUp (listed "behind switch") | yes | **yes** (UPI or bank, report a payment) | yes (owner_pay_mettleup, owner_report_mettleup_payment) | n/a | stale mark |
| F-panel-827 Numbers to confirm (listed "behind switch") | yes | **yes** | yes (owner_phone_links, owner_decide_phone_link) | n/a | stale mark |
| F-panel-828 Pause / renew requests (listed "behind switch") | yes | **yes** | yes (owner_plan_requests, owner_decide_plan_request) | n/a | stale mark |
| F-panel-829 MettleUp Plus lock | yes, card **hidden** (MEMBER_PLAN_GATE_ON false) | **off**: hidden | yes (owner_plus_lock) | n/a | correct mark; What's new line waits in pending |
| F-panel-830 Ask a trainer (listed "behind switch") | yes | **yes** | yes (owner_questions, owner_answer_question) | n/a | stale mark |
| F-panel-831 Live Progress card (listed "behind switch") | yes | **yes** | yes (owner_member_progress) | n/a | stale mark |
| F-panel-832 Gym opening hours (listed "behind switch") | yes | **yes** | yes (owner_gym_timings, owner_save_gym_timings) | n/a | stale mark |
| F-panel-833 Trainers see progress (listed "behind switch") | yes | **yes** | yes (owner_set_trainer, owner_assign_trainer) | n/a | stale mark |
| F-panel-834 Trainer pages and PT bookings (listed "behind switch") | yes | **yes** | yes (owner_trainer_schedule, owner_book_pt) | n/a | stale mark |
| F-panel-835 Alert settings (listed "behind switch") | yes | **yes** | yes (owner_alert_settings) | n/a | stale mark |
| F-panel-836 Web push on/off and test alert (listed "behind switch") | yes | **yes** (web key answers) | yes (owner_save_web_push, owner_send_test_alert) | n/a | stale mark |
| F-panel-837 Workout of the day (listed "behind switch") | yes | **yes** | yes (owner_gym_wods, owner_save_gym_wod) | n/a | stale mark |

## H5-panel-ui-shell (surface panel, area panel/ui-shell) — 15 features, written by H5-panel-ui-shell on 2026-11-26

The admin app's shared screen parts (menu, bell, Today's cards, welcome, What's new, numbers, member card, Pay MettleUp
online, stopped-paying line). "Live panel" = the build at app.mettleup.fit read on 2026-11-26 (script index--GfMsOId.js,
newest What's new day 2026-11-25, the same as main): the visible words of every entry file are in that script; the offline
helper (sw.js) and the home-screen manifest are byte-identical to main. These parts call the gym server only through the
shop and pay folders, whose calls are all on the live database (see the H5-panel-shop and H5-panel-pay-machines sections).
Two plan switches are off in the code on main and so in the live build: PLAN_GATE_ON (no plan limits, no stopped-paying
line; its words and its server call are cut out of the live script) and BILLING_ONLINE_ON (no online buying, no receipts).
Live switches (public answer, 2026-11-26): joinPay true, gymPages false. "Play app" is n/a: these are web-panel screens.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-panel-500 Move around the admin app | yes | yes | n/a | n/a | |
| F-panel-501 Dark/Light, English/Hinglish, home-screen install | yes | yes (manifest matches main) | n/a | n/a | in What's new 2026-11-15 and iPhone steps line |
| F-panel-502 Offline front desk | yes | yes (sw.js matches main) | n/a | n/a | |
| F-panel-503 Welcome screen and "your gym is ready" | yes | yes | yes (demo_start_gym) | n/a | join link = app.mettleup.fit (/api/links) |
| F-panel-505 Gym alerts: bell, Needs you, alerts with app closed | yes | yes (web key answers) | yes (owner_alerts, owner_alert_list) | n/a | |
| F-panel-506 What's new and new-feature dots | yes | yes | n/a | n/a | live newest day 2026-11-25 = main |
| F-panel-1109 What's new page, HQ news in the bell, dots | yes | yes | n/a (HQ news from the panel server) | n/a | |
| F-panel-508 Today's to-do cards (pause/renew, numbers, joined online) | yes | yes; joined-online card needs joinPay, which is on | yes (owner_plan_requests, owner_phone_links) | n/a | |
| F-panel-509 Your numbers and Your growth | yes | yes, open to every gym (PLAN_GATE_ON off) | yes | n/a | listed Pro; no limit while the switch is off |
| F-panel-1129 Number tiles, growth, print report | yes | yes, open to every gym | yes | n/a | same parts as F-panel-509 |
| F-panel-511 Member ID card | yes | yes | yes | n/a | |
| F-panel-521 Check a member's workout code | yes | yes, open to every gym | yes (owner_offers) | n/a | |
| F-panel-1121 Workout offer: give or undo a reward, check a code | yes | yes | yes (staff_give_reward, owner_undo_reward) | n/a | |
| F-panel-535 Pay MettleUp online and MettleUp receipts | yes, switch **off** (BILLING_ONLINE_ON false) | **off**: asks the server nothing; receipt page not routed | yes (0063 live) | n/a | list says "0063 marked not applied": stale (FN-H5-hq-app-02) |
| F-panel-536 Stopped-paying line on Today | yes, switch **off** (PLAN_GATE_ON false) | **off**: never shown, cut from the build | yes (owner_gym_state, 0062 live) | n/a | code note says 0062 may not be on the server: stale (FN-H5-panel-logic-2-01) |

## H5-phone-cloud-backup-ai (surface phone, area phone/cloud-backup-ai) — 21 features, written by H5-phone-cloud-backup-ai on 2026-11-26

The member app's AI coach, backup file, MettleUp account and workout copy, Google Drive restore, old gym link, server
addresses and Plus limits. "Play app" = the public Google Play listing read on 2026-11-26: **version 0.79.0, updated
25 Nov 2026**. Main is 0.80.0 (apps/mobile/app.json:5), so main is ONE version ahead of what members get; 0.80.0 holds two
open privacy fixes (Delete my account waits for a running copy; nothing saved for a profile under 18) that are not in
members' hands yet (FN-H5-phone-cloud-backup-ai-01). "Live panel" is n/a: these are phone parts; the gym server parts
are in the "Live DB" column. Catalog read 2026-11-26: member_copy_put, member_copy_get, member_copy_count,
member_account_delete, app_limits, join_gym_by_code, delete_my_cloud_data and the tables member_summary and app_config are
all live. File 0032 (the copy) says "NOT APPLIED" on line 1 but is live (FN-L16-server-database-2-01). Both own server
addresses (app.mettleup.fit/sb and forgeai.aakashpahuja.in/sb) answered with the gym server's stamp on 2026-11-26.
Switches in the code on main (and so in every build): coach off, gymSync off (apps/mobile/src/lib/features.ts:6), Plus
limits off (packages/theme/src/memberPlan.ts:28).

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-phone-1500 Chat with the coach | yes, switch **off** (coach false) | n/a | n/a (own AI key or offline) | **off** | |
| F-phone-1501 Own AI key for the coach | yes, switch **off** | n/a | n/a | **off** | key goes straight to Claude, OpenAI or Groq |
| F-phone-1502 Offline coach (English, Hindi, Hinglish) | yes, switch **off** | n/a | n/a | **off** | |
| F-phone-1503 Coach reads and changes data by chat | yes, switch **off** | n/a | n/a | **off** | |
| F-phone-1505 Meal photo calories | yes, switch **off** (coach and nutrition false) | n/a | n/a | **off** | |
| F-phone-1510 Save a backup file | yes | n/a | n/a (phone only) | yes (0.79.0) | in What's new since the backup file release |
| F-phone-1511 Restore from a backup file | yes | n/a | n/a | yes | |
| F-phone-1512 Undo a restore | yes | n/a | n/a | yes | |
| F-phone-1520 MettleUp account: Google sign-in, sign out | yes | n/a | yes (Supabase sign-in through our address) | yes | build holds a real Google web client id (apps/mobile/app.json:143); not on iPhone |
| F-phone-1521 Copy every saved change to the server | yes | n/a | yes (member_copy_put) | yes, **without** the under-18 stop | under-18 stop only in 0.80.0: FN-H5-phone-cloud-backup-ai-01 |
| F-phone-1522 Bring back my workouts on a new phone | yes | n/a | yes (member_copy_get, member_copy_count) | yes | |
| F-phone-1523 Delete my account and the copy | yes | n/a | yes (member_account_delete) | yes, **without** the wait-for-copy fix | fix only in 0.80.0: FN-H5-phone-cloud-backup-ai-01 |
| F-phone-1524 Backup status line in Settings | yes | n/a | yes | yes | |
| F-phone-1525 Restore an older Google Drive backup | yes | n/a | n/a (Google Drive) | yes | Drive permission on the Google side not checked |
| F-phone-1526 Back up to Google Drive | yes, **hidden** (no screen calls the upload) | n/a | n/a | **off** | |
| F-phone-1527 Old gym link: email sign-in, join by code | yes, switch **off** (gymSync false) | n/a | yes (join_gym_by_code) | **off** | |
| F-phone-1528 Old gym sync: one summary row | yes, switch **off** | n/a | yes (member_summary) | **off** | |
| F-phone-1529 Old gym link: delete cloud data, disconnect | yes, switch **off** | n/a | yes (delete_my_cloud_data) | **off** | |
| F-phone-1530 Reach the server when Supabase is blocked | yes | n/a | yes (both addresses answer with the stamp) | yes | |
| F-phone-1531 Gym logo and shop photos through our address | yes | n/a | yes (same addresses) | yes | |
| F-phone-1532 MettleUp Plus limits | yes, switch **off** (MEMBER_PLAN_GATE_ON false) | n/a | yes (app_limits) | **off** | nothing is ever refused |

## H5-phone-components-1 (surface phone, area phone/components-1) — 20 features, written by H5-phone-components-1 on 2026-11-26

The member app's Workout tab notices, gym logo, crash screen, update pop-ups, What's new, Charts page cards, charts,
coach chat parts and the exercise History tab. "Play app" = the public Google Play listing read on 2026-11-26:
**version 0.79.0** (see the H5-phone-cloud-backup-ai section). Main is 0.80.0 (apps/mobile/app.json:5), not released
anywhere yet: on 2026-11-26 the app's own news file https://app.mettleup.fit/app/whats-new.json answered version 0.79.0
and the newest GitHub release is v0.79.0 (17 Nov). The newest dated change in this area's files is R-596 (16 Nov,
WatchUpdatePrompt.tsx:19), before 0.79.0, so this area is believed the same on Play as on main (no git diff was run).
"Live panel" is n/a: these are phone parts. Catalog read 2026-11-26: member_me, member_join and member_leave (the gym's
name and look) are live. Switches on main: coach off (apps/mobile/src/lib/features.ts:6), plan gate off
(packages/theme/src/plans.ts:40), so a gym's logo shows for EVERY gym that set a colour, tone or logo; features.json
calls 1301 and 1302 "behind switch", but the only switch is the gym's own look.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-phone-1300 "Backups now go to your MettleUp account" notice | yes | n/a | n/a | yes | only for a phone that had Google Drive backup |
| F-phone-1301 Gym logo full-screen on launch | yes (plan gate off) | n/a | yes (member_me, member_join) | yes | shows for any branded gym |
| F-phone-1302 Gym logo and name on Workout, Profile, Shop | yes (plan gate off) | n/a | yes (member_me) | yes | |
| F-phone-1306 "New" dots | yes | n/a | n/a | yes | |
| F-phone-1307 "Your workouts are only on this phone" notice | yes | n/a | n/a | yes | |
| F-phone-1308 "Couldn't save" banner | yes | n/a | n/a | yes | |
| F-phone-1309 Crash screen with Try again | yes | n/a | n/a | yes | |
| F-phone-1310 Update the app pop-up and orange line | yes | n/a | n/a | yes | Play copy uses Play's own update; news text from app.mettleup.fit/app/whats-new.json (0.79.0 live) |
| F-phone-1311 "MettleUp works on your watch too" notice | yes | n/a | n/a | yes, but the watch app is **not in Play production** | Install leads nowhere for a normal member: FN-L12-phone-screens-2-01 |
| F-phone-1312 Watch app update pop-up | yes | n/a | n/a | yes (testers' watches only) | only a watch that has the test-track watch app |
| F-phone-1313 What's new card | yes | n/a | n/a | yes | 0.80.0 lines wait for the 0.80.0 release |
| F-phone-1314 Body map of muscles trained | yes | n/a | n/a | yes | |
| F-phone-1315 Balance check card | yes | n/a | n/a | yes | |
| F-phone-1316 Strength score trend | yes | n/a | n/a | yes | |
| F-phone-1317 Reports card | yes | n/a | n/a | yes | |
| F-phone-1321 Tap a bar or point on any chart | yes | n/a | n/a | yes | |
| F-phone-1323 Coach chat bubbles and cards | yes, switch **off** (coach false) | n/a | n/a | **off** | coach tab sends to Workout (apps/mobile/src/app/(tabs)/coach.tsx:35) |
| F-phone-1324 Coach chat food cards | yes, switch **off** | n/a | n/a | **off** | |
| F-phone-1325 Coach chat voice (hold the mic) | yes, switch **off** | n/a | n/a | **off** | |
| F-phone-1326 Exercise page History tab | yes | n/a | n/a | yes | |

## H5-phone-components-2 (surface phone, area phone/components-2) — 30 features, written by H5-phone-components-2 on 2026-11-26

The member app's help and feedback button, voice feedback, help replies, confirm sheets, Workout notices, "Couldn't save"
banner, every Settings card (account, backup, gym, profile, data) and the shared screen parts. "Play app" = the public
Google Play listing read again on 2026-11-26: **version 0.79.0**; the newest GitHub release is v0.79.0 (17 Nov) and the
app's news file https://app.mettleup.fit/app/whats-new.json answers 0.79.0. Main is 0.80.0 (apps/mobile/app.json:5).
The ONE part of this area that is only on main is F237 "phone number sign-in also backs up workouts" (AccountCard,
PhoneBackup, 25 Nov). Its server half IS live: function phone_account_pick (0099, catalog read 2026-11-26) and Edge
Function phone-account (ACTIVE, version 1). Its app half is not on Play, although the What's new entry and the 0099 file
call it released on 25 Nov (FN-H5-phone-components-2-01). Help questions, replies, the AI answer and voice feedback run
on the gym panel worker and its small web database (D1), which cannot be read from the laptop: their tables (0008,
0014) and secrets (Claude help key, Groq key) are **unknown** (FN-L16-server-panel-worker-06). Switches on main: coach,
nutrition, gymSync off (apps/mobile/src/lib/features.ts:6); Plus off (packages/theme/src/memberPlan.ts:28); plan gate off,
so the gym logo shortcut is offered for any gym with a logo; phone sign-in ON (apps/mobile/src/onboarding/phoneSignIn.ts:32,
its comment at line 16 still says off).

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-phone-1400 Help or feedback button | yes | yes (/api/feedback, /api/help routed) | unknown (D1) | yes | |
| F-phone-1401 Speak your feedback | yes | yes (/api/feedback/voice routed) | unknown (D1, Groq key) | yes | Groq model whisper-large-v3; a retired model = 404 |
| F-phone-1402 My questions and team replies | yes | yes (/api/help/replies) | unknown (D1 0009 / 0014) | yes | before 0014 only the newest reply shows, silently |
| F-phone-1403 Quick AI answer, "Did this solve it?" | yes | yes (/api/help, /api/help/rate) | unknown (D1 0008, Claude help key) | yes | no key = no AI answer, message still saved |
| F-phone-1404 Add my watch's log to feedback | yes | n/a | n/a | yes | |
| F-phone-1405 "Are you sure?" sheet | yes | n/a | n/a | yes | |
| F-phone-1406 One notice card at a time | yes | n/a | n/a | yes | |
| F-phone-1407 "Couldn't save" banner | yes | n/a | n/a | yes | |
| F-phone-1408 MettleUp account card | yes; phone-number backup (F237) only on main | n/a | yes (phone_account_pick, Edge Function phone-account, member_copy_put, member_account_delete) | Google account only; **no phone-number backup** | features.json says "behind switch": the only gate is the build's server set-up, which Play has; FN-H5-phone-components-2-01 |
| F-phone-1409 Own AI key field | yes, switch **off** (coach false) | n/a | n/a | **off** | |
| F-phone-1410 Save as a spreadsheet | yes | n/a | n/a | yes | |
| F-phone-1411 Old Google Drive restore, undo, unlink | yes | n/a | n/a (Google Drive) | yes | |
| F-phone-1412 Android phone backup card | yes, **hidden** (no Settings row) | n/a | n/a | hidden | |
| F-phone-1413 Download my data | yes | n/a | n/a | yes | |
| F-phone-1414 Restore from a backup file | yes | n/a | n/a | yes | |
| F-phone-1415 Gym email sign-in, cloud sync | yes, switch **off** (gymSync false) | n/a | yes (join_gym_by_code) | **off** | |
| F-phone-1416 Erase all data, remove demo | yes | n/a | n/a | yes | |
| F-phone-1417 Hidden demo-data hold | yes, **hidden** | n/a | n/a | hidden | |
| F-phone-1418 Gym logo on my home screen | yes (plan gate off) | n/a | yes (member_me) | yes, where the phone takes shortcuts | "behind switch" = the gym's logo and the phone's support |
| F-phone-1419 Leave my gym, what my gym sees | yes | n/a | yes (member_leave) | yes | |
| F-phone-1420 Gym reminders and messages on or off | yes | n/a | yes | yes | |
| F-phone-1421 Join your gym by poster or code | yes | n/a | yes (member_join) | yes | |
| F-phone-1422 Edit your profile | yes | n/a | n/a | yes | |
| F-phone-1423 Calorie and macro targets | yes, switch **off** (nutrition false) | n/a | n/a | **off** | |
| F-phone-1424 Settings menu in six groups | yes | n/a | n/a | yes | |
| F-phone-1425 MettleUp Plus row | yes, switch **off** (MEMBER_PLAN_GATE_ON false) | n/a | yes (app_limits) | **off** | |
| F-phone-1426 iPhone: rows left out, "Not on iPhone yet" | yes (iPhone build only) | n/a | n/a | n/a (Android) | no live iPhone app was checked |
| F-phone-1427 Undo bar after a delete | yes | n/a | n/a | yes | |
| F-phone-1428 "Couldn't load" state, error line | yes | n/a | n/a | yes | |
| F-phone-1429 Font size, touch areas, screen reader, less motion | yes | n/a | n/a | yes | |

## H5-phone-lib-core (surface phone, area phone/lib-core) — 33 features, written by H5-phone-lib-core on 2026-11-26

The member app's shared core: MettleUp Plus and Google Play buying, own AI keys and coach voice, the update checks,
What's new, new-feature dots, Workout notices, feedback, help replies, crash reports, workout maths (targets, 1-rep max,
streak, charts), units, tabs, links, credits, pictures and the loading states. "Play app" = the public Google Play
listing, **version 0.79.0** (see the H5-phone-cloud-backup-ai section). Main is 0.80.0 (apps/mobile/app.json:5). Read
2026-11-26 with no login: GitHub's newest release answers (api.github.com .../releases/latest = 200, the repo's releases
are public, so the GitHub-copy update check works); the app's news file https://app.mettleup.fit/app/whats-new.json
answers 0.79.0 with the 0.79.0 lines; /api/crash is routed (GET answers 405, it takes POST only). The only change in this
area dated after 0.79.0 (17 Nov) is F237's words: the 0.80.0 What's new entry (apps/mobile/src/lib/whatsNew.ts:72-87)
and the "only on this phone" card now asking for the phone number (apps/mobile/src/lib/safekeepNudge.ts:30-31); both
wait for a 0.80.0 release that has not happened (FN-H5-phone-components-2-01). Feedback, help, voice feedback and crash
reports are stored in the panel's small web database (D1), which cannot be read from the laptop: **unknown**
(FN-L16-server-panel-worker-06). Switches on main: coach, nutrition, gymSync off (apps/mobile/src/lib/features.ts:6);
Plus off (MEMBER_PLAN_GATE_ON false) and payments off (MEMBER_PAYMENTS_LIVE false), so no Play purchase can start
(packages/theme/src/memberPlan.ts:28,34; apps/mobile/src/plan/playBilling.ts:40-44,99). Whether the Plus products exist
in Play Console was not read.

| Feature | Main | Live panel | Live DB | Play app | Notes |
|---|---|---|---|---|---|
| F-phone-1700 Plus and Find my gym pages from a link | yes, switch **off** (pages leave at once) | n/a | n/a | **off** | QA builds only keep them open (PlusPageGate.tsx:15-26) |
| F-phone-1701 MettleUp Plus free month and "needs Plus" pop-up | yes, switch **off** | n/a | n/a (plan kept on the phone) | **off** | nothing is ever locked |
| F-phone-1702 Free month pop-ups (5 days left, ended) | yes, switch **off** | n/a | n/a | **off** | |
| F-phone-1703 Buy or restore Plus through Google Play | yes, payments **off** (answers "not live") | n/a | n/a | **off** | Play products not checked |
| F-phone-1704 Own OpenAI, Anthropic or Groq key | yes, **hidden** (coach false) | n/a | n/a | **off** | |
| F-phone-1705 Talk to the coach by voice | yes, **hidden** (coach false) | n/a | n/a | **off** | |
| F-phone-1706 "A new version is ready" for GitHub copies | yes | n/a | n/a | yes (GitHub copies only) | GitHub newest release answered 200 without login |
| F-phone-1707 Full-screen "A new MettleUp is here" | yes | n/a | n/a | yes | news text from app.mettleup.fit/app/whats-new.json (0.79.0) |
| F-phone-1708 What's new card and Settings > What's new | yes (holds the 0.80.0 entry) | n/a | n/a | yes, up to 0.79.0 | 0.80.0 entry says released 25 Nov; not on Play: FN-H5-phone-components-2-01 |
| F-phone-1709 New-feature dots | yes | n/a | n/a | yes | |
| F-phone-1710 "Backups now go to your MettleUp account" card | yes | n/a | n/a | yes | only for a phone that had Google Drive linked |
| F-phone-1711 "Your workouts are only on this phone" card | yes, asks for the **phone number** (F237) | n/a | yes (member_copy_put) | yes, older words (Google account) | new words wait for 0.80.0: FN-H5-phone-components-2-01 |
| F-phone-1712 One notice card at a time | yes | n/a | n/a | yes | |
| F-phone-1713 Send feedback or ask for help | yes | yes (/api/feedback, /api/help routed) | unknown (D1) | yes | |
| F-phone-1714 Floating feedback button | yes | yes (/api/help/replies for the red dot) | unknown (D1) | yes | |
| F-phone-1715 Speak your feedback | yes | yes (/api/feedback/voice routed) | unknown (D1, Groq key) | yes | |
| F-phone-1716 Your questions and answers | yes | yes (/api/help/replies, /api/help/rate) | unknown (D1 0008, 0014) | yes | |
| F-phone-1717 "The MettleUp team answered" notification | yes | yes (/api/help/replies) | unknown (D1) | yes (Android) | |
| F-phone-1718 Add my watch's screen log | yes | n/a | n/a | yes | |
| F-phone-1719 Crash reports | yes | yes (/api/crash, POST only) | unknown (D1 feedback table) | yes | |
| F-phone-1720 Suggested weight and reps | yes | n/a | n/a | yes | |
| F-phone-1721 Estimated 1-rep max and record rule | yes | n/a | n/a | yes | |
| F-phone-1722 Home summary numbers | yes, **hidden** | n/a | n/a | hidden | |
| F-phone-1723 Charts and per-exercise stats | yes | n/a | n/a | yes | |
| F-phone-1724 Week streak | yes | n/a | n/a | yes | |
| F-phone-1725 Units kg/km or lb/miles | yes | n/a | n/a | yes | |
| F-phone-1726 Three tabs and the back arrow | yes | n/a | n/a | yes | |
| F-phone-1727 Links, shortcuts and notifications land right | yes | n/a | n/a | yes | |
| F-phone-1728 One-time "it moved" hints | yes | n/a | n/a | yes | |
| F-phone-1729 Credits page | yes | n/a | n/a | yes | |
| F-phone-1730 Take or pick a picture | yes | n/a | n/a | yes | |
| F-phone-1731 iPhone: "not built yet" lines | yes (iPhone build only) | n/a | n/a | n/a (Android) | no live iPhone app checked |
| F-phone-1732 Loading, "Couldn't load", Try again | yes | n/a | n/a | yes | |
