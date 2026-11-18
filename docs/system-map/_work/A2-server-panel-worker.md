# A2-server-panel-worker checkpoint

- [x] 1. Source list read (355 lines).
- [x] 2. Code opened at the items' files (about 1,400 code lines read: worker.js routing and schedule, wrangler.jsonc routes/vars/crons, switches.js, pay.js dispatch, hosts.js, gymPageServe.js, proxy.js, phoneCode.js routes, head notes of every module).
- [x] 3. Switches and plan gates noted (in each row's "switch").
- [x] 4. Items grouped into features.
- [x] 5. Feature rows written: F-server-100 to F-server-145 (40 rows, ids 120, 121, 127, 129, 138, 143 unused) in docs/system-map/_work/out/A2-server-panel-worker.jsonl.
- [x] 6. Not-a-feature row: F-server-145 (sqliteD1.mjs, razorpayTestMode.check.mjs).
- Coverage self-check: 355 of 355 item ids are in some row's "sources"; every "entry" path and line exists. Items left: 0.

## Switch values read (deploy/panel/wrangler.jsonc:82-99)
LANDING live, MOVE on, PHONE_CODES on, PHONE_CODE_DAILY_CAP 200, GYM_PAGES off, PAGE_AI off, JOIN_PAY off, PAY_LIVE off,
PAY_OAUTH_RAZORPAY off, PAY_OAUTH_CASHFREE off, AI_CREDITS_CHARGE on, JOIN_HOST empty, APP_STORE_URL empty, WHATSAPP_INBOUND_NUMBER set.

## Could not check
- Whether secrets exist on the live Worker (PAYMENTS_MASTER_KEY, WHATSAPP_TOKEN, PHONE_CODE_SECRET, WHATSAPP_APP_SECRET, GROQ/GEMINI/CLAUDE keys) and which D1 migrations are applied: not readable from code, so those rows have status "unknown".
- Tier (free or Pro) of payments, the AI Assistant, AI import and bring-a-friend: the gate, if any, is in the gym server or admin app, outside this area: "unknown".
- Function bodies were not read line by line for every d1-sql item (size limit); those items were grouped by the function range they sit in (pay.js function list) or by their file.

## Seen in passing
- deploy/panel/migrations/0014_help_reply_list.sql:1 says "NOT APPLIED. Needs the owner's yes", while /api/help/replies is routed live (deploy/panel/worker.js:144). Check whether the replies list works without 0014.
- deploy/panel/wrangler.jsonc:87 keeps WHATSAPP_HOOK_VERIFY (Meta's webhook check word) as a plain value in the repo, although line 71 says secrets are never written in this file. Low risk (a POST is still signed with WHATSAPP_APP_SECRET per whatsappHook.js head note, not verified line by line).
- deploy/panel/wrangler.jsonc:59 comment and worker.js:92 describe join.mettleup.fit pages, but that host is not in the routes list (wrangler.jsonc:24-33) and JOIN_HOST is empty: consistent with "hidden", noted only so nobody assumes it is reachable.
- deploy/panel/worker.js:136-139: /dl/<version>.aab and store pictures are public pass-throughs of release files with no sign-in (comment says the files are public anyway); confirm the GitHub repo's releases are meant to be public.
