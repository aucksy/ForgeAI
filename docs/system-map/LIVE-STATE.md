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
