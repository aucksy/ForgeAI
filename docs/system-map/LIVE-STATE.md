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
