# ForgeAI — Claude Code working agreement

**Read `CONTEXT.md` first (session entrypoint), then `PROGRESS.md` (live status — read the
last few entries).** Those two are the source of truth and always win over this file if they
disagree. This file is just the always-on standing rules.

## What this is
A premium Android fitness app on a **B2B2C SaaS pivot** (gym-management platform + the existing
member app + an AI upgrade layer). Monorepo (npm workspaces): the Expo member app is in
**`apps/mobile/`**, the owner web dashboard in `apps/dashboard/`, shared code in `packages/`.
Any `src/…` or `android/…` path is under `apps/mobile/`. Platform (CRM) code is gated on the
owner's gym fieldwork (`docs/overhaul/FIELDWORK.md`); app-quality work proceeds meanwhile.

## ⭐ Talk in plain English
The owner is **not a developer**. In chat, lead with what changed for them and why. All technical
detail goes in `PROGRESS.md`, commit messages, and code comments — not chat.

## Frozen files (read-only — import and TEST them, never edit)
`src/engine/*`, `src/components/ui/*`, `src/components/charts/*`, `src/db/schema.ts`, and existing
`src/db/repos/*` / `src/services/*` signatures. Any schema change is **additive only** (a new
`initTracker…`-style migration; never edit `schema.ts`). See `docs/CONTRACTS.md`.

## Build & ship
- **Cloud builds only.** Never run Gradle locally (the local toolchain is deleted; low-RAM machine
  crashes on builds). Ship by pushing a **`v*` tag** → GitHub Actions builds a signed APK+AAB and
  publishes a Release. A plain push to `main` does **not** build.
- **Ship gate, never reversed:** tests + typecheck green → adversarial review by a review subagent
  → apply fixes → update `PROGRESS.md` → bump `apps/mobile/app.json` version → commit → tag → push
  → **paste the direct `.apk` URL in chat** (`releases/download/<tag>/forgeai-<tag>.apk`).
- Push `main` + bump + tag after each phase; hand off a fresh-chat kickoff for the next phase.
- No `expo prebuild` regen unless a new native module truly needs autolinking (committed `android/`
  uses dynamic autolinking).

## Tests (Phase O1)
- Pure-TS **vitest** lane. From `apps/mobile`: `npm test`. Config `apps/mobile/vitest.config.ts`;
  tests in `apps/mobile/test/**` mirror `src/`. CI runs it before the Gradle build, so a broken
  tag can't ship. Add tests for new logic; keep it green.
- Native packages (expo-sqlite / expo-secure-store / expo-crypto→react-native / async-storage) are
  aliased to a throwing Proxy stub so pure fns in DB/service modules can be imported. If a new
  import breaks test collection, add that leaf to the alias list.

## Environment & git
- Node is **not** on the default PATH: prepend `%LOCALAPPDATA%\nodejs` in PowerShell. Keep
  `npm run typecheck` (apps/mobile) at exit 0.
- Git author: **simpleapps108@gmail.com** (global identity already set). Commit with
  `git commit -F <file>` (inner double-quotes break `-m` on PowerShell).
- ⭐ Review subagents have previously auto-installed eslint and rewritten `package-lock.json`.
  After ANY review agent runs, re-check `git status`, revert anything you didn't author, and stage
  **path-scoped** (never `git add -A`). The untracked `forgeai-apk/` folder is a build artefact —
  keep it out of commits.
