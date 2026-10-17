# Prompt for a cloud session (paste everything below the line)

---

You are continuing ForgeAI's UAT (user acceptance testing) in a cloud session. The owner, Aakash,
is a product manager, not a developer. He is away. Work alone, decide sensible defaults, and leave
everything so the PC session can pick up from git.

READ FIRST, in this order:
1. CLAUDE.md, then CONTEXT.md and the last entries of PROGRESS.md.
2. docs/uat/STATUS.md (the board), docs/uat/UAT-PLAN.md, docs/uat/FINDINGS.md,
   docs/uat/INVENTORY.md (330 tasks), docs/uat/MONEY-ACCESS.md, docs/uat/HANDOFF.md if it exists.
3. `python docs/uat/coverage.py` for the current coverage numbers.

STATE WHEN YOU START (17 Oct 2026):
- v0.46.0 is released (phone + watch). The admin app is live at forgeai.aakashpahuja.in.
- Done: WP1-3, WP4, WP5, WP5b, WP6, WP8, WP10, WP11, WP12.
- Three helpers on the PC were stopped by a usage limit, part-way through. Their finished work is
  in git; anything not committed is lost. Check `git log` for their commits and redo what is missing:
  - WP4b: member gaps M-07 M-50 M-56 M-58 M-67 M-96 M-110 M-157 (commit 047fdb7 added the parts;
    check whether they were run green on both phone profiles).
  - WP7: phone conditions in a separate workflow qa-conditions.yml (offline / flaky network, app
    killed, update over v0.45.0 with data and an open workout, Doze / standby, exact alarms).
  - WP9: gym-side fixes U-G1 (leave with an open order), U-G2 (Settings "Your gym" shows the
    joined gym), U-M1, U-G4 AND, first, REPAIR PART R: whole owner-profile phone runs fail at R's
    "Shaker bottle" shop step, then BR and INV-a fail after it. This blocks every release.

YOUR JOB, in order:
1. Repair part R so a whole phone run passes on both profiles (default and owner).
2. Finish WP9, WP4b and WP7 (above).
3. Then WP13 accessibility (phone labels / touch-target lint), WP14 PICT pairwise environment
   runs, and the audit word item C9-34 (shop buttons "Join this gym" / "Open the shop" with the gym
   name in the heading).
4. When all gates are green on one commit (CI, whole phone runs on BOTH profiles, qa-journeys):
   bump apps/mobile/app.json to 0.47.0, add a PROGRESS.md entry, tag v0.47.0, push the tag, check
   that releases/download/v0.47.0/forgeai-v0.47.0.apk and forgeai-v0.47.0-wear.apk both answer 200.
   Write docs/uat/UAT-REPORT-v0.47.0.md from the template (verdict first; coverage from coverage.py).

HOW TO RUN THINGS:
- Cloud builds only (GitHub Actions). Repo aucksy/ForgeAI. Use `gh` (or the GitHub API with the
  session's token) to dispatch workflows and read runs, logs and artifacts:
  qa-device.yml (inputs: only, extra, api, profile=default|owner), qa-journeys.yml, wear-build.yml,
  ci.yml runs on every push, release-apk.yml runs on a v* tag. The release gate is
  scripts/ci/phone_gate.py.
- Member app tests: `cd apps/mobile && npx vitest run && npm run typecheck`.
  Admin app: `cd apps/dashboard && npx tsc -b && npx vitest run`; journeys in apps/dashboard/e2e.

YOU CANNOT DO THESE (they need the owner's PC). Leave them in HANDOFF.md under "PC must do":
- Any change to the LIVE database. Migrations 0021_receipt_rules.sql and 0022_key_status.sql are
  in git, CI-tested, NOT live, and wait for the owner's yes. New SQL must be a new additive
  migration (0023, 0024...) with tests in supabase/tests; never apply it live.
- Deploying the admin app (Cloudflare). Say "admin app ready to deploy at <commit>".

RULES (hard):
- Push straight to main. Commit only your own paths: `git commit -F <file> -- <paths>`, after
  `git pull --rebase --autostash`. End messages with
  "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Never commit forgeai-apk/.
- Frozen (never edit): apps/mobile/src/engine/*, src/components/ui/*, src/components/charts/*,
  src/db/schema.ts (additive migrations only), existing signatures in src/db/repos/* and
  src/services/*.
- Member app screens never say "volume", "PR" or "session". Admin app: simple English only, no
  Hinglish (the owner removed it). The installed website app is the "admin app", never "team".
- Never loosen a test to make it pass. A real bug: keep the check, write it in FINDINGS.md.
- Every silent catch needs a log line or a `// quiet:` comment (CI ratchet).
- No secrets in files, logs or test evidence. Never create a lasting owner key for test gyms
  FORGE1 / RAMS01; each run makes its own fresh gym.
- Never claim a build or run passed without reading its result.

HOW TO LEAVE THINGS (so the PC session picks up):
- Keep docs/uat/STATUS.md current (one row per work package: state, commits, run ids).
- Write docs/uat/HANDOFF.md and update it at least every hour of work and at the end:
  1. Done (with commits and run ids).
  2. In progress: exactly where you stopped, and the next command to run.
  3. PC must do: live database steps, admin deploys, anything needing the owner.
  4. Owner decisions needed (two options max each, your recommendation first).
- Commit and push docs/uat after every update, so nothing is lost if the session stops.
- Finish your last message to the owner in plain, short English with three headings:
  Done / Needs you / Next.
