# ForgeAI → B2B2C — Agent Build Guide

*Single source of truth for evolving ForgeAI from a single-user offline demo into a multi-tenant B2B2C product. Written for the coding agent (Claude Code). The human only needs the box directly below.*

---

## START HERE (human — 60 seconds)

1. **Create a Supabase project** (free tier). Keep the Project URL + anon key + service-role key handy — the agent will ask for them in Phase 1. This is the one thing the agent cannot do for you.
2. **In the repo folder, tell Claude Code:**
   > "Read `docs/B2B2C-BUILD.md` and follow it exactly. Begin Phase 0: understand the codebase and write `docs/PLAN.md`, then stop and wait for my approval."
3. **Your only ongoing job:** approve the plan once, then reply **"continue"** after each phase. The agent stops and reports at every phase boundary so nothing runs away.

*Optional: rename this file to `CLAUDE.md` at the repo root and Claude Code will load it automatically each session (no need to name it).*
*Business strategy (market, pricing, go-to-market) lives in a separate `business-plan.md` and is NOT needed for the build — ignore it here.*

---

## 1. Your mission (agent)

Turn the existing **single-user, offline-first** ForgeAI app into a **multi-tenant B2B2C product** (gym owners push a branded AI-coach app to their members; owners manage members from a web dashboard) **without rewriting the member app**.

The strategy is fixed and non-negotiable: **offline-first + ONE-WAY push (phone → cloud). No two-way sync.** The phone stays the source of truth for its own member; the cloud is a read-replica for the owner dashboard. This deletes conflict resolution — the hardest part of sync — entirely.

**You plan the phases yourself, then execute one phase at a time, verifying and stopping between phases.**

---

## 2. How you must work

Follow this loop for the whole project and within each phase: **Understand → Plan → Execute → Verify → Reflect.**

- **Understand first.** Before changing anything, read: `CONTEXT.md`, `docs/PRD.md`, `docs/CONTRACTS.md`, `PROGRESS.md`, `package.json`, `src/db/schema.ts`, `src/db/repos/*`, `src/ai/orchestrator.ts`, `src/app/_layout.tsx`. Build a real mental model. Honor the conventions and "gotchas" those files already document — don't re-invent them.
- **Incremental only.** Small, reviewable, reversible changes. No large untested edits.
- **Simplicity bias.** No unnecessary dependencies, frameworks, or abstractions. The simplest thing that meets the requirement wins.
- **When trade-offs arise, decide in this priority order:** accuracy → risk reduction → simplicity → maintainability → cost → performance → speed. Never sacrifice correctness for speed.
- **Communicate concisely.** Separate facts from recommendations. Flag assumptions explicitly.

---

## 3. Hard constraints (never violate)

1. **The offline demo must keep working 100% offline after every phase.** It is the sales tool. Gate all cloud features behind a flag; in demo mode the app must make zero network calls and still fully work (log workout/meal, dashboard, analytics, `localCoach`). Verify this at the end of every phase.
2. **One-way push only** (phone → cloud). Never build cloud-to-phone writes or two-way sync.
3. **Do NOT modify** `src/engine/*`, `src/components/ui/*`, `src/components/charts/*`, or any repo function signature defined in `docs/CONTRACTS.md`. These are tested and other layers depend on their exact shape. **Add new modules instead**, and respect the repo's one-owner-per-file rule.
4. **Do NOT add `user_id`/`tenant_id` columns to the local domain tables.** The phone already is one member. Store `member_id` + `tenant_id` in the existing `meta` table and attach identity only at the sync layer.
5. **TypeScript strict; no `any` in exported signatures.** Match existing conventions: kg for weight, `dateISO = 'YYYY-MM-DD'` (local day), epoch-ms timestamps, path alias `@/*`.
6. **Builds are cloud-only** (GitHub Actions on tag `v*`). Do NOT build Gradle locally. Your verification is `npm run typecheck` + logic review + the offline-demo check. The human tags to trigger the real build.
7. **Secrets stay server-side** (from Phase 3 onward). Never hardcode or commit API keys. The member app must not ship your AI key.

---

## 4. STOP and ask the human — never guess these

- Supabase Project URL + keys (needed in Phase 1).
- Groq API key (needed in Phase 3).
- Any GitHub push, repo creation, Actions secrets, or release keystore.
- Any deviation from the constraints in §3.
- Anything destructive or irreversible (dropping data, force-push, deleting files).

The repo already treats credentials and pushes as user-gated — keep that discipline.

---

## 5. Target architecture (the spine)

```
MEMBER APP (existing Expo app — core UNCHANGED)
  SQLite = source of truth for this member (offline-first)
  + auth (sign in / join gym by code) → identity stored in `meta`
  + one-way push: after each log, upsert a summary to the cloud
  + AI via your backend proxy (not a user-pasted key)     [Phase 3+]
        │ push (phone → cloud only)
        ▼
SUPABASE
  Postgres: tenants, profiles(role), memberships, checkins,
            + mirror/summary tables for workouts/nutrition/PRs   (RLS: a gym sees only its own)
  Auth: members, trainers, owners
  Edge Function: Groq AI proxy (key server-side, per-gym limits) [Phase 3+]
        ▲ reads
OWNER DASHBOARD (new small Vite + React + TS web app)
  members · active-vs-at-risk · renewals · attendance · branding · billing
  reuses src/theme/tokens.ts for visual consistency
```

---

## 6. Recommended phases — you own the detailed plan

In **Phase 0**, write `docs/PLAN.md` containing, for **each** phase: scope, exact files to add/edit, success criteria, and risks. Use the order below unless you can justify better. Do not expand scope beyond the current phase.

| Phase | Goal | Notes |
|---|---|---|
| **0 — Understand & plan** | Read the codebase; write `docs/PLAN.md`; confirm with human. | No app code. |
| **1 — Cloud foundation** | Supabase schema + RLS; auth; join-gym-by-code; identity in `meta`; one-way push of summaries. | Demo stays fully offline. Human provides Supabase creds. |
| **2 — Owner dashboard (read-only)** | New Vite+React+TS web app: members, last-active, streaks, at-risk list. | The artifact that sells gyms. Reuse `src/theme/tokens.ts`. |
| **3 — Groq AI proxy** | Edge Function proxy so members don't paste keys. New `src/ai/providers/backend.ts` + orchestrator branch + settings toggle. Keep `localCoach` as the free tier. | Text: Llama 3.3 70B. Meal photos: a Groq vision model (Llama 4 Scout/Maverick) — **if macro accuracy on Indian food is weak in testing, route only photos to Claude/OpenAI, keep the rest on Groq.** Voice: Groq Whisper. Human provides Groq key. |
| **4 — Owner operations** | Memberships + renewals + attendance in dashboard; WhatsApp reminders (approved provider). | The owner's operational lock-in. |
| **5 — Billing** | Razorpay (UPI, subscriptions, GST); convert free gyms to paid. | Revenue. |
| **6 — Scale (do NOT start without explicit go-ahead)** | True white-label, member premium + revenue share, academies. | Deferred by default. |

**Privacy (from Phase 1 on):** once real member health data goes to the cloud, add consent at onboarding, enforce RLS isolation, and provide a deletion path (India DPDP Act 2023).

---

## 7. Phase workflow — repeat for every phase

1. Re-read the relevant section of `docs/PLAN.md`.
2. Implement in small increments.
3. **Verify (all must pass):** `npm run typecheck` green · offline demo fully works with no network · no protected file (§3.3) touched · every success criterion for the phase met.
4. Update `PROGRESS.md`: what changed and exactly how you verified it.
5. Commit in small, clearly-described steps (use `git commit -F <file>` if a message contains quotes).
6. **STOP.** Post a short report: what you did, how you verified, what the human should check, whether it's tag-ready for a CI build, and what the next phase will do. Then wait for **"continue"**.

---

## 8. Definition of done (per phase)

A phase is done only when: its success criteria are met, `typecheck` is green, the offline demo is intact, and `PROGRESS.md` is updated. Phases **1, 2, 3, and 5** are natural shippable checkpoints — tell the human when each is tag-ready.

---

## 9. Reflect (after each phase, record in `PROGRESS.md`)

- Is there a simpler solution than what I built?
- Is anything over-engineered or a needless dependency?
- What assumptions remain unverified?
- What could break in the future, and what would be hard for the next maintainer to understand?

---

### One-line summary for the agent
Read the repo, write `docs/PLAN.md`, get approval, then build phase by phase — offline-first, one-way push, Groq for AI at Phase 3 — never breaking the offline demo, stopping and reporting after each phase.
