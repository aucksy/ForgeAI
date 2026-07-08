# ForgeAI — session entrypoint (read me first)

Premium Android **demo app for gym owners**: every member gets an AI coach that
remembers everything (workouts, nutrition, PRs) so leaving the gym means leaving
your coach behind. Full requirements: `docs/PRD.md`. Module APIs: `docs/CONTRACTS.md`.
Live status: `PROGRESS.md`.

**Monorepo (npm workspaces).** The Expo member app lives in **`apps/mobile/`**, the owner
web dashboard in **`apps/dashboard/`**, shared code in **`packages/`** (e.g. `packages/theme`).
Any `src/…` or `android/…` path below is under **`apps/mobile/`**. Repo-level `docs/`,
`supabase/`, `PROGRESS.md` and CI (`.github/`) stay at the root. Install once with `npm install`
at the repo root (hoists all workspaces); the mobile Metro config watches the workspace root.

**▶ CURRENT FOCUS (2026-07-08 pivot).** Near-term goal: make the **manual workout tracker + its
analytics** best-in-class — **simple, clean, user-friendly and robust, like the Hevy app**. That is
the priority build track now. **AI coaching AND nutrition/calorie tracking are DEFERRED to the end**
(the AI/chat + `localCoach` layer stays in the app but is not the focus; B2B2C Phase 3 = AI proxy
moves *after* the manual-tracker track). Today, workouts are logged via the AI chat — a first-class
manual logging flow (routines/templates → active-session set logging → history/PRs/charts) mostly
needs to be BUILT, on top of the existing SQLite tables + `src/engine`. A fresh session will
deep-research Hevy/peers and plan it — see `PROGRESS.md` and `docs/PLAN.md` (PRODUCT PIVOT).

## Stack & conventions (mirrors ColorCloset)
- Expo SDK 56 / RN 0.85 / TypeScript strict / expo-router / Zustand / expo-sqlite /
  Reanimated 4 / react-native-svg charts / SecureStore for API keys.
- Path alias `@/* -> src/*`. All weights kg; `dateISO='YYYY-MM-DD'` local days.
- Theme: `src/theme/tokens.ts` — dark-only, ember accent; chart palette is
  CVD-validated, DO NOT reorder `chart.series`.
- Build: **cloud-only via GitHub Actions** (tag `v*` -> signed APK/AAB Release);
  local toolchain is deleted — NEVER build Gradle locally. `android/` will be
  committed (generated once via `npx expo prebuild`), CI builds it directly.
- Git author: `simpleapps108@gmail.com`. Node: prepend `%LOCALAPPDATA%\nodejs` to PATH.
- Ship gate: compile-review + adversarial logic review BEFORE tagging (never after).
- After every release: paste the direct `.apk` download URL in chat.

## Architecture in one breath
SQLite is the source of truth (`src/db`), pure coaching logic in `src/engine`,
DB-orchestration in `src/services`, the AI layer (`src/ai`) exposes tools over the
same repos — cloud providers (Anthropic/OpenAI REST, keys in SecureStore) with a
deterministic `localCoach` fallback so the demo works with NO API key. Chat renders
structured cards, not just text. Demo data seeds 3 months of realistic history on
first launch (`src/db/seed`).

## User-gated items (ask, never hardcode)
- GitHub repo creation + push URL, Actions secrets (keystore etc.) — owner provides.
- Release keystore: none exists yet; generate via CI keytool step or owner provides.
