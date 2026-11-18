# Checkpoint: A2-server-hq-gate-workers

Output: docs/system-map/_work/out/A2-server-hq-gate-workers.jsonl (37 rows, F-server-200 to F-server-236)

## Units finished
- [x] 1. Source list read (183 lines)
- [x] 2. Code opened: deploy/hq/worker.js (whole), deploy/hq/api.js 100-667, deploy/gate/worker.ts, both wrangler.jsonc, billing.js 1-60 + 285-493, excerpts of push.js, panelPush.js, payFeed.js, readLog.js, readLogAlert.js, usage.js, backup.js, outside.js, web.js, webpush.js, db.js, auth.js, english.js, englishPrompt.js (about 2,300 code lines)
- [x] 3. Switches and plan gates noted (in each row's "switch")
- [x] 4. Items grouped into features
- [x] 5. Rows written: F-server-200 .. F-server-235
- [x] 6. Not-a-feature row: F-server-236 (db.js)
- [x] Coverage check run: all 183 item ids are in some row's "sources"; every "entry" path and line exists

## Items left
none

## Switches / gates met
- AUTH_MODE (google | access): which sign-in HQ uses
- BILLING = "test" + BILLING_PROVIDER + app_config billing_checkout: online plan buying, nightly billing jobs, "Payments to check"
- BILLING_MESSAGES: plan-end reminders by WhatsApp/SMS; a stub, sends nothing either way
- FCM_SERVICE_ACCOUNT: member phone pop-ups; PUSH_SUBREQUESTS caps a run
- VAPID_PRIVATE_JWK: admin-app browser alerts; PANEL_PUSH_SUBREQUESTS caps a run
- SUPABASE_LOGS_TOKEN (+ _EXPIRES): direct-read record
- HQ_GEMINI_KEY (+ GEMINI_MODEL): English helper
- CF_ANALYTICS_TOKEN + CF_ACCOUNT_ID: weekly free-limit check
- BACKUP KV binding: nightly backup, also holds usage / read-log / English-helper state
- PANEL_ORIGIN -> panel GYM_PAGES, and per-gym hq_set_web_page: gym web pages
- Per-gym AI limits (ai_limits, assist_limits)
- "Fresh sign-in" (under 15 minutes) gate on: pay details, reset owner sign-in, delete gym, open support access
- No plan (Pro) gate is decided in this area's code; tier written "unknown" where the gate lives elsewhere
- Gate Worker: not deployed, route commented out

## Seen in passing (not checked further, not fixed)
- deploy/hq/panelPush.js:110-112 and 137-140: when a run hits its call budget, the alerts it could not send are "not sent again" (the comment says so). Staff may never get a browser alert on a busy minute.
- deploy/hq/api.js:400-408 (and 388, 436, 630, 644): the audit row is written BEFORE the change in Cloudflare's database; if the save then fails, the audit log says a reply / status / limit change happened that did not.
- deploy/hq/api.js:455-458 and 546-549: suspending a gym and signing everyone out do not need the fresh (15-minute) sign-in that reset-signin, delete and support access need. May be on purpose.
- deploy/hq/worker.js:223-227: any cron string that is not the nightly or billing one runs the every-minute job; a typo in wrangler.jsonc would silently run pop-ups instead of failing.
- deploy/hq/worker.js:235 and push.js:493: POST /push/run needs no sign-in (documented; throttled to once per 3 s per Worker instance only).
- deploy/hq/billing.js:405-418: plan-end reminders are counted nightly but the sender is a stub; "sent" is always 0.

## Could not check
- Whether each switch is ON in production (secrets and vars are not in the repo): status "behind switch" or "unknown" is from code only.
- Whether the migrations the code calls NOT LIVE / NOT APPLIED (0058, 0063, 0064, 0073, 0075, 0076, 0086, 0090, 0097) are applied: no database reads in this step.
- Lines of web.js, push.js, english.js, auth.js, readLog.js, webpush.js outside the excerpts were not read (size limit).
