# ForgeAI — Owner action items (parked)

Things only you can do (keys, pushes, dashboards, cloud builds). None of these block
local development — the agent has verified everything it can locally. Check items off
as you go.

## Now / soon
- [ ] **Push local commits.** `bc81920` (Phase 1.5 Drive backup/restore), `5fe8afb`
  (Phase 2 dashboard), and the upcoming monorepo-move commit are **local only** →
  `git push origin main` when ready.
- [ ] **Confirm the Phase 1 live loop.** In the app: Settings → Gym sync → create account
  + code `IRON01` + consent → log a workout → confirm a row appears in Supabase
  `member_summary`. (Email confirmation is already toggled off.)

## Phase 1.5 — Google Drive (to make backup/restore actually work)
- [ ] Set a real `extra.googleWebClientId` (Web OAuth client id) in the app config.
- [ ] Register the build's signing **SHA-1** as an Android OAuth client for
  `com.forgeai.app` in Google Cloud (debug SHA-1 for testing, or stand up the release
  keystore first).
- [ ] Regenerate the native `android/` (`expo prebuild`) so
  `@react-native-google-signin/google-signin` autolinks, then re-apply the CI
  build.gradle signing block. Test via a cloud build. *(Until done, the Backup card
  stays hidden — current builds are safe.)*

## Phase 2 — Dashboard deploy
- [ ] Create a **Cloudflare Pages** project: root `apps/dashboard`, build
  `npm install && npm run build`, output `dist`. No secrets (publishable key only).
- [ ] To see data: sign up in the dashboard → "Create your gym" (or adopt the `IRON01`
  test gym via the SQL in `apps/dashboard/README.md`) → share the join code with members.

## Phase 3 — AI proxy (when we get there)
- [ ] Provide a Gemini (Google AI) key + an OpenAI key (meal-photo escalation) as Edge
  Function secrets — never shipped in the app.

> Note: the monorepo move shifts the mobile paths above (e.g. `app.json`, `android/`)
> under `apps/mobile/`. This file is updated when that lands.
