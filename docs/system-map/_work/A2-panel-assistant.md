# A2-panel-assistant checkpoint

- [x] 1. Read the source list (30 lines)
- [x] 2. Opened the code at each item (about 2,050 code lines read, limit 2,500)
- [x] 3. Switches and plan gates noted (below)
- [x] 4. Items grouped into features
- [x] 5. 18 feature rows written: F-panel-900 to F-panel-917 in docs/system-map/_work/out/A2-panel-assistant.jsonl
- [x] 6. No not-a-feature rows needed: every file belongs to a feature; no demo copy (the assistant is hidden in the demo gym)
- DONE: all 30 source lines are in a row's sources (checked by script: missing = none)

## Switches and gates met
- Whole assistant hidden until owner_ai_wallet answers ok (server migration 0071): useAssistant.ts:119-128, api.ts:333-338
- Owner only, real online gym only (not staff, trainer, demo, browser-only gym): useAssistant.ts:101-106
- Panel worker can switch it off (503 reason off / demo): useAssistant.ts:74-77
- aiCharge (Worker AI_CREDITS_CHARGE, GET /api/switches): question counts and "AI answers for members" show only when on: useAssistant.ts:14-17, 127
- "AI answers for members" needs server 0083; question counts need 0078: api.ts:276-298
- WORKOUT_PLANS_ON code constant (true): ui/AssistantHome.tsx:32
- No Pro-only gate in this area. Credits meter it: 1 credit per message/change, 3 per workout plan (CreditsSheet.tsx:178-179); free monthly credits differ by plan, numbers come from the server (api.ts:324-328)
- Daily question limit from the worker (429 limit / q_limit): allowance.ts:25

## Seen in passing
- useAssistant.ts:5-6 comment says "Today the live server has no 0071, so nothing shows on the live panel", yet logic/whatsNew.ts:215,243 advertises "Open the AI Assistant". One of the two is stale; live state not checked here (no database reads in this step).
- execute.ts:200-205 still holds a working "save diet plan" step and conversation.ts:374 a "Save diet plan" label, while the only diet card says "cannot write diet plans yet" (Cards.tsx:121-131). Looks like dead code; not confirmed unreachable (plan.ts:478-479 not read in full).
- execute.ts:288-296: if the refund call fails after a failed step, the owner keeps the charge and only a console warning is left; the result carries refunded=false but whether the card tells him was not read.
- CreditsSheet.tsx:179 hard-codes "3 credits" for a workout plan and Cards.tsx:147 PLAN_CREDITS = 3, beside the catalogue's TOOL_CREDITS: a hand-typed number that can drift.

## Could not check
- Whether the assistant is on for any live gym (needs the database or the live Worker; out of this step).
- deploy/panel/assistCatalogue.js (tool list, prices, examples) is outside this area; only its export line was read.
- plan.ts, answer.ts, Cards.tsx were read at their headers, export lists and chosen spots only (size limit), not line by line.
