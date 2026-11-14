# F209: every AI question is paid from the gym's AI credits (20 questions = 1 credit)

Owner decision 14 Nov 2026 (R-519 point 4, tracker #97). Built 14 Nov 2026, **hidden until migration 0078 is applied
live** (nothing changes for anyone before that).

## What people see once 0078 is live

- **Members (member app help, member site help):** an AI answer as today, paid from the gym's credits, up to 10 AI
  answers a day each. With no credit left, or after their 10: the matching help pages (no AI call), never an error.
  Members never read the word "credits": they read "AI answers are not on at your gym right now." or "You have used
  today's 10 AI answers. AI answers come back tomorrow."
- **Front desk (admin app help box):** the help pages, then "Ask your gym owner to get more AI credits."
- **Owner (AI Assistant and the help box):** AI Assistant says "Every 20 AI questions use 1 credit." With no credit
  for a question: "Your gym has no AI credits left. Tap your credits at the top to get more." and the credits sheet
  opens. The help box shows the help pages and an "Open AI Assistant" button.
- **Credits sheet:** "AI questions and drafts: 20 for 1 credit"; "AI questions this month": You, Your staff, Members
  (Gym page visitors once there are any), the credits they used, and members' daily number. The low warning starts at
  10 credits and says members get help pages when credits run out. Each block of 20 shows as "20 AI questions -1".
- **"Credits low" alert:** once, when a spend takes the gym to 10 credits or fewer (again only after a top-up), to the
  owner through the existing alerts (Today, Needs you, web push 0075/0076). Lines at 0 and 1 credit say so.

## Limits (one place each: `_ai_q_rules()` in 0078)

| Who | AI questions a day |
| --- | --- |
| Each member | 10 |
| Each gym page visitor (not built yet; the call is ready) | 3 |
| Owner or each staff person | 60 |
| All members of one gym together | 200 |
| All visitors of one gym together | 30 |

20 questions = 1 credit, prepaid: the first question of each 20 takes 1 credit, so no unpaid AI answer is ever given.
A question the AI did not answer is given back. Solo members (no gym) and older apps send no key: answered as today.

## Cost per question (COMPUTED, not measured: no test key exists)

Claude Haiku 5.5, $0.10 / $0.50 per million tokens, Rs 88 a dollar, about 13,000 input tokens of help pages per
answer and about 150 out. Cache writes cost 1.25x (5 minutes) or 2x (1 hour), reads 0.1x.

| | Before (5-minute cache) | After (1-hour cache, one prefix for every gym) |
| --- | --- | --- |
| A question with no other in the cache time | about Rs 0.15 | about Rs 0.24 (first in an hour) |
| A question while the cache is warm | about Rs 0.02 | about Rs 0.02 |
| 20 questions, worst case | about Rs 3.0 (each more than 5 min apart) | about Rs 0.6 (all gyms together keep it warm) |

A credit sells for Rs 2.0 to 2.98 (packs Rs 999/500 to Rs 149/50). The help box's monthly cost cap now counts cache
writes and reads at their real prices (it counted cache reads at full price before). The owner's AI Assistant keeps
its 5-minute cache (an owner asks in bursts): about Rs 0.08 a cold ask, about Rs 0.03 warm.

## Turning it on (needs the owner's yes)

1. Apply `supabase/migrations/0078_ai_questions.sql` live, then run `supabase/tests/0078_ai_questions.sql`
   (ends `RESULT PASS (...)`).
2. Deploy the panel Worker (it already sends the signed calls; before 0078 they answer "no such function" and are
   skipped). `PHONE_CODE_SECRET` is the signing secret (the same one 0061 uses), so nobody can spend a gym's credits
   by calling the gym server directly.
3. The member app sends the member's key from its next release (help from older apps stays uncounted).
4. The same day: change the public words below and the in-app help article (they say asking is free).

## Public words that say asking is free: DRAFTS, NOT SHIPPED (needs owner yes)

1. `apps/dashboard/public/about.html` line 30 and `docs/legal/about.body.html` line 17
   - Now: "On every plan. Type or speak what you need, in Hindi or English. Asking is free. You use AI credits only
     when the AI finishes a task for you."
   - Draft: "On every plan. Type or speak what you need, in Hindi or English. Every 20 questions use 1 AI credit. A task
     the AI finishes for you, like sending a message, uses credits too."
   - Draft table row to add: "Answers 20 questions (from you, your staff or your members) | 1"
2. `apps/dashboard/public/home/index.html` line 866 (the home page; `test/crm/retiredAiPack.test.ts` checks it)
   - Now: "Speak in Hindi or English. Asking is free." / "हिंदी या English में बोलिए। सवाल पूछना फ़्री है।"
   - Draft: "Speak in Hindi or English. 20 questions use just 1 AI credit." / "हिंदी या English में बोलिए। 20 सवालों
     में सिर्फ़ 1 AI क्रेडिट लगता है।"
3. In-app help article "Ask the AI Assistant" (`deploy/panel/helpArticles.js`, the AI answers from it)
   - Now: "Questions, like "Who has not paid?", are free." and "...write a workout plan ... for free."
   - Draft: "Every 20 questions, like "Who has not paid?", use 1 credit." and "...write a workout plan for a member
     from your gym's exercises; writing it counts as one question."
