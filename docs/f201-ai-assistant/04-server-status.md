# F201 server status

## 13 Nov 2026: the go-live batch (ONE yes from the owner covers all of it, in this order)

Nothing below is live. Each step needs his yes ("No LIVE database changes without my yes"; deploys too).
1. Gym server: paste `supabase/migrations/0071_ai_assistant.sql`, then `0072_retired_ai_pack_name.sql`, into the
   Supabase SQL Editor (his personal Chrome window). If the classifier refuses live SQL, he presses Run.
2. Web database: from deploy/panel, `npx wrangler d1 execute forgeai-web --remote --file migrations/0015_assist_usage.sql`.
3. Panel worker deploy (the CI dashboard build artifact, then `npx wrangler deploy` from deploy/panel), with an
   ADMIN_NEWS line for the AI Assistant. This also puts the website changes live (R-474 AI section, R-476 hero and
   numbers; the site is served by the panel worker).
4. HQ worker deploy (deploy/hq): the AI credits card and the nightly purge of AI requests older than 400 days (R-477).
5. Privacy page: the lines in 06-privacy-line.md (his yes word for word), live with step 3.
6. Optional secrets: `CLAUDE_ASSIST_KEY` (else `CLAUDE_HELP_KEY`), `SARVAM_API_KEY` (else Groq), `ASSIST_TRIAL_CAP_USD`.
7. After 1-3: the real-AI test set (about Rs 10 of Claude calls), then a live check in Chrome.

Current numbers (these replace the 12 Nov section below where they differ):
- Credits: 20 once in the free trial; monthly plans none; paid yearly or founding lifetime: 50 a month on Starter,
  100 on Pro (R-473). Asking is free; 1 credit per message sent or member/payment saved, 3 per workout plan saved.
- Money cap: only trial and unpaid gyms, all together, $15 a month (R-475). Paying gyms: no money cap, only 50
  requests and 10 spoken minutes a day (HQ can change one gym's number).
- Workout plan writer: POST /api/assist/plan, from the gym's own exercise list (R-471). Diet plans: not yet.
- Kept 400 days, then deleted for every gym every night; only the credit amounts stay (R-477).

## 12 Nov 2026: server side built (not live)

Pushed to main:
- `9ed6ee37`: credits (0071), HQ credits card, panel routes.
- `dbcede3a`: R-467. 50 requests and 10 voice minutes a gym a day, HQ per-gym limit, secret ASSIST_CAP_USD.
- `2121023c`: R-470. 20 starter credits once, 100 a month only on a paid yearly or lifetime plan, trial fair use 20 a day.

CI: green on all three, both jobs (check + database): runs 43252372390, 43254291239, 43256863258.

**Nothing is live.** Three steps wait for the owner's yes:
1. Gym server migration `supabase/migrations/0071_ai_assistant.sql` (credits and task history).
2. Web database migration `deploy/panel/migrations/0015_assist_usage.sql`
   (`npx wrangler d1 execute forgeai-web --remote --file migrations/0015_assist_usage.sql`, from deploy/panel).
3. Deploying the panel worker. Optional secrets: `CLAUDE_ASSIST_KEY` (else `CLAUDE_HELP_KEY` is used),
   `SARVAM_API_KEY` (else Groq Whisper with `GROQ_API_KEY`), `ASSIST_TRIAL_CAP_USD` (trial and unpaid gyms only, else $15 a month; R-475).

### Free credits and fair use (R-467, R-470)
- 20 starter credits once per gym ('welcome' row), trial or not.
- 100 free credits every India month only while `billing = 'yearly'` and `paid_until > now()`, or `billing = 'lifetime'`
  (a lifetime gym's `paid_until` is null, meaning for ever, so it counts as paid). Trial and monthly plans: none.
  Unused free credits expire when the month ends.
- AI requests a day: 50 for a paid gym; 20 in the free trial or unpaid (also when the worker cannot tell).
  10 spoken minutes a day for everyone. HQ's per-gym number wins over both.
- At the limit: "You have asked a lot today. The AI Assistant is back tomorrow morning."

### Gym server RPCs (all take the owner's key first; staff and trainers get OWNER_ONLY)
| Call | Returns | Refusals |
|---|---|---|
| `owner_ai_wallet(p_key)` | `{ok, balance, free_left, monthly_free (50, 100 or 0; R-473), plan, billing, trial, month, low_at: 5, packs: [{credits, inr, popular?}], recent: [{at, delta, reason, note, task_id}]}`. The first read adds the starter 20 and this month's free credits | BAD_KEY, OWNER_ONLY |
| `owner_ai_task_save(p_key, p_id uuid, p_request text, p_spoken bool, p_actions jsonb)` | `{ok, id, status: 'drafted'}`. Free; saving a drafted task again updates it | INVALID, NOT_FOUND, ALREADY_DONE, TOO_MANY |
| `owner_ai_spend(p_key, p_task_id, p_credits 1-9, p_result jsonb)` | `{ok, task_id, credits, balance, free_left}`. Call it right BEFORE running the action | NO_CREDITS, ALREADY_SPENT, NOT_FOUND, SUSPENDED, INVALID |
| `owner_ai_refund(p_key, p_task_id)` | `{ok, task_id, refunded, balance, free_left}`. Once, within 10 minutes of the spend | NOT_FOUND, ALREADY_REFUNDED, TOO_LATE |
| `owner_ai_tasks(p_key, p_limit default 30)` | `{ok, tasks: [{id, at, request, spoken, actions, status, done_at, credits, result}]}`, newest first | |
| `owner_ai_status(p_key)` | `{ok, paid, trial}` (the worker's fair use) | |

What a task costs in credits: `creditsFor(actions)` in `deploy/panel/assistCatalogue.js`.

### Panel worker (header `X-Forge-Key`, owner only)
- `POST /api/assist` `{text (<= 600), spoken, lang: 'en'|'hi', ctx: {gym, today, plans: [{name, months, days, price}], batches: [], trainers: [], messageLang}}`
  -> 200 `{actions: [{tool, input}] (1-3 catalogue tools), note, left, masked}`.
  Phone numbers and emails are masked before Claude sees them, then put back in `actions`.
- `POST /api/assist/rewrite` `{title_en, body_en, title_hi, body_hi, how}` -> 200 `{title_en, body_en, title_hi, body_hi, left}`.
- `POST /api/assist/voice` multipart `audio` (<= 30 s, 1 MB) + `seconds` -> 200 `{text, provider: 'sarvam'|'groq'}`.
- Refusals:
  - 400, 401, 403 (not the owner; `reason: 'demo'`), 405, 413.
  - 422 `{reason: 'empty'}` (voice only).
  - 429 `{reason: 'limit'}`.
  - 502 `{reason: 'failed'}`.
  - 503 `{reason: 'off' | 'unreachable' | 'cap'}`. On 'off' the admin app hides the assistant.

### HQ
The gym page has an "AI Assistant credits" card. It shows the balance, this month's use and the AI cost, and it has two
actions: "Add AI credits" (`POST /api/gym/ai-credits`) and "Daily limit" (`POST /api/gym/assist-limit`).

### Files changed
- Gym server: `supabase/migrations/0071_ai_assistant.sql`, `supabase/tests/0071_ai_assistant.sql`,
  `supabase/tests/security.sql`.
- Panel: `deploy/panel/assist.js`, `deploy/panel/assist.test.mjs`, `deploy/panel/migrations/0015_assist_usage.sql`,
  `deploy/panel/worker.js`, `deploy/panel/aiMatch.js`, `deploy/panel/wrangler.jsonc`.
- HQ: `deploy/hq/api.js`, `deploy/hq/web.js`, `deploy/hq/hq.test.mjs`, `apps/hq/public/app.js`,
  `apps/hq/public/logic.js`, `apps/hq/test/logic.test.mjs`.

### Tests
- Gym server: 72 checks in `supabase/tests/0071_ai_assistant.sql`.
- Panel: 17 tests in `assist.test.mjs`.
- HQ: 50 tests in `hq.test.mjs` and 27 in `logic.test.mjs`.
