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
**Owner rule (24 Oct 2026, R-98): every word a member, gym owner or visitor reads** (What's new, buttons, pop-ups,
errors, landing page, messages) goes through the global `member-words` skill before it ships: write for someone who
has never seen the screen, say where and what it does for them, one short line each, and get Gemini's second opinion
when GEMINI_API_KEY is set (else a fresh-reader subagent). What's new notes carry a `go` button where one helps.

## ⭐ Project Tracker = the owner inbox (`docs/OWNER-INBOX.md` + his private page, renamed 21 Oct)
The page and the file's title say "Project Tracker"; the file path and the script names stay. It also
holds "## Claude's tasks" (my own work, in priority order; its own tab): keep it current, mark Done.
**Owner rule (18 Oct 2026):** the inbox holds ONLY (1) **questions and answers** between him and you,
(2) **his pending decisions**, (3) the **feature backlog** and what is **built**. Nothing else.
- **His instructions, requests and feedback** ("build X", "change Y", "do it this way"): write them
  FIRST into YOUR notes, `docs/CLAUDE-NOTES.md` (newest on top, `## R-<n>. <title> — <date>`, what he
  said + what you did), commit + push, then work. Never put them in the inbox. Chat gets compacted;
  your notes survive it.
- **⭐ Owner rule (20 Oct 2026, R-36): add NOTHING to the inbox unless he says so.** Answer his questions
  in chat and keep the answer in your notes (`docs/CLAUDE-NOTES.md`). An answer goes into the inbox
  ONLY when he tells you to put it there ("save this in my inbox"). A feature goes into the backlog
  ONLY when he confirms it ("okay, we'll build this", "add to plan"). Ideas and research stay in your
  notes. When he does ask for an inbox entry: `## <n>. <title> — <date>`, a `**Chat:** <chat name> —
  <session link>` line, `**Status:**`, "You asked" in short + your plain-English answer.
- **A decision only he can make** (the #18 list below): `**Decide:** <question>` + `- A: <option>`
  lines (mark one "(recommended)") in the entry, plus a row in the "Waiting for your decision" table;
  when he decides, write `**DECIDED (date):** ...`, drop the `**Decide:**` lines and the table row.
- **⭐ Owner rule (22 Oct 2026, R-81): the tracker is THE plan: use it always, keep it true.** **Planned =
  good to go: pick it and build it without asking.** A row sits in **Waiting for you** only when nothing can be built until he
  acts (money, his details, a gym visit, hardware, or a finished build needing only his live yes; name the #). If I can build
  first and only the final live switch or word check needs him, it is Planned (R-169).
  After every release or deploy, check EVERY row not Live/Done in the same turn. He moves features between
  statuses on the page ("Move to"); `--absorb` writes his moves into the .md and they win.
- **⭐ Owner rules (29 Oct 2026, R-172/R-173): threads and one-topic-one-place.** His follow-up goes into the entry as
  `**YOUR REPLY (date):**` with `**My answer (date):**` under it, and the `**READ` line is deleted: the page then puts the
  entry on top of Q&A ("New answer · reply N") for 3 days. A question about a feature is linked by writing `#n` in that
  backlog row's Details; if the row is "Waiting for you", the question shows only under Waiting for you. Every feature
  that came from a Q&A topic must carry its `#n`, or the page says "still a discussion".
- **⭐ Owner rule (29 Oct 2026, R-182): don't disturb him while he types.** Every publish reloads his open page. Publish the
  tracker AT MOST ONCE per reply, at the end, after one final read + --absorb; never several times while working. (The page
  also keeps unsent reply text and his place across a reload, but fewer reloads come first.)
- **Feature backlog** (`## Feature backlog` near the top: `### <group>` + `| Feature | Status | Details | How it will work |`,
  Status one of Live / Next release / Planned / Idea / Waiting for you / Not doing, one short plain
  sentence each; every row not built yet also fills "How it will work" in 1-4 plain sentences, R-52):
  his map of every feature; the page splits it into "Feature backlog" (not built)
  and "Built" (Live + Next release). Add a row only when he confirms a feature; move it when it ships.
- **A task waiting on HIM** (a setup step, a key to make, a phone check, anything in a chat "Needs
  you" block): in the SAME turn, an inbox entry with `**Status:** WAITING FOR YOU` and one
  `**Your task:** ...` line per step. The page lists it under "Waiting for you" with an "I have done
  it" button; when he says it is done (page or chat), add `**TASK DONE (date)**`. Owner, 18 Oct:
  "tasks pending on me will also go here.... do not make me repeat this."
- Never post build news, progress or "BUILT" updates in the inbox: those go in PROGRESS.md / HANDOFF,
  your notes, and chat.
**The page:** after every inbox change, rebuild and republish it so it matches the file:
`python3 scripts/owner_inbox_page.py <file>.html`, then the Artifact tool with
`url: https://claude.ai/artifact/9dAdwmTA8rNXiw5BHX1SJT` (never make a new page). Before EVERY
rebuild: read the page (Artifact read; it saves the full HTML to a file), then run
`python3 scripts/owner_inbox_page.py --absorb <that file>`: it writes his "Mark as read" taps into the
.md as `**READ (date)**` lines and his chat renames into the `**Chat:**` lines (a rebuild without this loses them) and prints his answers and his
feature comments to act on. Answers come back two ways: (1) the page's "Send to Claude" saves them
INTO the page (the watching session is woken by that republish); (2) the desktop mod `/inbox`
(plugins/owner-inbox) posts "Owner inbox #N (...): ..." into the chat as his own words. A reply to an
entry goes into it as `**YOUR REPLY (date):** ...` with your answer under it. A feature comment is
feedback: log it in your notes and act; answer in the inbox only if it asks a question. When you add
news to an entry he has read, delete its `**READ` line so it shows under "To read" again.

## ⭐ Research demand before building a feature
Before building any NEW feature the owner asks for (not a bug fix): search the web first —
Hevy/Strong and other competitor apps, their help pages and feature-request boards, Reddit.
Tell him in plain English whether most members would use it (mainstream vs niche, who has it).
If it is mainstream, also research the BEST way to build it (how the leading apps do it, what
their users complain about) and 1-3 ideas to make ours better than theirs. A personal-only idea
goes to his own variant, not the product.
**Owner rule (18 Oct 2026, OWNER-INBOX #18): don't stop to ask what you can decide.** Pick the best
member experience and the build order yourself, build it, and tell him in chat what you chose and
why (he can overrule; log it in your notes). Stop and ask ONLY for: spending money or anything the client must buy; LIVE
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
  → **paste the direct `.apk` URL in chat** (`releases/download/<tag>/mettleup-<tag>.apk`; 0.56.0 on.
  Never publish a phone APK named `forgeai-<tag>.apk` again: old ForgeAI phones would offer it as an
  "update" and install a second, empty app).
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
