# A2-web-pages checkpoint

Status: DONE (18 Nov 2026). Output: docs/system-map/_work/out/A2-web-pages.jsonl (40 rows, F-web-100 to F-web-141; 130, 136, 142 unused after merges).
Coverage self-check: all 398 source lines of docs/system-map/_work/items/A2-web-pages.txt are named in at least one row; every entry path:line exists.
Code read: about 900 lines (limit 2,500).

## Steps
- [x] 1. Read the source list (398 lines)
- [x] 2. Open the code per item (worker.js routes 95-175, 176-200, 240-312; wrangler.jsonc 20-110; hosts.js 100-125, 150-200; gymPageServe.js 335-372; pay.js 736-790 + function list; file headers of every deploy/panel module and public script; titles of every public page)
- [x] 3. Switches and plan gates noted (below)
- [x] 4. Items grouped into features
- [x] 5. Feature rows written
- [x] 6. Not-a-feature rows written (F-web-141: sqliteD1.mjs, razorpayTestMode.check.mjs)

## Finished units
- unit 1: addresses and marketing sites (F-web-100 to 107) done
- unit 2: join, check-in, friend, become a member, join pay (F-web-108 to 112) done
- unit 3: gym web page, ask/report, AI chat, switches answer (F-web-113 to 116) done
- unit 4: feedback, help, credits, voice, crash, HQ news (F-web-117 to 122) done
- unit 5: AI import, AI Assistant, plan writer (F-web-123 to 125) done
- unit 6: online payments, billing, web push key (F-web-126 to 133) done
- unit 7: WhatsApp codes, proxy, service worker, legal pages, clean-up, test tools (F-web-134 to 141) done

## Switches met (deploy/panel/wrangler.jsonc:82-99)
LANDING live; MOVE on; PHONE_CODES on; PHONE_CODE_DAILY_CAP 200; WHATSAPP_INBOUND_NUMBER set; GYM_PAGES off; PAGE_AI off; JOIN_PAY off; PAY_LIVE off (test mode); PAY_OAUTH_RAZORPAY off; PAY_OAUTH_CASHFREE off; AI_CREDITS_CHARGE on; JOIN_HOST empty; APP_STORE_URL empty.
Per-gym: paySwitches app_on / web_on (D1 pay_switches, on by default); the gym's "not taking sign-ups online" state (g.closed, worker.js:296; setting name not in this area); owner's AI on/off and monthly limit (questionCredits.js header).
Plan gates: none found in this area. AI features spend the gym's AI credits (assist.js, assistPlan.js, questionCredits.js); tier written "unknown".

## Could not check
- Whether each D1 migration (0011 payments, 0012/0013 phone codes, 0015, 0016) is applied on the live database: no database reads in this step. Payment rows (F-web-126 to 131), billing (132) and web push key (133) are status "unknown".
- Whether the sent-code path (F-web-134) works today: phoneInbound.js:2 says Meta blocks every message MettleUp sends; not run.
- pay.js (1,731 lines) was mapped by function boundaries and its header, not read line by line; the split of its 68 database lines across F-web-126 to 131 follows which function each line sits in.
- No demo-gym "pretend copy" lines were found in this area.

## Seen in passing
- deploy/panel/switches.js:3 says a switch can be set in "the Cloudflare dashboard"; deploy/panel/wrangler.jsonc:67-69 says a dashboard var is wiped by the next deploy. The two notes disagree.
- deploy/panel/wrangler.jsonc:89 PHONE_CODES is "on" while deploy/panel/phoneInbound.js:2 says Meta blocks every message we send (error 131042): the "send a code" path may be on but not delivering.
- deploy/panel/wrangler.jsonc:90 WHATSAPP_HOOK_VERIFY (the webhook check word) is written in the repo as a plain var, not a secret.
- deploy/panel/gymPage.js:3 says gym_page_public is "NOT on the live database yet"; could be stale, not checked.
- deploy/panel/worker.js:136-139: /dl/<version>.aab and store pictures are answered with no switch in front (playBundle not read; who may fetch is unknown).
