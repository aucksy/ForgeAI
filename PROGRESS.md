# ForgeAI progress

## Done
- 2026-07-04: Project scaffolded (Expo SDK 56, deps installed incl.
  expo-speech-recognition 56.0.1). Contract layer authored: theme tokens
  (validated chart palette), domain models, SQLite schema v1, db bootstrap,
  lib utils (date/format/uuid/haptics/keys), expo-router skeleton (4 tabs +
  exercise route), docs (PRD, CONTRACTS). `tsc --noEmit` green.

## In flight
- Wave 1 fan-out: repos / engine+services / ui-kit+charts / ai+stores+voice /
  seed / assets — then integration tsc pass.

## Next
- Wave 2: dashboard, chat UI, analytics, exercise+settings screens.
- Adversarial review -> fixes -> initial commit polish.
- Ship prep (user-gated): GitHub repo + secrets, keystore, `expo prebuild`
  android/ commit, release-apk.yml tag build, first APK link.

## Gotchas
- `@react-navigation/bottom-tabs` is NOT hoisted — TabBar uses a structural
  prop type; don't import from that package at top level.
- Keep `chart.series` order (CVD safety). Dark-only UI.
- Demo must impress with NO API key (localCoach fallback + seeded data).
