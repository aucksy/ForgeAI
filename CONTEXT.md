# ForgeAI — session entrypoint (read me first)

Premium Android **demo app for gym owners**: every member gets an AI coach that
remembers everything (workouts, nutrition, PRs) so leaving the gym means leaving
your coach behind. Full requirements: `docs/PRD.md`. Module APIs: `docs/CONTRACTS.md`.
Live status: `PROGRESS.md`.

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
