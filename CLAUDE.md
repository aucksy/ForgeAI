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

## ⭐ Write the owner's ideas down FIRST — `docs/OWNER-INBOX.md`
Chat gets compacted and the owner reads answers much later (often on his PC). So whenever he sends
an idea, suggestion, feature request or question: FIRST add it to `docs/OWNER-INBOX.md` (newest on
top; "You asked" in short + Status) and commit + push, THEN work on it. When answered, write the
answer there too (plain English, same as chat) and keep the "Waiting for your decision" table at
the top current: add new decisions, and remove them once he decides. Commit + push after each update.
Each entry carries a `**Chat:** <chat name> — <session link>` line (the chat it came from). After
every inbox update, rebuild and republish his private page so it matches the file:
`python3 scripts/owner_inbox_page.py <file>.html`, then the Artifact tool with
`url: https://claude.ai/artifact/9dAdwmTA8rNXiw5BHX1SJT` (never make a new page). Before EVERY
rebuild: read the page (Artifact read; it saves the full HTML to a file), then run
`python3 scripts/owner_inbox_page.py --absorb <that file>`: it writes his "Mark as read" taps into the
.md as `**READ (date)**` lines (a rebuild without this loses them) and prints the answers to act on.
Answers come back two ways: (1) the page's "Send to Claude" saves them INTO the page
(`DATA.answers` in its script; the watching session is woken by that republish): read the page,
act, write `**DECIDED (date):** ...` into the entry (drop its `**Decide:**` lines and its table row),
rebuild + republish (that clears the sent answers); (2) the desktop mod `/inbox`
(plugins/owner-inbox) posts "Owner inbox #N (...): ..." into the chat as his own words: same steps.
A comment without a pick, or a reply to an entry with no options, arrives the same way: write it into
the entry as `**YOUR REPLY (date):** ...` with your answer under it (a question stays open until he
picks). When you add news to an entry he has read, delete its `**READ` line so it is "waiting" again.
Each open question needs `**Decide:** <question>` + `- A: <option>` lines (mark one "(recommended)").
**Owner rule (18 Oct 2026, OWNER-INBOX #19): the inbox holds ONLY what he sends** (questions,
feedback, ideas) with your short answer, plus decisions that are truly his (the #18 list below).
Never post build news, progress or "BUILT" updates there: those go in PROGRESS.md / HANDOFF, and
in chat. A decision you are sure is the best member experience is yours: make it, don't list it.

## ⭐ Research demand before building a feature
Before building any NEW feature the owner asks for (not a bug fix): search the web first —
Hevy/Strong and other competitor apps, their help pages and feature-request boards, Reddit.
Tell him in plain English whether most members would use it (mainstream vs niche, who has it).
If it is mainstream, also research the BEST way to build it (how the leading apps do it, what
their users complain about) and 1-3 ideas to make ours better than theirs. A personal-only idea
goes to his own variant, not the product.
**Owner rule (18 Oct 2026, OWNER-INBOX #18): don't stop to ask what you can decide.** Pick the best
member experience and the build order yourself, build it, and write in the inbox what you chose and
why (he can overrule). Stop and ask ONLY for: spending money or anything the client must buy; LIVE
server data changes; promises to the client, prices or legal/privacy wording; personal-variant vs
product for everyone.

## ⭐ Audits and release QA must test what a real workout shows
Two full audits missed what the owner found in one gym session (13 Oct 2026). Every audit/QA:
behaviour checked against the REAL Hevy app (owner's screen recordings → a behaviour table; any
deliberate difference listed for his approval, never silently encoded in a test); the QA phone set
to HIS phone (Pixel dp width, large display size, font scale) on a Monday and a 1st of the month
with a ~500-workout history; one full "real workout" journey (warm-ups, drops, RPE, superset,
every rest, notification shade after ticks); every interaction tried (tap, hold, release, again);
every number on a screenshot read against its label. Lesson: D:/Brain/Lessons/forgeai-audits-missed-what-a-real-workout-shows.md

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
