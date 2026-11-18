# Change 360 review (draft, audit step 3F: parts F1, F4, F5, F6)

Written 18 Nov 2026 by audit helper W11. Proposals only: nothing in the skill, the questions, the hook, the switch
or the notes was changed. The switch was read and is still OFF. Repo state checked: commit 6187ebbb (18 Nov 2026).

The three things to know first:
1. The flow points at a MettleUp change card (`docs/changes/R-<n>.json`) and a CI card check that do not exist in
   the repo. See C-01.
2. The commit gate is easy to walk past (a worktree, `cd x; git commit`, a relative `cd`) and one mistyped card
   field makes it block commits in every other project. A tested replacement is in C-02.
3. The flow's own text is cheap (about 3,000 tokens). The cost is the evidence hunting: about 35,000 to 120,000
   tokens for a full flow. Reading the map file whole would add about 85,000 more. See the cost section and C-18.

## F1. What each part does

| Part | What it does |
|---|---|
| `~/.claude/skills/change-360/SKILL.md` (58 lines) | The flow itself. Section 0: obey the switch. Section 1: triage, which changes need the flow and which skip it; a flow-class change gets one "My view: run the 360 flow?" and waits for his yes; unattended runs never start it. Section 2: open a card. Section 3: the 8 steps (questions, blast radius, tests first, build small, gates, fresh eyes, update the map, escape log). |
| `~/.claude/skills/change-360/QUESTIONS.md` (66 lines) | 43 generic questions in 8 groups (why and who, blast radius, journeys, hidden rules, trust, running it, proof and release, before we start). 15 are marked [F] (a fix answers them too). 4 are marked (HIM) (only he can answer). |
| `~/.claude/change-360/switch.json` (5 lines) | The master switch. Today: `"on": false`, `"projects_off": []`. Its note says only he turns it on, at the start of the audit's fix phase. |
| `~/.claude/hooks/change_360.py` (132 lines) | Two jobs. `prompt`: when the switch is on and the message has a build word, adds one line telling Claude to triage; also names the next step of an active card. `commit`: blocks `git commit` in a project while an active card there has questions, blast radius or tests-first not done. Any error lets the work through. Registered in `~/.claude/settings.json` lines 48 and 70, 10-second limit. |
| `docs/change-360-project.md` (45 lines, in the repo) | MettleUp's 20 own questions (M1 to M20): roles, surfaces, Free or Pro, gym privacy, money, India time, phone and watch, words, release records. 6 are [F]. Says answers go into `docs/changes/R-<n>.json`. |
| `D:\Brain\How I Like Things\change-360-runs-only-with-his-yes.md` (26 lines) | The rule in his words: global, behind a switch, starts per change only after his yes, never for simple fixes. Adds: it goes on when the audit's fix phase starts, and for the audit's fixes he approves ONE list. |
| `D:\Brain\Dev-Framework\2026-11-18-feature-360-questions.md` (103 lines) | The research and first draft: an older, MettleUp-flavoured copy of the 43 questions, the outside sources, and the proposed 8-step order. Its status line says "installed, switch off". |
| Cards folder `~/.claude/change-360/cards/` | Does not exist yet. No card has ever been opened, so the flow has never run once end to end. |

A feature answers 63 questions (43 + 20). A fix answers 21 (15 + 6).

## F5. Hook test cases

How tested: made-up JSON piped into the real script, with the home folder pointed at a throwaway copy (so the
real switch file was never opened for writing and stayed OFF). 46 cases, each under a second. No real commit.
Result on today's hook: 32 behave as intended, 14 do not.

| # | Case | Should | Today | Result |
|---|---|---|---|---|
| 1 | Switch off, active card, `git commit` | let through | let through | pass |
| 2 | Switch off, build prompt | say nothing | says nothing | pass |
| 3 | Windows path `D:\Apps\Demo` | block | blocks | pass |
| 4 | Forward-slash path `D:/Apps/Demo` | block | blocks | pass |
| 5 | Lower-case subfolder `d:\apps\demo\apps\mobile` | block | blocks | pass |
| 6 | Neighbour project `D:/Apps/Demo2` | let through | lets through | pass |
| 7 | `git -C D:/Apps/Demo commit` from the parent folder | block | blocks | pass |
| 8 | `cd "D:\Apps\Demo" && git commit` | block | blocks | pass |
| 9 | `cd D:/Apps/Demo; git commit` (semicolon) | block | lets through | FAIL |
| 10 | `cd Demo && git commit` from `D:/Apps` (relative) | block | lets through | FAIL |
| 11 | Git Bash spelling `/d/Apps/Demo` | block | lets through | FAIL |
| 12 | PowerShell tool, `git commit -F msg.txt` | block | blocks | pass |
| 13 | `git status`, `git push`, `git log \| grep commit` | let through | lets through | pass |
| 14 | `git log --grep commit` (read only) | let through | blocks | FAIL |
| 15 | `git merge side` (makes a commit) | not gated | lets through | by design, see C-03 |
| 16 | Worktree listed in the card's `also_paths`, same spelling | block | blocks | pass |
| 17 | Worktree listed as `C:/Users/AAKASH~1/...`, session shows the long name | block | lets through | FAIL |
| 18 | Worktree NOT listed in `also_paths` | block | lets through | FAIL |
| 19 | `also_paths` typed as text instead of a list; commit in ANOTHER project | let through | blocks | FAIL |
| 20 | A helper commits (input carries an agent id) inside the project | block | blocks | pass (scripted only) |
| 21 | Steps 1-3 done; card "skipped"; card "done" | let through | lets through | pass |
| 22 | Project in `projects_off`, session inside it | let through | lets through | pass |
| 23 | Project in `projects_off`, `git -C <it> commit` from the parent folder | let through | blocks | FAIL |
| 24 | `projects_off` has `Demo`; card and commit are in `Demo2` | block | lets through | FAIL |
| 25 | Broken input: empty, not JSON, a list, tool input as text, folder missing, command a number, no mode (7 cases) | let through | lets through | pass (7 of 7) |
| 26 | One unreadable card file plus one good active card | block | blocks | pass |
| 27 | One card with a wrong-shaped `steps` plus one good active card | block | lets through | FAIL |
| 28 | Broken switch file | let through | lets through | pass |
| 29 | Prompt "fix the typo" | add the triage line | adds it | pass |
| 30 | Prompt "what is the status" | say nothing | says nothing | pass |
| 31 | Prompt "update the pricing screen and remove the trial" | add the triage line | says nothing | FAIL |
| 32 | Prompt "what did you change yesterday?" | say nothing | adds the line | FAIL (cheap, left as is) |
| 33 | Session opened in the parent folder `D:/Apps`, card active for a project inside | name the card | says nothing | FAIL |

Not tested (and why):
- A REAL helper commit. Whether Claude Code runs this hook inside a helper, and which folder it reports, can only
  be seen with a real commit, which this step forbids. Case 20 only proves the script does not treat a helper
  differently.
- Commits that do not go through the Bash or PowerShell tool (the desktop app's own Commit button, a git
  connector). The hook is registered for `Bash|PowerShell` only (settings.json line 66), so by reading: not gated.
- The exact folder spelling Claude Code sends on this PC (long or short user-folder name). Both were tried.

The proposed replacement in C-02 was run against 52 scripted cases, including this audit's own real linked
worktree with the card naming only the main repo: 51 pass. The one miss was a fault in my test set-up (it split a
text value into letters before the hook saw it), not in the hook.

## F6. Cost

These are ESTIMATES, not measurements: the flow has never run. Measured: file sizes. Assumed: how much code a
model reads per question (stated below). Counted once per token; a long chat re-reads its context on every turn
(at a cached discount), so real use is higher. Treat these as the low end.

Yardstick from the brief: one 150,000-token helper is about 4 percent of a 5-hour window, so 1 percent is about 37,500 tokens.

The 3 past changes: `docs/changes` does not exist, so there are no change cards to pick (see C-01 and
"could not check"). Instead, 3 real changes from git history since 1 Nov 2026, at the 10th, 50th and 90th
percentile of 327 change ids by lines changed.

Fixed reading, every flow (measured): SKILL.md 4,722 characters, QUESTIONS.md 4,455, change-360-project.md 2,816,
about 3,100 tokens together. Card writes (1 create, 8 updates) and hook lines: about 2,400. Fixed total: about 5,500.

| Change (real) | Size | Full flow (63 questions) | Fix-only flow (21 questions) |
|---|---|---|---|
| R-509, notes for the notification audit | small: 7 lines, 1 file | about 35,000 tokens, 0.9 percent | about 15,000 tokens, 0.4 percent |
| R-423, a database change applied live plus an HQ deploy | medium: 113 lines, 7 files | about 64,000 tokens, 1.7 percent | about 33,000 tokens, 0.9 percent |
| R-461, phone-test and Gym-tab work | large: 1,596 lines, 30 files | about 121,000 tokens, 3.2 percent | about 73,000 tokens, 1.9 percent |

What is inside those numbers (small / medium / large):
- Blast radius: map rows found by search 2,000 / 5,000 / 12,000; code search for other readers and writers
  3,000 / 10,000 / 30,000; the written list 200 / 600 / 1,500.
- Questions, full: evidence reading about 150 / 400 / 800 tokens per question; web research for question 3
  (how leading products do it) about 12,000 flat; written answers about 50 / 90 / 140 tokens each.
- Questions, fix-only: same per-question reading, 21 questions, no web research.
- Map update: 500 / 1,500 / 4,000.

Not in the numbers, because other rules already demand them with or without this flow: tests, CI, UAT of all
types, and the fresh-eyes reviewer (one helper, about 4 percent by the yardstick).

Three cost facts worth more than the table:
- `docs/system-map/features.json` is 296,602 characters, about 85,000 tokens. Step 2 says "read the map first".
  A model that reads the file whole spends 2.3 percent of a window on that alone, more than the rest of a medium
  flow. `PRODUCT-MAP.md`, the file the skill names, does not exist yet.
- A full flow on the small change costs about 35,000 tokens to change 7 lines. The triage rule is what keeps
  that from happening; it has not been checked against past changes yet (F3, later).
- With the switch OFF the flow still costs a little: its description (about 130 tokens) loads in every session,
  and Python starts on every Bash and PowerShell call to find the switch off.

## Could not check

- The 15 Nov framework's "ten steps": not in the repo (searched `CLAUDE.md`, `CONTEXT.md`, `docs/DECISIONS.md`,
  `scripts/`, `.github/`). They live in a planning file this step may not open. So "does the 8-step flow repeat
  the ten steps" is unanswered.
- F6 on 3 real change cards: there are none. Git history was used instead.
- Which note is the home of "open testing first, production about 3 days later" (question M20): not looked up.
- A real helper commit and the app's Commit button (see the test section).

## Proposals

### C-01 The flow points at a MettleUp change card and a CI card check that do not exist  [needs Aakash]
- What happens today: SKILL.md lines 34-35 and `docs/change-360-project.md` line 6 say MettleUp answers go into
  `docs/changes/R-<n>.json` "from the 15 Nov framework". The repo has no `docs/changes` folder, no git history
  for one, and `.github/workflows/ci.yml` has no card check (0 matches for "card" or "changes/"). The only other
  mention is one line in the session notes.
- Why it matters: on the first real run Claude either invents a card format on the spot, or writes answers
  nowhere. "One card, never two" has no first card. The hook only ever reads the card under `~/.claude`.
- Change, in words: pick one home for the answers and say it in one place (the project file).
- Exact text to paste: (option A) in `docs/change-360-project.md` replace line 6 with:
  `Answers go into docs/changes/R-<n>.md (one plain file per change, committed with the change). The card that the commit gate reads is the global one (~/.claude/change-360/cards/); its evidence fields point at this file.`
  and in SKILL.md replace lines 34-35 with:
  `A project may name where its answers live in its own docs/change-360-project.md. One card, never two.`
- Risk: the 15 Nov framework may be planned for the fix phase; then option B fits better.
- My view: option A. A plain answers file in the repo plus the one global card is enough to start; build the JSON card and its CI check only if the first few flows show answers being skipped. Option B: build the 15 Nov card and CI check first, and keep the switch off until they exist.

### C-02 The commit gate misses worktrees, some command shapes and short folder names  [apply]
- What happens today: `card_matches` (change_360.py lines 54-59) only finds the project when its exact path text
  appears in the session folder or the command. Test cases 9, 10, 11, 17, 18 all walk past it. SKILL.md section 2
  never mentions `also_paths`, so no card will ever list a worktree. This audit itself runs in a worktree under
  `C:/Users/AAKASH~1/...`.
- Why it matters: he would see a change committed with the questions, blast radius and tests-first not done,
  while believing the gate was on. Helpers work in worktrees, so this is the common case, not the rare one.
- Change, in words: work out the main repo from the worktree's own `.git` pointer file (a file read, no git
  run); follow `cd`, `Set-Location` and `git -C`, relative or absolute; treat `/d/...` and short names as the same
  folder.
- Exact text to paste: replace the whole of `~/.claude/hooks/change_360.py` with the file below (it also carries
  C-03 to C-06). Keep the docstring at the top of the current file.

```python
@@PATCHED@@
```
- Risk: a symlinked or junctioned project folder now resolves to its real path, so a card that names the link and
  a session that names the target match (wanted), but a card on a mapped drive could stop matching. Re-run the
  scripted cases after pasting.

### C-03 A read-only git command with the word "commit" is blocked  [apply]
- What happens today: line 95 looks for "git" and later "commit" on the same line, so `git log --grep commit`
  is denied (case 14), and so is `git commit-graph`.
- Why it matters: a wasted turn and a confusing "finish the steps" message for a command that changes nothing.
- Change, in words: only block when `commit` is the git sub-command. `git merge`, `cherry-pick` and `revert` stay
  un-gated on purpose: syncing a worktree with main must keep working, and with C-02 the work itself cannot be
  committed anywhere un-gated first.
- Exact text to paste: the `COMMIT` pattern in the C-02 file.
- Risk: `grep "git commit" file` is still blocked while a card is active there (rare; accepted).

### C-04 One mistyped card field blocks commits in every project  [apply]
- What happens today: line 55 does `list(card.get("also_paths", []))`. If a card holds text instead of a list,
  the text is split into single letters, and "d" or ":" then matches almost any command. Case 19: a commit in an
  unrelated project is denied. A card whose `project_path` is a bare drive would do the same.
- Why it matters: this is the one way the hook fails CLOSED. He would see every chat on the PC refuse to commit,
  each told to finish a card it knows nothing about.
- Change, in words: accept text or a list; ignore any path of 3 characters or fewer.
- Exact text to paste: `as_list` and `path_hit` in the C-02 file.
- Risk: none found.

### C-05 projects_off leaks both ways, and one odd card switches the gate off  [apply]
- What happens today: `project_off` (lines 36-38) checks only the session folder and matches by plain prefix.
  Case 23: an off project is still blocked through `git -C`. Case 24: turning `Demo` off also turns `Demo2` off.
  Separately, a card whose `steps` is the wrong shape throws, and the catch-all at line 122 then lets every
  commit through, including ones a good card should stop (case 27).
- Why it matters: "off for this project" does not always mean off, and can silently mean off for a neighbour.
- Change, in words: use the same separator-safe matching for `projects_off` as for cards; skip a bad card
  instead of abandoning the whole check.
- Exact text to paste: `project_off`, `active_cards` and the loop in `do_commit` in the C-02 file.
- Risk: none found.

### C-06 The prompt line misses common build words and sessions opened one folder up  [apply]
- What happens today: `BUILD_WORDS` (lines 20-21) has no "update", "remove", "delete", "replace", "rename",
  "improve", "ship". Case 31: "update the pricing screen and remove the trial", a money change, gets no triage
  line. Case 33: a chat opened in `D:\Apps` (as his often are) is never told a card is active for a project inside.
- Why it matters: the flow-class requests most worth catching can pass with no nudge at all.
- Change, in words: add the words; name an active card when the session folder is a parent of the card's project.
- Exact text to paste: `BUILD_WORDS` and `do_prompt` in the C-02 file.
- Risk: the line (about 45 tokens) shows on more messages, including some plain questions.

### C-07 An active card blocks every commit in the project, from every chat  [needs Aakash]
- What happens today: `do_commit` (lines 101-111) blocks any `git commit` in the project while any card there is
  active with steps 1-3 open. It cannot tell the card's own work from an unrelated typo fix, a notes commit, or
  another chat. The deny message tells whoever hit it to "set the card status to 'skipped' with Aakash's words".
- Why it matters: he runs several chats and helpers on one project. One card waiting on his answers would stop
  all of them from committing, and a chat that never saw the card could mark it skipped to get unstuck.
- Change, in words: store the session id on the card when it is opened; gate only that session (and its helpers).
- Exact text to paste: in SKILL.md section 2 add the field `session_id`. In `do_commit`, before `card_matches`:
  `if c.get("session_id") and data.get("session_id") and c["session_id"] != data["session_id"]: continue`.
  And change the deny message ending to: `If this card is not yours, do not touch it: tell Aakash.`
- Risk: whether a helper's hook input carries the parent chat's session id is not verified; if it does not,
  helpers would pass un-gated.
- My view: gate only the chat that opened the card (option A). Option B: keep the project-wide block and accept the stalls.

### C-08 A card waiting on his answers has no "paused" state  [apply]
- What happens today: SKILL.md step 1 puts the (HIM) questions to him in one message, and the card stays
  "active" while waiting. Statuses named in the skill: active, done, skipped (lines 31, 51, 55). The hook gates
  only "active" (line 47).
- Why it matters: while he is away the keep-working hook refuses to let Claude stop and tells it to build the
  next item (keep_working.py lines 37-42), but every commit in that project is denied. Work piles up uncommitted.
- Change, in words: add a "waiting" status that does not gate. No code change; the hook already ignores it.
- Exact text to paste: in SKILL.md after line 41 add:
  `While the (HIM) questions wait for him, set the card status to "waiting" (the commit gate sleeps) and carry on with other work. Set it back to "active" when he answers. Never build the card's own change while it waits.`
- Risk: a card can be forgotten in "waiting"; the prompt hook only names active cards.

### C-09 While he is away, the flow and the keep-working rule pull opposite ways  [needs Aakash]
- What happens today: SKILL.md lines 26-27: unattended, hold every flow-class change and list it under "Needs
  you". keep_working.py lines 38-40: do not stop, pick the next tracker "Planned" row and build it. Planned rows
  are mostly features, which are flow-class.
- Why it matters: with the switch on, an away session can build only small things. He comes back to a list of
  held features instead of built ones.
- Change, in words: let him approve a batch once, the same way the note already allows for the audit's fixes
  ("he approves ONE list").
- Exact text to paste: in SKILL.md replace lines 26-27 with:
  `Unattended runs (he is away, scheduled tasks, helpers): never ask and never block. A flow-class change runs the flow only if he approved it beforehand in a list ("run 360 on A and B, skip C"). Otherwise hold it and list it at the end.`
- Risk: he must remember to give the list before leaving.
- My view: allow the one-list approval (option A); it is his own pattern from the audit. Option B: leave it; away sessions build small changes only.

### C-10 A held change under "Needs you" can trip the website guard  [apply]
- What happens today: the flow lists held changes under "Needs you". needs_you_guard.py lines 13-17 blocks any
  "Needs you" line containing words like "website", "browser", "chrome", "click", "google play", unless the line
  carries "(only you:" (line 53). "Run the 360 flow for the website pricing page?" would be blocked and Claude
  told to "do that step now in his Chrome".
- Why it matters: a wasted turn and a muddled closing block.
- Change, in words: tell the skill to mark the line.
- Exact text to paste: add to SKILL.md section 1: `Write a held change as: "Run the 360 flow for <change>? (only you: your yes starts it)".`
- Risk: none.

### C-11 The fix-only question set reads as fewer UAT types than his hard rule demands  [apply]
- What happens today: QUESTIONS.md marks 14 (edge data), 16 (interruptions), 17 (setting changed), 18 (screen and
  look) and 20 (other devices) as feature-only. The hard rule in `uat-every-change-before-release.md` says every
  fix gets UAT of ALL types ("They should not be missed"), and its list includes exactly those five.
- Why it matters: a fix run through the flow could skip interruption or phone-and-watch testing and still look
  complete on the card. That is how the two false "New record" pop-ups reached him.
- Change, in words: say once that [F] trims the thinking, never the testing.
- Exact text to paste: add to QUESTIONS.md after line 5:
  `[F] decides which questions a fix must answer in writing. It never trims testing: the project's own test and UAT rules apply in full to every fix.`
- Risk: none.

### C-12 Fresh eyes is written in three places, and the flow's copy is the weakest  [apply]
- What happens today: SKILL.md line 48 says "a reviewer that did not build it sees only the changed screens and
  their neighbours". The home rule (`fresh-eyes-review-before-anything-ships.md`) adds: pictures, once per role,
  phone size, no code, no plan, no feature names, three set questions. Repo `CLAUDE.md` line 120 is a third copy.
- Why it matters: a model following the skill alone runs a thinner review than the rule he set.
- Change, in words: the flow points to the rule and stops describing it.
- Exact text to paste: replace SKILL.md line 48 with:
  `6. **Fresh eyes.** Run the owner's fresh-eyes rule as written (his projects: note fresh-eyes-review-before-anything-ships). Evidence = the review's findings and what was fixed.`
- Risk: none.

### C-13 The global skill carries MettleUp's own paths, and restates the read-the-map rule  [apply]
- What happens today: SKILL.md lines 34-35 and 43 name MettleUp files (`docs/changes/R-<n>.json`,
  `docs/system-map/PRODUCT-MAP.md`). His words in the same file: "ensure the questions are generic enough and not
  just custom for this project". Steps 2 and 7 also restate `read-the-product-map-before-any-change.md` (read the
  rows first; update in the same push). `PRODUCT-MAP.md` does not exist yet; `features.json` and `surfaces.json` do.
- Why it matters: two homes for one rule drift apart, and the skill names a file that is not there.
- Change, in words: project file names the map and the answers file; the skill says "see the project file".
- Exact text to paste: in SKILL.md line 43 replace the sentence starting "READ THE MAP FIRST" with:
  `If the project file names a living map, search it for the rows the change touches and name them on the card; otherwise search the code.`
  and add to `docs/change-360-project.md` under the title:
  `Map: docs/system-map/ (features.json, surfaces.json; PRODUCT-MAP.md once the audit builds it). Rule: note read-the-product-map-before-any-change.`
- Risk: none.

### C-14 One request can get two "My view" messages  [apply]
- What happens today: his standing rule gives every feature request a "My view" (is it good, is there a better
  way). SKILL.md lines 23-25 add a second block, "My view: run the 360 flow for <change>?", and wait.
- Why it matters: two opinions and two waits for one ask; the note says he does not want extra asking.
- Change, in words: the flow question is the last line of the normal "My view" reply.
- Exact text to paste: replace SKILL.md line 23 with:
  `If it needs the flow, do NOT start it. End your normal "My view" reply with one line:` and line 24 with:
  `"Run the 360 flow for this? Why: <one line>. Cost: about <S/M/L>. Skipping it is <safe / not safe because ...>."`
- Risk: none.

### C-15 "Anything shipping to a store" can be read as every app change  [needs Aakash]
- What happens today: SKILL.md line 19 lists "anything shipping to a store" as needing the flow. Every app change
  ships to Play in the next batch, so this line contradicts the skip list on lines 20-21 (typo, colour, one-line bug).
- Why it matters: read strictly, he is asked about the flow for every small app fix, the thing he said he does not want.
- Change, in words: narrow it to what the store itself judges.
- Exact text to paste: replace "anything shipping to a store" with
  `a new permission, a store listing or a store-policy matter (health data, payments, target audience)`.
- Risk: a store-bound change outside those three no longer triggers on this line (the other triggers still apply).
- My view: narrow it (option A). Option B: keep it wide and accept more asks.

### C-16 The escape log has no home  [apply]
- What happens today: SKILL.md lines 51-52: "log it and add the check that would have caught it". No file is
  named. By then the card is "done", and the hook ignores done cards. Two existing rules already do this job:
  UAT type 3 (every reported bug stays a test forever) and the `Lessons` folder.
- Why it matters: escapes get logged in a different place each time, or nowhere, so the flow never learns.
- Change, in words: point at the two existing homes and add one line to the card.
- Exact text to paste: replace SKILL.md lines 51-52 with:
  `8. **Escape log.** When done, set status "done". A later bug in this change that reaches him: add it to the card under "escapes" (date, what he saw, which step should have caught it), add the regression test the project's UAT rule asks for, and write a Lessons note only if another project could repeat it.`
- Risk: none.

### C-17 The question list and the flow's status are each written in more than one place  [apply]
- What happens today: the research file (lines 22-79) still holds an older draft of all 43 questions with
  MettleUp words (question 7 differs: "is it for everyone or only for his own use?"). "Switch is off / when it
  goes on" is written in four places: the switch's note, the preference note (line 24), the research file
  (line 8) and the session notes.
- Why it matters: his own lesson says a superseded text still gets obeyed. A model that opens the research file
  answers the wrong list. Four dated status lines will not all be updated when the switch goes on.
- Change, in words: one home for each. Questions: QUESTIONS.md. Status: the switch file.
- Exact text to paste: in the research file replace lines 17-79 with:
  `The question list moved to ~/.claude/skills/change-360/QUESTIONS.md (generic) and the project's docs/change-360-project.md. This file keeps only the research.`
  and replace its line 8 with: `Status: see ~/.claude/change-360/switch.json.`
- Risk: none (the draft is in git history of the brain folder if it is tracked; if not, copy it to an archive first).

### C-18 Nothing stops a model reading the whole map or over-running a small fix  [apply]
- What happens today: step 2 says "READ THE MAP FIRST" (SKILL.md line 43). `features.json` is 296,602 characters,
  about 85,000 tokens. The "Cost: about S/M/L" in the triage line (line 24) has no numbers behind it.
- Why it matters: one careless read costs more than a whole medium flow, out of his weekly limit.
- Change, in words: search the map, never read it whole; give S/M/L a meaning; cap the fix lane.
- Exact text to paste: add to SKILL.md section 3, before step 1:
  `Cost rules: never read a map or data file whole; search it and read only the rows that match. S = about 15,000 tokens, M = about 50,000, L = about 100,000 or more (estimates, audit 18 Nov 2026). A fix that passes about 30,000 tokens on questions alone: stop and tell him.`
- Risk: the numbers are estimates until a few real flows are measured; correct them then.

## F2 and F3: to be added later
