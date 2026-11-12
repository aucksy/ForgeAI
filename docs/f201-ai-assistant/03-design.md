# 03 — Design: the MettleUp AI assistant (F201)

Decided by Claude on 12 Nov 2026 under his "You're the boss. You make all the right decisions" and
"you can decide the pricing and implementation". Inputs: 01-code-map.md, 02-research.md.

## 1. The idea in one line
The owner types or speaks (Hindi, English, Hinglish) what he wants. The assistant answers questions on the spot
and prepares tasks (messages, member changes) as cards. Nothing reaches a member or changes data until the owner
taps Send or Save. Every morning it also suggests the 2-4 most useful things to do today, each one tap away.

What makes it a daily habit (the "addictive" part he asked for):
1. **"Today for you" ideas** on the Today screen and the assistant screen: computed by our own code, free, fresh each
   day (plans ending this week, members who stopped coming, birthdays, dues, an upcoming festival, Monday's summary).
2. **Questions are free.** He can ask "kisne paise nahi diye?" ten times a day and never think about cost.
3. **Voice in Hindi** that works first time, with the transcript shown so a misheard name is caught.
4. **One tap to act on an answer**: every list answer has "Message them" / "Open list" buttons.
5. **Sent results come back**: "Your Diwali message reached 142 members; 96 have seen it" in history.

## 2. What it can do (task catalogue, v1)
The AI never runs anything itself. It turns the sentence into one to three ACTIONS from this fixed catalogue
(Claude tool use, strict schemas). Our code then runs the read-only ones and shows cards for the rest.

### A. Ask (read-only; FREE; answered by our own reports, never by the AI's guess)
| id | Example | Our code that answers |
|---|---|---|
| `list_members` | "jinka plan is hafte khatam ho raha hai", "10 din se kaun nahi aaya", "aaj birthday kiska hai", "Gold plan wale", "morning batch", "naye members is mahine" | audience.ts groups + homeTiles filters + attendance.ts `atRiskList`; filter = {kind, days?, planId?, batch?, trainer?} |
| `who_owes` | "kisne paise nahi diye", "kitna baaki hai" | collections.ts `duesByMember` / `duesLedger` |
| `money_summary` | "is mahine kitna collection hua", "pichle mahine se zyada?" | collections.ts `collectionSummary`, expenses `monthSummary`; period = today / this week / this month / last month / custom |
| `attendance_summary` | "aaj kitne aaye", "sabse busy time kya hai" | attendance.ts `attendanceSummary` + peak hours |
| `growth_summary` | "is mahine kitne join hue aur kitne chhod gaye" | businessGrowth.ts |
| `member_lookup` | "Rahul Sharma ka plan kab khatam hoga" | local fuzzy name match -> member card summary (+ open profile) |
| `week_summary` | "gym ka haal batao" | weekSummary.ts |
| `how_to` | "QR check-in kaise lagate hain" | existing /api/help answer (help articles) |

Each answer card: a one-line headline with the number, up to 8 rows, "See all N" (opens the existing screen with the
filter), and follow-up buttons ("Message them" -> drafts a message to exactly this group).

### B. Message members (draft; 1 credit when SENT)
`draft_message` {audience, kind, lang, title_en?, body_en?, title_hi?, body_hi?, send_at?, offer?}
- audience = everyone | active | ending{N days} | ended{N days} | away{N days} | birthday_today | plan:<name> | batch:<name> | owes | members:[names]
- kind = announcement | offer | event | closed | timing | reminder (server kinds, 0025)
- lang = en | hi | both (default: the gym's saved message language, useMessageLang); Hindi in Devanagari.
- Limits from the server: title <= 60, body <= 300 letters, 10 a day, offer/event 1 a day and 3 a week, 3rd+ message
  of the day is quiet. The card checks these BEFORE Send and says so in words.
- Preview card: who gets it (count, how many have the app; "N don't have the app: send them on WhatsApp one by one"
  -> existing send queue), the message drawn as a phone notification + inbox item, editable text, send time
  (now / a chosen time, e.g. "Diwali 8 am"), language switch, "Make it shorter / more formal / add Hindi" rewrite
  chips (free, up to 5 per draft), and the button "Send to 142 members · 1 credit".
- Sent with the existing `owner_send_message(p_to = app member ids)`; push goes out by the existing trigger.
Typical uses: festival wishes (+offer), renewal reminder, polite dues reminder, we-miss-you, gym closed / timing
change, birthday wishes, new batch / event / challenge, Google review request, referral push.

### C. Change gym data (confirm card; 1 credit when SAVED)
| id | Example | Runs (existing CrmData method) |
|---|---|---|
| `add_member` | "Rahul Sharma 98xxxxxxx0, 3 mahine Gold, 4500 cash" | createMember + sellMembership (+ payment) |
| `renew` | "Priya ka plan renew karo 1 mahina, UPI 1500" | sellMembership (start = day after current end) |
| `record_payment` | "Amit ne 2000 diye cash me" | recordPayment against his open due |
| `extend` | "Neha ka plan 7 din badha do, bimar thi" | extendMembership(days, reason) |
| `add_enquiry` | "Kal ek ladka aaya tha Rohit 98..., PT chahiye, Monday call karna" | createEnquiry |
| `add_expense` | "Bijli ka bill 3200 diya" | addExpense |
The card shows every field as an editable row (member picked from OUR list by name match, never invented; if two
match, he picks; if none, "Add as new member?"). Money rows are bold. Save uses the same validation as the forms.

### D. Create content (draft; 3 credits when SAVED)
`draft_workout_plan` / `draft_diet_plan` {for member or a goal, days, level, notes} -> a draft plan saved with
`saveWorkoutPlan` as a DRAFT for the trainer to check (never sent straight to a member). v1.1 if the plan schema
makes v1 too big; the catalogue entry exists from day one with "Coming soon" never shown (rule: no lookalike stubs).

### E. Talk back and show the way (FREE)
His rule (12 Nov 2026): "a holistic solution". It answers questions from the gym's data, helps with settings,
and when it cannot do a task itself it shows WHERE to do it, with a button that opens that page.
- `ask_back` {question, options[]} when the request is unclear ("Which Rahul? Rahul Sharma / Rahul Verma").
- `open_page` {page, steps[], why} for anything it cannot do itself, and as the follow-up of every how-to answer:
  "Plan prices change in Plans. Tap the plan, then Edit price." + button "Open Plans". `page` is an id from a fixed
  PAGE CATALOGUE in our code (every route in CrmApp `Screen()` with its owner-facing name and what you do there, e.g.
  plans, members, member-add, dues, collections, expenses, messages, member-messages, attendance/visits, enquiries,
  trainers, workouts, diet, settings sections (gym details, timings, batches, member app, QR check-in, staff, billing,
  logo/colours), growth, reports, import, help). The AI never invents a path; unknown = the help search.
- `how_to` answers come from the help articles (existing /api/help), each with its `open_page` button(s).
- `cannot_do` {reason} only when not even a page fits ("I can't call members for you.").

### F. More questions from the gym's data (read-only, FREE)
Beyond section A: member counts (active, by plan, by gender, by batch), new joins and leavers in a period, plan list
with prices, revenue by plan, expenses by category and profit, today's check-ins and who is inside, enquiries by
status and follow-ups due today, trainers' PT members and sessions, members without the app, birthdays this week,
one member's full picture (plan, dues, last visit, trainer). Each answer = our own report numbers + "Open <page>".
If a question needs data we do not have, it says so and offers the nearest report, never a guess.

## 3. Credits (prices decided by Claude, 12 Nov, under his delegation)
Real AI cost (Haiku 5.5 at $0.10/M in, $0.50/M out, help.js rates): question ~Rs 0.05, draft ~Rs 0.1, plan
~Rs 0.2, voice ~Rs 0.03-0.12. So credits are value pricing, kept simple:
- **Asking is free.** Voice is free. Rewrites are free. Errors, questions back and cancelled drafts are free.
- **A credit is spent only when a task is DONE**: a message sent, a member/payment/enquiry/expense saved = 1 credit.
  A workout or diet plan saved = 3 credits. The cost is printed on the button before he taps it.
- **Free credits (owner, 12 Nov, R-470 — replaces the old 30 welcome + 20/60 a month):**
  - **Trial: 20 starter credits, once per gym** (reason 'welcome'), so an owner can taste it. Real AI cost to us
    about Rs 2-4 a gym. No monthly free credits during the trial.
  - **Monthly plan (Starter or Pro): no free credits.** Packs only.
  - **Yearly plan or founding lifetime: 100 free credits every month** (IST month, not carried over, used before
    pack credits), while `gyms.billing in ('yearly','lifetime') and paid_until > now()`. Real cost to us about
    Rs 15 a month at most (~2% of a yearly Starter). The website shows it on the yearly price only:
    "Yearly: 100 AI credits every month, free".
  - Asking stays free on every plan and in the trial (fair use 50 a day, 10 voice minutes); a trial gym gets
    20 requests a day (cost guard: a 3-month trial must not cost more than it can earn).
  - The AI Assistant button shows for every owner, trial or not. At 0 credits asking and drafts still work; the
    send/save button says "Get credits to send" and opens the packs.
- **Packs** (never expire, used after the month's free ones): Rs 149 = 50 credits; Rs 399 = 150 credits (marked
  "Most popular"); Rs 999 = 500 credits. Prices exclude GST like the plans (check plans.ts wording).
- Low balance (<= 5): a quiet line on the assistant screen. No pop-ups. At 0: tasks still draft; the button says
  "Get credits to send" and opens the packs sheet.
- Fair use (cost guard, not a sales tool): 50 AI requests a gym a day, 10 voice minutes a day; HQ can raise per gym
  (owner asked 12 Nov, R-467: free asking still costs us). At the limit: "You have asked a lot today. The AI Assistant
  is back tomorrow morning." Worst case one gym at the limit every day ~Rs 300 a month; a normal gym ~Rs 30-60.
- Buying: while BILLING_ONLINE_ON is false, "Buy" opens the existing Pay MettleUp path with the pack as the item and
  HQ adds the credits after the payment shows (HQ "Add credits" button). With online billing on (test mode until he
  says "payments live"), the HQ billing worker sells packs like plans and credits are added by the webhook.
- Global safety cap: assistant AI spend <= $15 a month to start (D1 counter, like help.js; secret ASSIST_CAP_USD
  overrides). Raise it by about $1.5 (Rs 130) per paying gym as gyms join, so one busy month never switches the
  feature off for everyone. Help answers keep their $80.

## 4. Privacy and safety
- Sent to the AI: the owner's sentence (phone numbers and emails masked in the browser as [PHONE_1]... and put
  back after), today's date, gym name, plan names/prices/durations, batch names, trainer first names, the message
  language. NEVER the member list, phones, dues or attendance: the AI picks a report; our code fills it.
- Exceptions, needed for the task itself: names he types; a member's name when he asks to message one person.
- Voice audio goes to the speech service and is not stored by us.
- Owner only (staff and trainers do not see it), every request and action logged in `gym_ai_tasks` (his history).
- Prompt rule: the AI treats the sentence as a request, never as instructions to change its rules; tool schemas are
  strict; our code re-checks every field (member exists, amount > 0, dates sane, audience valid).
- Privacy page: one new line (his yes needed before deploy). Draft in 05-words.md.

## 5. Voice
- Browser records (MediaRecorder, opus/webm, max 30 s, tap to start, tap to stop, live timer and level bar).
- `/api/assist/voice` -> Sarvam Saaras (secret SARVAM_API_KEY, mode codemix, Hinglish in Latin+Devanagari) when set;
  else Groq whisper-large-v3 (existing GROQ_API_KEY, language hi) ; else the mic button is hidden.
- The transcript lands in the text box, editable, and is sent with a "spoken" flag. The plan card repeats key
  names and amounts in bold so a mishearing is caught before Send.
- Test set: 30 owner-style clips (names, rupees, "PT", "dues", dates) before choosing the default for good.

## 6. Where it lives (UI)
- **Entry point (owner, 12 Nov, R-468): a bright floating "AI Assistant" button, bottom right, on every page** (owner
  only; canvas boards 8-10). Orange pill with a sparkle icon, 56-58 px tall.
  - Computer: 28 px from the right and bottom edges. A tap opens a 420 px side panel on the right (the Assistant home:
    Today for you, Try saying, the type/speak box). The page stays visible and usable behind it; X closes it.
  - Phone (and the installed admin app): 16 px from the right, just above the bottom bar (bottom 90 px). A tap
    opens the full Assistant screen. While the owner scrolls down a list it shrinks to a round sparkle button and
    grows back when scrolling stops or goes up. Every page gets extra space at the bottom so the last row and its
    buttons are never hidden behind it.
  - Hidden: on the Assistant screen itself, while a pop-up sheet or the keyboard is open, for desk staff and
    trainers, and while toasts or the undo bar show (they sit above it at bottom 92 px, centred: no overlap).
- Nav: "AI Assistant" (owner only) under Today on a computer; phone More list too. Route `/assistant`.
- Today screen: an "Ask AI" bar + "Today for you" (top 2 ideas) linking to /assistant.
- /assistant: balance pill (top right, opens Credits sheet); composer (text box "Type or speak — Hindi or
  English", mic, send); first visit: "Try saying" examples in groups (Messages, Members, Money, Questions) — tapping
  one fills the box; "Today for you" ideas; then the conversation of request -> cards; History tab.
- Voice: while listening, a timer and "Up to 30 seconds"; then "What I heard (you can fix it)" with two buttons:
  "Cancel" and "Send to AI Assistant" (owner, 12 Nov 2026, R-466: never "Done, use this").
- Cards: AnswerCard, MessageCard, ChangeCard, AskBackCard, CannotCard, all in kit.tsx style.
- Credits sheet: balance, this month's free left, packs, history of spends.
- HQ: per-gym balance + "Add credits" + month usage.
- Designed first on the Claude Design canvas (phone 390 + desktop 1280, light + dark).

## 7. Server contract
### Supabase migration 0071_ai_assistant.sql (NOT APPLIED until his yes)
- `gym_ai_credit_ledger` (id, gym_id, delta int, reason text check in (welcome, monthly, purchase, grant, spend,
  refund), task_id uuid null, note text, month text null, created_at). Unique (gym_id, reason, month) for monthly,
  unique (gym_id) where reason='welcome'.
- `gym_ai_tasks` (id uuid, gym_id, created_at, request text <= 600, spoken bool, actions jsonb, status text check in
  (drafted, done, cancelled, failed), done_at, credits int, result jsonb).
- RPCs (owner only via `_owner_only_gym(p_key)`):
  - `owner_ai_wallet(p_key)` -> {balance, free_left, monthly_free, plan, packs[]} — grants welcome + this month's
    free credits lazily (idempotent).
  - `owner_ai_task_save(p_key, p_id, p_request, p_spoken, p_actions)` -> saves a drafted task (no charge).
  - `owner_ai_spend(p_key, p_task_id, p_credits, p_result)` -> atomic: checks balance, writes 'spend', marks task
    done; raises NO_CREDITS. Called by the browser right BEFORE it runs the action; on failure the browser calls
    `owner_ai_refund(p_key, p_task_id)` (only refunds a spend of that task within 10 minutes, once).
  - `owner_ai_tasks(p_key, p_limit)` -> history.
  - HQ: `hq_ai_grant(gym_id, credits, note)` via the service key (HQ worker).
- Tests in supabase/tests/0071_ai_assistant.sql (balance, double spend, refund once, staff refused, monthly once).

### Panel worker deploy/panel/assist.js
- `POST /api/assist` {text, spoken, lang, ctx:{gym, today, plans[], batches[], trainers[], messageLang}} with
  X-Forge-Key -> owner check via `staff_me` (like aiMatch.js) -> D1 fair-use counter (`ai_usage` kind 'assist')
  -> monthly $ cap (`assist_usage`, like help_usage) -> Claude `claude-haiku-5-5`, cached system prompt, tools =
  the catalogue, tool_choice any, max 3 tool calls -> returns {actions:[{tool, input}], note?}. No credit spend
  here (asking/drafting is free); spend happens on Send/Save via the RPC.
- `POST /api/assist/rewrite` {draft, how} -> same guard; returns the rewritten title/body.
- `POST /api/assist/voice` (audio body, <= 30 s / 1 MB) -> {text, provider}.
- Secret: CLAUDE_ASSIST_KEY, falling back to CLAUDE_HELP_KEY. Tests: deploy/panel/assist.test.mjs with a fake
  Anthropic client (no real calls in CI).

## 8. "Pro + AI" goes away
- plans.ts: keep the 'ai' id valid (old rows, old migrations), drop it from every place that shows or sells it.
- Landing page pricing: the third card becomes "AI Assistant — on every plan" (free monthly credits per plan, packs
  from Rs 149). Words in 05-words.md; public website words shown to him before deploy.
- **Website feature section (owner, 12 Nov, R-469):** mettleup.fit gets its own "AI Assistant" section, not only the
  pricing card. Three real examples, one of each kind, each shown as a short self-looping demo (typed or spoken line
  -> the card the assistant makes), in English with the Hinglish line as said:
  1. Ask: "Kisne paise nahi diye?" -> "14 members owe Rs 38,500" + "Remind them politely".
  2. Message: "Kal gym band rahega, sabko batao" -> the message, shown before it goes, sent in the app.
  3. Change: "Rahul ka plan 3 mahine renew karo, 4500 cash" -> renewal ready to save, receipt made.
  Plus one line: "Speak in Hindi or English. Asking is free." **No Diwali or other dated festival example** (owner:
  Diwali has gone). Claims rule (mettleup-marketing): the section says "Coming soon" until the feature is live in
  the panel; the words pass member-words and his yes before deploy.
- HQ, billing, tests, docs updated; old migrations never edited.

## 9. Order of work
1. Canvas design (phone + desktop) -> screens agreed.
2. Parallel: (a) server: 0071 + tests + assist.js + voice + HQ grant; (b) panel UI + local report tools + suggestions
   + festival calendar; (c) Pro + AI replacement + help articles (unreleased) + ADMIN_NEWS_PENDING + words.
3. Real-AI test set (~60 sentences, made-up gym) run once, cost ~Rs 10.
4. CI green, UAT pictures at 390 and 1280, fresh-eyes review.
5. His yes: live migration 0071, privacy line, website words. Then panel deploy (feature hidden until the wallet RPC
   answers, so a deploy before the migration shows nothing).
