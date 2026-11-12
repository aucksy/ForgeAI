# F201 privacy lines (draft, NOT on the live page; needs the owner's yes, word for word)

Checked against the code on 12 Nov 2026: deploy/panel/assist.js (what Claude sees: the header comment, cleanCtx,
assistSystem / assistPrompt; masking: maskText; voice: Groq unless SARVAM_API_KEY is set) and deploy/panel/assistPlan.js
(the workout plan writer: checkPlanAsk, planSystem / exerciseListText / planPrompt). The 400 days: owner_ai_task_save and, every night for every gym, hq_ai_purge_old (0071, HQ worker nightly; R-477).
Sarvam is NOT named because its key is not set; add a
Sarvam line (and check Sarvam's own retention terms first) only when that key goes in.

## 1. New bullet in section E (the gym side), right after "Importing an old member list"

> **The AI Assistant (gym owners only):** what the owner types or says goes to Anthropic's Claude AI so it can
> understand the request and get a message or a change ready. With it go today's date, the gym's name, its plan
> names, lengths and prices, batch names and trainers' first names. Mobile numbers, email addresses and long card or
> account numbers in the request are hidden before it is sent. A member's name goes only if the owner says it. The
> AI gets no member records: the admin app looks those up itself. When the owner asks to change a message's
> wording, Claude reads that message. When the owner asks it to write a workout plan, Claude gets the goal, level,
> days a week and session length he picks, his short notes on focus and equipment (including any injury he
> mentions, with mobile numbers and emails hidden) and the names of the gym's exercises; never the member's name or
> records. A spoken request goes through our server to Groq, which turns it into text;
> neither we nor Groq keep the recording. Anthropic does not use any of this to train its AI. We keep each request,
> what the owner did with it and the credits it used for 400 days, so the owner can see them in the admin app.
> After 400 days the request and its words are deleted; only the number of credits used stays, for our accounts.

## 2. Table of outside companies (section on who we share with)

- Anthropic (Claude) row, "What for": add "Understands AI Assistant requests, rewrites message drafts and writes
  workout plans from the gym's exercise list."
  "What they see": add "the owner's request with mobile numbers and emails hidden; the gym's plan, batch and
  trainer first names; for a workout plan, the goal, level, days and the owner's short notes, and the gym's
  exercise names".
- Groq row, "What for": "Turns spoken feedback and spoken AI Assistant requests into text".

## 3. "What changed" line at the top
"[date]: added the AI Assistant for gym owners (what goes to Claude and Groq)."
