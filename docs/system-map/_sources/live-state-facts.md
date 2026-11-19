# Live state facts (audit step A4b-1, written 2026-11-19)

What the live systems really run, with the source of every fact. Read-only work: one catalog read of the gym
database (the migration list), public pages with no login, and the code on main (7643faf4).

## a. Gym database (Supabase): migrations

**Live migration list** (source: Supabase tool `list_migrations`, 2026-11-19, called once):

    version 20261116165436   name 0098_alerts_done_and_read

That is the WHOLE list: one row. The repo has 98 files (supabase/migrations/0001_init.sql to 0098_alerts_done_and_read.sql).

**What this list can and cannot prove.** Almost every file was run by hand in the Supabase SQL Editor (their own
first lines say so, e.g. supabase/migrations/0047_challenge_rewards.sql:1, 0055_pass_members.sql:1,
0073_member_push_more.sql:1). A hand-run file leaves no row in the migration list. So:
- a file that IS in the list is applied live (proved);
- a file that is NOT in the list is NOT proved missing. The list alone cannot settle 0001 to 0097.

**File whose first lines say NOT APPLIED but that IS applied live (proved by the list):**
- 0098_alerts_done_and_read.sql: line 1 says "NOT APPLIED LIVE. Waits for the owner's yes 0098"
  (supabase/migrations/0098_alerts_done_and_read.sql:1); the live list holds it (applied 2026-11-16 16:54 UTC by its version stamp).

**Files NOT in the live list** (all 97 others: 0001 to 0097). For these the only evidence is the files themselves:

1. First lines say APPLIED LIVE (source: line 1 to 4 of each file): 0025 to 0030, 0034 to 0045, 0047 to 0057,
   0065 to 0070, 0073 to 0090, 0093, 0095, 0096.
2. No applied/not-applied line at all (the early files, assumed the base everything else stands on; not proved here):
   0001 to 0024.
3. First lines say NOT APPLIED / NOT LIVE, and nothing in the repo proves otherwise (live state: unknown):
   0046, 0058, 0059, 0060, 0063, 0064, 0072, 0091, 0092, 0094, 0097.
   (0072 says it needs 0063: supabase/migrations/0072_retired_ai_pack_name.sql:2.)
4. First lines say NOT APPLIED, but a file that IS marked applied live could not have been applied without them
   (so they ARE live; the first line is stale). Proof by dependency, code-read only:
   - 0031_branches (line 1 "NOT APPLIED"): 0034, applied live 24 Oct, makes a plain-SQL function that calls
     0031's _branch_ids (supabase/migrations/0034_signin_pin.sql:101-106; made only in 0031_branches.sql:108).
     A plain-SQL function is checked when it is made, so 0031 was there. 0048 (applied live) also reads
     gyms.group_id, a 0031 column (supabase/migrations/0048_security_fixes.sql:101-102; 0031_branches.sql:86).
   - 0061_phone_codes (line 1 "NOT APPLIED"): 0078, applied live 14 Nov, stops with an error unless 0061's
     _phone_sig_ok exists (supabase/migrations/0078_ai_questions.sql:64).
   - 0071_ai_assistant (line 1 "NOT APPLIED"): 0078 stops with an error unless 0071's table gym_ai_credit_ledger
     exists (supabase/migrations/0078_ai_questions.sql:62); 0083 (applied live) needs 0078 (0083_ai_members.sql:46).
   - 0062_plan_features (line 3 "NOT APPLIED LIVE"): 0077, applied live 14 Nov, makes a plain-SQL function that
     calls 0062's gym_has_feature (supabase/migrations/0077_self_join.sql:100-102; made only in 0062_plan_features.sql:99).
   - 0032_member_cloud (line 1 "NOT APPLIED"): 0062 (live, see above) inserts a row into app_config
     (supabase/migrations/0062_plan_features.sql:56), a table made only in 0032 (0032_member_cloud.sql:100).
     One step weaker than the others: it holds unless the table was made by hand.
   - 0033_terms_acceptance (line 1 "NOT APPLIED"): 0067, applied live 10 Nov, records "Before: _terms_versions() =
     {2026-10-24}, 1 acceptance row" (supabase/migrations/0067_terms_version_2026_11_10.sql:1-5); both are 0033's.

**Not checked** (only the migration list was allowed): the live table, function and policy lists. One catalog read of
the function list would settle group 3 and confirm group 4.

## b. Second database (Cloudflare D1 `forgeai-web`, deploy/panel/migrations)

No live read was allowed: **live state unknown** for every file, except where a public page proves it (noted).
What each file's first lines say (source: line 1 to 2 of each file in deploy/panel/migrations):

| File | First lines say |
|---|---|
| 0001_feedback.sql | no applied line (Launch H7, 21 Oct 2026) |
| 0002_leads.sql | no applied line (Launch I3, 21 Oct 2026) |
| 0003_ai_usage.sql | NOT APPLIED - needs owner yes |
| 0004_ai_limits.sql | NOT APPLIED - main session applies after review |
| 0005_feedback_input.sql | no applied line (28 Oct 2026) |
| 0006_hq_messages.sql | no applied line (31 Oct 2026) |
| 0007_lead_source.sql | no applied line (31 Oct 2026) |
| 0008_help_answers.sql | NOT APPLIED - needs owner yes |
| 0009_help_replies.sql | APPLIED LIVE 9 Nov 2026 |
| 0010_friend_asks.sql | APPLIED LIVE 5 Nov 2026 |
| 0011_payments.sql | APPLIED LIVE 5 Nov 2026 |
| 0012_phone_codes.sql | NOT APPLIED |
| 0013_phone_inbound.sql | NOT APPLIED. **Proved live by a public page:** https://app.mettleup.fit/api/phone-code/status answered `{"available":true,"mode":"inbound"}` on 2026-11-19, which the code gives only when table phone_inbound can be read (deploy/panel/phoneInbound.js:137-141). The first line is stale. |
| 0014_help_reply_list.sql | NOT APPLIED |
| 0015_assist_usage.sql | NOT APPLIED |
| 0016_pay_switches.sql | APPLIED LIVE 14 Nov 2026 |

## c. Live version labels and live switches

| Thing | Live (public page, no login, 2026-11-19) | Code on main |
|---|---|---|
| Gym panel sign-in, https://app.mettleup.fit/ | No version label. The fetched page is the empty app shell titled "MettleUp for Gyms"; the screen is drawn by script, which the fetch does not run. | The admin app has no version number of its own; its newest "What's new" entry is the version (apps/dashboard/src/crm/logic/whatsNew.ts:5-7). Package version 0.1.0, never shown (apps/dashboard/package.json:4). |
| HQ sign-in, https://hq.mettleup.fit/ | No page of its own: it sends the visitor straight to Google sign-in (302 to accounts.google.com). Not followed. No version label. | No version label in the HQ page code (apps/hq/public/app.js has "Version" only as a table heading for member app versions, :725). Sign-in way = Google (deploy/hq/wrangler.jsonc:58). |
| Website, https://gyms.mettleup.fit/ | No version label. Plans shown: Starter 999 a month / 9,990 a year; Pro 1,499 / 14,990; Founding gym 29,999 once. No "Pro + AI" pack. No switching offer. | apps/dashboard/public/home/index.html (no version label). |
| Play app (phone) | unknown (no public page was found that shows it) | 0.79.0 (apps/mobile/app.json:5); newest release tag v0.79.0 (git tag). The number in a build comes from the release tag (apps/mobile/android/app/build.gradle:101-105). |

Live switches read from public answers (2026-11-19):
- https://app.mettleup.fit/api/switches : gymPages false, joinPay false, aiCharge true, pageAi false. Same as the code
  (deploy/panel/wrangler.jsonc:90-96: GYM_PAGES off, PAGE_AI off, JOIN_PAY off, AI_CREDITS_CHARGE on).
- https://app.mettleup.fit/api/phone-code/status : available true, mode inbound ("Verify with WhatsApp" is on; the older
  "we send you a code" way is not offered while it is: deploy/panel/phoneCode.js:240-245).
- https://app.mettleup.fit/api/push/web-key : answers with a key (the HQ server link works and browser alerts are set up:
  deploy/panel/webKey.js:14-16).
- Online payments: PAY_LIVE off in the code = test mode, no real money (deploy/panel/wrangler.jsonc:93; deploy/panel/pay.js:76-78).
  The live value was not readable from a public page.
- MettleUp plan payment at HQ: no BILLING setting in the code (deploy/hq/wrangler.jsonc:56-66), so every billing route
  answers "not set up" (deploy/hq/billing.js:20-21). The live value was not readable from a public page.

## Could not read
- Cloudflare secrets (AI keys, payment master key, WhatsApp token): no public page shows them.
- D1 table list (group b): no live read allowed.
- Gym database function and table lists: only the migration list was allowed.
- Live Play Store version: no public page found.
