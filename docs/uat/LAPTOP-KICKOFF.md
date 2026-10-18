Continue the ForgeAI work from the cloud session of 18 Oct 2026
(https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2).

FIRST: `git pull --rebase --autostash` on main. Then read CLAUDE.md, CONTEXT.md, the last entries of
PROGRESS.md, docs/uat/HANDOFF.md, docs/uat/STATUS.md and docs/CLAUDE-NOTES.md (R-22 to R-26 are the
owner's latest requests). Main is at 2ae9392 or later.

WHERE THINGS STAND
- Release v0.48.0 (gym workout plans end to end + fixes) is built and reviewed. All code is on main.
  Mobile 3018 tests and dashboard 917 tests green, both typechecks clean. app.json is still 0.47.1.
- Migration 0024_workout_plans is LIVE (applied by the PC on 18 Oct; gyms count 133 before and after).
  The admin app with workout plans is deployed (version 3944c634).
- Phone gate: two whole qa-device runs on commit 2391daf were still running at 09:45 UTC:
  - 39111139019 (default profile)
  - 39111140587 (owner phone profile, API 34)
  https://github.com/aucksy/ForgeAI/actions/runs/39111139019 and .../39111140587

TASK 1: FINISH THE v0.48.0 SHIP GATE
1. Read both run results (do not assume). Check them with python scripts/ci/phone_gate.py if useful.
2. If BOTH are fully green:
   - add the v0.48.0 entry to PROGRESS.md (what shipped: trainer builds a plan in the admin app with
     exercises, start sets and kg, and it appears as a "From <gym>" folder on the member's phone;
     U-M10 fix; release-review fixes from commit 2391daf);
   - bump apps/mobile/app.json "version" to 0.48.0 (that one line only, so the phone gate still
     accepts the runs; android versionCode only if the repo's release notes say so);
   - update docs/uat/HANDOFF.md and STATUS.md;
   - commit path-scoped (`git commit -F <file> -- <paths>`), push main;
   - tag v0.48.0 and push the tag (from this PC), wait for the Release workflow, read its result,
     then paste the APK URL:
     https://github.com/aucksy/ForgeAI/releases/download/v0.48.0/forgeai-v0.48.0.apk
3. If either is RED: find the real cause from the logs and screenshots. Fix the app or the test flow;
   never loosen or remove a check. Write it in docs/uat/FINDINGS.md (next U-Q / U-M number). Push,
   re-run both profiles whole, and go back to step 1.

TASK 2 (next build): "Expiring in 1-3 / 4-7 / 8-15 days" tiles in the admin app (promised in owner
inbox #20). Research how GGMS and other gym software show them first, build, test, and include in
the next release.

STANDING RULES (short; CLAUDE.md has the full text)
- Plain English with me; technical detail goes in PROGRESS.md, commits and code comments.
- Member app never says "volume", "PR" or "session". Admin app: simple English only.
- Frozen files: src/engine/*, src/components/ui/*, src/components/charts/*, src/db/schema.ts
  (additive migrations only), existing signatures in src/db/repos/* and src/services/*.
- No LIVE database changes without my yes. Every silent catch gets a log line or a `// quiet:` comment.
  No secrets in files or logs. Never make a lasting owner key for test gyms FORGE1 / RAMS01.
- Never claim a run or build passed without reading its result.
- After any review subagent: check git status, revert what you didn't write, stage path-scoped.
  Never commit forgeai-apk/.
- Owner inbox (docs/OWNER-INBOX.md + page https://claude.ai/artifact/9dAdwmTA8rNXiw5BHX1SJT) holds
  ONLY Q&A, my decisions, and the feature backlog. My requests go first into docs/CLAUDE-NOTES.md.
  Before every page rebuild: Artifact read, then `python scripts/owner_inbox_page.py --absorb <file>`,
  then rebuild and republish to that same URL.
- Decide UX and build order yourself; ask me only about money, LIVE data, client promises / prices /
  legal wording, or personal variant vs product.
- Commit messages end with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- End each reply with Done / Needs you / Next.
