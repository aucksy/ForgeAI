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
