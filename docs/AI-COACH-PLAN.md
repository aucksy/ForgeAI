# ForgeAI — "Elevate the AI Coach" plan

**Status:** DIRECTION APPROVED (2026-07-09). No feature code yet — a fresh chat executes this
phase by phase. Entrypoint = this file + `CONTEXT.md`; live status = `PROGRESS.md`.

## Why this, now
The manual tracker is **feature-complete vs Hevy** (Phases 1–5c, shipped through v0.9.3). The tracker is
table-stakes; the app's actual moat is the thesis **"an AI coach that remembers everything, so leaving the
gym means leaving your coach."** The tracker now produces rich, structured memory — every workout, PR,
progressive-overload target, routine, RPE, superset — and the owner just wired **Groq** (`gsk_` key in
Settings → AI Coach) to power the conversational side. So the coach is finally worth elevating from
"a chat you have to ask" to **"a proactive, data-grounded coach present in the core flows."**

## The insight
Today the coach lives ONLY in the Coach tab and only acts when prompted. The engine already computes
world-class coaching (`engine/computeOverloadTarget`, `services/coach.getTodaysWorkout`,
`engine/computeRecovery`, `engine/buildInsight`) but the **manual logging UI doesn't surface any of it**.
Elevating the coach is mostly (a) surfacing the existing deterministic engine in the flows where it
matters, then (b) making the Groq-powered chat genuinely smart about the new data.

## Hard rules (unchanged from the tracker track)
- Offline-first: the app fully works with **no key / no network** after every phase. Deterministic engine
  = the offline coach; Groq/cloud = the richer layer, always gated on a key.
- **Frozen files stay frozen:** `src/engine/*`, `src/components/ui/*`, `src/components/charts/*`, existing
  repo/service **signatures** (`docs/CONTRACTS.md`). Build NEW modules; additive-only schema via
  `initTrackerSchema` (now at `TRACKER_SCHEMA_VERSION = 2`) if ever needed — never edit `schema.ts`.
- TS strict; kg; `@/* → apps/mobile/src/*`; Node not on PATH → prepend `%LOCALAPPDATA%\nodejs`.
- Ship gate: `npm run typecheck` + adversarial logic/compile review **before** tagging (never after);
  cloud builds only (tag `v*`); after release paste the direct `.apk` link. Git author simpleapps108.

## Phased plan (small, shippable, offline-safe; verify → PROGRESS note → STOP → tag)

### Phase C1 — Coach at the point of logging  ⭐ the USP move (deterministic, offline, low-risk)
Surface the progressive-overload prescription inside the **active-workout** screen, not just chat.
- Per exercise (esp. Start-From-Plan / Start-Routine), show **"Target: 82.5 × 8 — hit all reps last time"**
  from the FROZEN `computeOverloadTarget` / `getTodaysWorkout` (reuse via a NEW read service; the target +
  human reason already exist). Sits alongside the PREVIOUS column as a light prescription; tap to see the why.
- No AI call, no network, no schema — pure integration of the existing engine into `src/tracker/*` UI.
- Success: starting a plan/routine shows a per-exercise target + reason; matches the coach tab's numbers;
  offline; typecheck green.

### Phase C2 — Post-workout coach note
On the finish screen, a short coach-voice line grounded in the just-saved session (PRs, volume vs last
same day-type, one next-focus cue). Offline = `engine/buildInsight` (deterministic); with a key = a richer
Groq note (gated, falls back to the engine line). New service in `src/tracker/services/*`.

### Phase C3 — Smarter cloud coach (Groq-powered), data-grounded
Make the conversational coach actually use the new tracker data.
- Extend `COACH_TOOLS` (owned by the `ai` module) with the new memory: routines, per-exercise progress
  (RPE-aware), recent workouts incl. supersets — so the coach can answer "am I progressing on bench?",
  "what should I hit today?", "did I overreach (RPE)?" with real numbers.
- Upgrade `ai/system.ts` to reference PRs / RPE / progressive-overload targets and coach in that voice.
- **Grounding guard** (BragBuddy-style, light): a check that the coach's quoted numbers come from tools,
  never invented — the persona already says "never invent numbers"; add a smoke check.
- Note: Groq default models are **text-only** (meal-photo needs Claude/OpenAI — already handled in the
  orchestrator).

### Phase C4 (optional) — Proactive nudges on Home
Dashboard "coach" card: plateau / PR / deload / streak nudges from the engine (`buildInsight`,
`computeRecovery`, PR timeline). No AI call needed; cloud can enrich when a key is set.

## Open questions for the executing chat
1. C1 target UI: inline prescription row vs a tappable "coach" chip per exercise card? (Keep the 2-tap log
   clean — probably a subtle secondary line, opt-in expand for the "why".)
2. C2/C3 cloud note: always attempt Groq when a key is set, or make the proactive coach opt-in (a setting)
   so it never adds latency/cost to a user who just wants the tracker?
3. Whether to add a tiny eval/grounding harness now (C3) or defer.

## Not in scope here (still deferred, separate tracks)
Nutrition/calorie tracking as a first-class UI · B2B2C cloud Phase 3 managed-AI proxy (client-side Groq
covers "bring your own key" for now) · Play Store prep + release keystore + real Google client ID for Drive
· iOS. See `PROGRESS.md` / `docs/OWNER-TODO.md` for owner-gated items.
