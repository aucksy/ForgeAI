# F201 AI Assistant: panel status

## 12 Nov 2026: catalogue + panel logic (no screen yet)

**Pushed**
- `e86b250e`: `deploy/panel/assistCatalogue.js` (+ `.d.ts`, + `assistCatalogue.test.mjs`, 6 node tests). 21 tools with
  strict schemas, kind and credits; 51 pages, each a real route and every menu row covered; 32 "Try saying" examples.
- `d7f5217b`: `apps/dashboard/src/crm/assistant/` (pure logic) + `test/crm/assistant/` (5 files, 52 tests) +
  `appIdsOf` in `logic/audience.ts` (Messages uses it too) + the microphone allowed for the panel itself.

**What each file does**
| File | Job |
|---|---|
| catalogue.ts | Re-exports the shared catalogue; `Line` = English words + values, shown through `t()`. |
| mask.ts | Phones/emails become `[PHONE_1]`/`[EMAIL_1]` before anything leaves the browser; put back after. |
| context.ts | The only gym data sent: gym name, today (IST) + weekday, plans, batch names, trainer first names, message language. |
| match.ts | Names as owners type and say them: Preeti/Priti, Pooja/Puja, Wikas/Vikas, Devanagari from voice, first name only. |
| answer.ts | Every "ask" tool answered locally with the panel's own functions. Card: headline, number, up to 8 rows, total, "See all" page, follow-ups. |
| plan.ts | Every message/change/content action becomes an editable draft, checked with the forms' own rules and the message limits. |
| execute.ts | Only on Confirm: spend credits, save through the store's own methods, refund on failure, once per task. |
| festivals.ts | 24 festivals dated 2026-2028, sources in the file. |
| suggestions.ts | "Today for you": up to 4 free cards, each pre-filling a sentence. |
| api.ts | `/api/assist`, `/rewrite`, `/voice`; wallet and history RPCs. Calm words, every failure logged. |
| voice.ts | 30-second Opus clip with a level meter; hidden when the browser cannot record. |

**Found while building (changes to the design)**
1. **Credits are per task, not per action.** `owner_ai_spend` allows one spend per task id (`ALREADY_SPENT`), and
   `owner_ai_refund` gives the whole task back. The screen must confirm a task's drafts together, or save each draft as its
   own task. A failed task is retried as a NEW task id; steps that already saved are skipped (execute.ts remembers them by
   the draft's requestId).
2. **Workout and diet "content" (3 credits) are ready-made plans, not AI writing.** The tool inputs carry goal, level and
   days only; the panel picks from `READY_PLANS` (5) and `STARTER_DIETS` (3) and saves the copy with nobody assigned.
   Charging 3 credits for picking a template may feel steep: either make them 1 credit or have the worker write the plan.
3. **The microphone was blocked** by the panel's own `Permissions-Policy: microphone=()`. Now `microphone=(self)`.
   `isVoiceSupported` also reads the policy, so the button hides if it is ever blocked again.
4. **An expense has no payment method**; a method he says goes into the note ("· UPI").
5. **An enquiry has no notes field**; notes go after the interest ("3 months · evening").
6. **"Not seen for N days"** with an explicit N is a plain day count (running plan, no visit in N days). Without N it
   is the "Losing the habit" list (rhythm-based), so the two can differ.
7. **"Who is inside now"** has no check-out to read: it means "checked in during the last 90 minutes".
8. **The worker refuses desk staff** ("Only the owner can use the AI assistant"), so `seeTotals` matters only if
   staff are let in later.
9. **Haiku 5.5 with forced tool choice skips thinking** (design §7 asks for it). Fine for picking one tool; worth
   an eval before launch.
10. **Strict tool use allows 20 strict tools**: `cannot_do` is the 21st and is not strict (the catalogue test checks it).
11. **Hinglish**: the new owner words are English `Line`s; their Hinglish entries go into `lang/hinglish.ts` with the
    screen, when `t()` draws them.

**Next (the screen step)**: the AI Assistant button and panel, its cards, the voice button, "Today for you" on Home, credits in
Settings, the Hinglish lines, UAT at phone and desktop width.

## 12 Nov 2026: checked against the changed spec (03-design, R-470)
- **Name**: nothing in the logic said "AI Helper"; the microphone note in `_headers` and this note now say "AI Assistant".
  The logic has no voice confirm button (that is the screen step, which must say "Send to AI Assistant").
- **Credits**: the logic never hard-codes free credits; it shows what `owner_ai_wallet` sends (`monthlyFree` can be 0).
  The out-of-credits line now matches the spec's button: "You have no AI credits left. Get credits to send this."
  (test updated in the same commit).
- **Who sees it**: no logic file decides who sees the assistant; the screen step adds the owner-only floating button
  (420 px side panel on a computer, full screen on a phone).
- **Server still on the old numbers (not mine to change)**: `supabase/migrations/0071_ai_assistant.sql` grants 30
  welcome credits and 20/60 a month (`_ai_monthly_free`, `_ai_grant`). It must become 20 once in the trial, 0 on
  monthly plans, 100 a month on yearly/lifetime while paid. The fair-use limits (50 a day, 20 in the trial, 10 voice
  minutes) live in the worker (`assist.js`), also not this step.

## Cloud check (CI job `check`)
- `d7f5217b` (panel logic): run 43255510354, passed (type check, unit tests, promise ratchet, build, panel crawl).
- `1fa48009` (spec match + this note): run 43256824627, passed.
- Tests: catalogue 6 node tests; assistant 52 vitest tests in 4 files, plus 1 new audience test.
