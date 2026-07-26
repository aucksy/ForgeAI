# ForgeAI — session entrypoint (read me first)

Premium Android **demo app for gym owners**: every member gets an AI coach that
remembers everything (workouts, nutrition, PRs) so leaving the gym means leaving
your coach behind. Full requirements: `docs/PRD.md`. Module APIs: `docs/CONTRACTS.md`.
Live status: `PROGRESS.md`.

**Monorepo (npm workspaces).** The Expo member app lives in **`apps/mobile/`**, the **gym CRM**
(owner web app) in **`apps/dashboard/`**, shared code in **`packages/`** (e.g. `packages/theme`).
Any `src/…` or `android/…` path below is under **`apps/mobile/`**. Repo-level `docs/`,
`supabase/`, `PROGRESS.md` and CI (`.github/`) stay at the root. Install once with `npm install`
at the repo root (hoists all workspaces); the mobile Metro config watches the workspace root.

**▶ CURRENT FOCUS (2026-07-26).** Building **Pillar 1 — the gym management CRM** in
`apps/dashboard`. **Entrypoint: `docs/overhaul/CRM-BUILD.md`** (architecture, the phase list P1–P7,
and every assumption made without fieldwork). P1 (roster spine) and P2 (money — ledger, collection
reports, aged dues, printable GST-ready receipts) both shipped 2026-07-26. **P3 (attendance + the
daily at-risk list) is next.**

The owner **waived the fieldwork gate** on 2026-07-26 ("don't hold the crm on field work… just
build one basis online research"), so `VISION.md` §8 / locked decision 3 no longer blocks platform
code. `FIELDWORK.md` remains the blank kit; the R1 corpus in `docs/overhaul/research/` is the
evidence base. `VISION.md` (approved 2026-07-22) still governs SCOPE — the ~8-feature narrow build
and its explicit NO list stand.

Background: ForgeAI is a **B2B2C SaaS platform** — the CRM + the existing member app as a
gym-membership benefit + an owner-paid AI layer. The manual-tracker track is DONE (Phases 1–5c +
AI Coach C1–C5 + hardening + O1/O2/W4, v0.21.0). `docs/overhaul/OVERHAUL-BRIEF.md` holds the
weakness log W1–W10 (W1/W3/W4 done; W5 accessibility and W10 keystore still open on the mobile
side). `docs/DECISIONS.md` (2026-07-07 infra research) stays valid — reuse, don't redo.
`docs/PRD.md` is historical. Status: `PROGRESS.md`.

## Stack & conventions (mirrors ColorCloset)
- Expo SDK 56 / RN 0.85 / TypeScript strict / expo-router / Zustand / expo-sqlite /
  Reanimated 4 / react-native-svg charts / SecureStore for API keys.
- Path alias `@/* -> src/*`. All weights kg; `dateISO='YYYY-MM-DD'` local days.
- Theme: `src/theme/tokens.ts` — dark-only, ember accent; chart palette is
  CVD-validated, DO NOT reorder `chart.series`.
- **CRM (`apps/dashboard`)**: Vite + React 19 + TS strict, no router/UI dependency (a ~70-line hash
  router and an in-repo kit). Money is **integer paise**, days are `'YYYY-MM-DD'`. All storage sits
  behind `src/crm/data/adapter.ts` — local browser adapter today, Supabase at P7.
- Tests: `npm test` in **both** workspaces (vitest, Node). `.github/workflows/ci.yml` typechecks,
  tests and builds both on every push; `release-apk.yml` re-runs the mobile gate on a `v*` tag.
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
structured cards, not just text. **Onboarding (`src/onboarding`, Phase O2/W1):** a
real member starts EMPTY — a welcome screen captures name + mobile number and writes
a profile plus the reference exercise catalog, nothing else. The 3-month demo history
(`src/db/seed`) NEVER runs on launch: it is an explicit "Load demo data" action, and
"Erase all data" clears back to the welcome screen without reseeding.

## User-gated items (ask, never hardcode)
- GitHub repo creation + push URL, Actions secrets (keystore etc.) — owner provides.
- Release keystore: none exists yet; generate via CI keytool step or owner provides.
