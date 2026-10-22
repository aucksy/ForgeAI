# Missing-muscle suggestions: research, 22 Oct 2026

Owner's ask (R-58): research the muscles; when a member's routines leave muscles out, suggest
something; pick where; build it; then trim so nobody feels "this is too much".

## The answer in short
- Judge the **whole week**, never one routine. A push day is meant to skip the back.
- Flag a group only when it is **close to zero**: under 2 counted sets a week for 3 weeks, and
  not one set where it is the main muscle. Not "below the ideal 10".
- Show **one** suggestion at a time, with **one exercise from our library**. Never during a workout.
- "Not now" is remembered. "I skip this on purpose" silences that group for good.
- Small muscles (forearms, traps, neck, inner thighs, outer hips) never get a suggestion.

## 1. What the app already has

**The library.** 402 exercises. Every one names at least one main muscle. 11 name two main
muscles; 84 name no helper muscle. 20 muscle ids (19 body parts plus cardio):

| Our id | Member label | Main muscle in | Named at all in |
|---|---|---|---|
| chest | Chest | 48 | 64 |
| front_delts | Front shoulders | 18 | 83 |
| side_delts | Side shoulders | 12 | 24 |
| rear_delts | Rear shoulders | 9 | 30 |
| lats | Lats | 24 | 48 |
| upper_back | Upper back | 16 | 49 |
| traps | Traps | 7 | 26 |
| lower_back | Lower back | 10 | 24 |
| biceps | Biceps | 46 | 93 |
| triceps | Triceps | 42 | 97 |
| forearms | Forearms | 17 | 79 |
| abs | Abs | 35 | 52 |
| obliques | Obliques | 12 | 18 |
| glutes | Glutes | 21 | 90 |
| quads | Quads | 43 | 60 |
| hamstrings | Hamstrings | 13 | 47 |
| adductors | Inner thighs | 5 | 24 |
| abductors | Outer hips | 6 | 8 |
| calves | Calves | 11 | 27 |
| cardio | Cardio | 18 | 21 |

**Gaps in the library.**
- No exercise for: neck, rotator cuff (external rotation), shin (tibialis), hip flexors.
- No back exercise that needs **no equipment** (every bodyweight pull needs a bar). So our own
  "Home Start" program has zero back, biceps, side- or rear-shoulder work. The plan builder
  already admits it ("A pull-up bar adds real pulling").
- No bodyweight side- or rear-shoulder exercise. Outer hips (6) and inner thighs (5) are thin.
- Worth adding later: a towel or doorway row, a prone Y-raise, a band external rotation.

**The counting rule already exists.** One working set counts 1 for each main muscle and 0.5
for each helper. The body map, "Sets per muscle", the plan builder and the reports all use it.
A reader for "sets per muscle between two dates" exists. Warm-ups never count.

**Four places already judge muscles, each with its own rule.** This is the first thing to fix:

| Where | Today's rule | Problem |
|---|---|---|
| Progress, body map | "Not trained:" lists every untouched muscle of 19, last 7 days | Lists outer hips, inner thighs, forearms, traps. Most members never see it empty. |
| Body map, tap a muscle | "Under 10 sets in the last 7 days, a good one to train next" | Fires for nearly every muscle. "Below ideal" is exactly the FOMO trigger. |
| Monthly report | One line: weakest of 11 big muscles if under 4 sets in the month | Good idea. Suggests a move in words, not an exercise. |
| Plan builder | Tops up 6 main muscles to a weekly target; notes a muscle with 0 | Good. Only at build time. |

**Routines.** A routine is a day inside a folder. The followed folder knows its program or the
builder's answers (equipment, sore areas, "never give me"), its days a week, and whether it came
from the gym's trainer. Profile has goal and experience. There is no member equipment list
outside the builder, and no list of the gym's machines.

## 2. Which groups to judge

Anchor: ACSM (2026) and the CDC both say train **all major muscle groups** at least twice a week.
The CDC names them: legs, hips, back, abdomen, chest, shoulders, arms. ACSM adds that an upper /
lower split with push and pull moves is enough to reach them.

| Level | Group | Built from our ids | Why |
|---|---|---|---|
| Big | Chest | chest | Major group |
| Big | Back | lats + upper_back | Major group; rows and pulldowns share it |
| Big | Shoulders | any delt | Major group |
| Big | Quads | quads | Legs |
| Big | Hamstrings | hamstrings | Common gap: squats and leg press barely touch them |
| Big | Glutes | glutes | Hips |
| Big | Core | abs + obliques | Abdomen |
| Detail | Rear shoulders | rear_delts | Pressing-heavy lifters skip them (see Kolber below) |
| Detail | Side shoulders | side_delts | Presses give only helper work |
| Detail | Biceps / Triceps | biceps / triceps | Arms; usually covered as helpers |
| Detail | Calves | calves | Often skipped; cheap to add |
| Never | Front shoulders | front_delts | Every press already works them |
| Never | Traps, lower back, forearms | traps, lower_back, forearms | Hinges, rows and carrying cover them |
| Never | Inner thighs, outer hips | adductors, abductors | Optional for a gym-goer |

Helpers count half. That is the standard: Fitbod and Boostcamp both count 1 and 0.5, and the
largest dose-response review (Pelland, preprint) found the half-set count fitted the data best.

## 3. How much is "missing"

- Muscle growth rises with weekly sets. Schoenfeld 2017: each extra weekly set adds a little;
  under 5, 5 to 9, and 10+ sets a week rank in that order.
- ACSM 2026: 10+ sets a week per group helps growth; returns shrink after about 18 to 20.
  One set beats zero. At least two sets per exercise.
- RP: about 6 sets a week keeps the muscle you have (maintenance), trained twice a week.
- Frequency matters little once the weekly sets are the same (ACSM; Pelland).

So 10 sets is a goal for people chasing size. Using it as the bar would flag almost every
member. **Our bar is "close to zero": under 2 counted sets a week, averaged over 3 weeks, and no
set where the group is the main muscle.** One real exercise of 2 sets a week clears it.

## 4. What competitors do

| App | What it shows | Where | Notes |
|---|---|---|---|
| Hevy | Body graph (last 7 days), sets per muscle by week (current week), monthly muscle mix vs last month | Profile > Statistics; monthly report | Shows, never judges. No targets, no warnings found. Muscle heat map while logging. |
| Fitbod | Weekly set targets as progress bars, grouped Push / Pull / Legs, % done | Targets tab | Targets cannot be edited ("highly requested"). Its help page admits its own workouts may not hit the targets, and contradicts itself on helper sets. |
| Fitbod | Recovery map, 0 to 100% per group, fresh after six days | Body tab | Picks the next workout from fresh muscles. |
| Boostcamp | Heat map, radar, table; 1 and 0.5 counting; compared with the period before | Analytics (paid) | "Pale area" means a muscle may need direct work. Warns one workout is too small a sample. |
| MacroFactor | Average sets a week per group on a body map, 1 week to 3 months | Levels tab | No targets or labels at all. |
| JEFIT | Claims a "Movement Balance" engine | Marketing only | Could not find how it tells members. |
| Strong, Alpha Progression, Gravitus | No balance view confirmed | | |

User feedback I could read: Bevel's board (104 votes) asks for muscle detail over time and finer
muscles (one user names the shin). Fitbod members ask to edit targets. Reddit is blocked to our
tools, so no Reddit quotes here.

Takeaway: the leaders **show** muscle balance but leave the judging to the member. Fitbod
judges with targets and gets "let me change them". Nobody suggests one fix in context. That is
our gap to own, if it stays quiet.

## 5. Rules against FOMO
1. Judge the week of routines, or 3 weeks of logged workouts. Never one routine, never one day.
2. Close to zero only. Never "below ideal".
3. One suggestion visible at a time; a new one at most once a week.
4. Never during a workout, on the finish screen, or as a phone notification.
5. "Not now" snoozes that group for 4 weeks; two "Not now"s mean muted. "I skip this on purpose"
   mutes it until turned back on in Settings.
6. Say what to add, not what is wrong. Gain-framed messages work better for exercise habits
   (Gallagher and Updegraff, 2012). No "missing", "neglected", "imbalance", "weak", no red.
7. Respect choices: a muted group, a plan from the gym's trainer, and a ready program's own
   design are never second-guessed. No suggestions in an easy week.
8. Beginners see big groups only.
9. Every line passes the banned-word check: never "volume", "PR" or "session".

## 6. Recommended design for ForgeAI

**The check (one engine, pure, tested).**
1. Count working sets per muscle, 1 main and 0.5 helper (existing reader).
2. Roll up into the 12 judged groups (section 2).
3. A group is missing when it averages under 2 counted sets a week AND has no main-muscle set.
   Two sources: the **planned week** (the followed folder's routines times its days a week) and
   the **logged 3 weeks** (needs 3 weeks since the first workout and 4+ strength workouts).
4. Merge: quads, hamstrings and glutes all missing becomes "Legs". Back missing absorbs rear
   shoulders and biceps. Chest missing absorbs triceps and side shoulders.
5. Drop muted, snoozed, beginner detail groups, groups a followed ready program or gym plan
   leaves out on purpose, and everything during an easy week.
6. Pick one, in this order: Legs, Back, Chest, Hamstrings, Glutes, Quads, Core, Shoulders,
   Rear shoulders, Side shoulders, Calves, Triceps, Biceps.

**The exercise.** First, the member's own most-used exercise for that group. Else the plan
builder's own pick for that slot (hamstrings: leg curl, else a hinge; rear shoulders: face pull
or reverse fly; calves: calf raise; and so on), filtered by the same equipment, sore-area and
"never" rules. Equipment comes from the builder's answers, else from what they logged in the
last 8 weeks. 2 sets for a beginner, 3 otherwise. It goes into the routine whose day fits: legs,
lower or full for leg groups; pull or upper for back; push or upper for chest and side
shoulders; the shortest routine for core and calves.

**Where it shows (full build).**

| Place | When | Example line |
|---|---|---|
| The plan's routine list | The planned week misses a group | "Your week has no hamstring work. Lying Leg Curl on Legs day covers it." [Add 3 sets] [Not for me] |
| Up next card, Workout tab | Logged 3 weeks miss it AND today's routine is its home | "Easy add today: 2 sets of Face Pull for your rear shoulders." [Add] [Not now] |
| Monthly report | Month over, same engine replaces today's rule | "Calves got no work in October. Calf Raise on Legs day would cover it." |
| Body map | Always | "Not trained" lists judged groups only; the tap sheet drops "under 10 sets" |

Upper-body-only example: "Your last 3 weeks had no leg work. Add Leg Press to Upper A?"
[Add] [I skip legs on purpose].

**Tested on real cases** (same rule, run on our data today):

| Case | Raw flags | Member sees |
|---|---|---|
| Upper-body-only, 3 days | Quads, Hamstrings, Glutes, Core, Rear sh., Calves | Legs (one card) |
| Push Pull Legs, squats and leg press only | Hamstrings, Core, Side sh., Rear sh., Calves | Hamstrings |
| Push and legs, no pulling | Back, Core, Rear sh., Biceps | Back |
| Our other 7 programs (PPL, Upper/Lower, PPL x2, Dumbbell Upper/Lower and PPL, Home Upper/Lower, Calisthenics) | none | nothing |
| Full Body Basics, Dumbbell Full Body | Calves | nothing (beginner) |
| Strength Starter | Hamstrings, Calves | nothing (followed program) |
| Home Start | Back, Side sh., Rear sh., Biceps | nothing, but a real gap: fix the library |

**Data we have:** muscles for all 402 exercises and custom ones; sets per muscle by date;
routines, the followed folder, days a week, program, builder answers, gym-plan flag; goal,
level; easy weeks; settings storage.
**Missing:** a mute / snooze list (small new setting); member equipment when no builder was
used (infer from history); the gym's machine list (does not exist); the library gaps above.

## 7. Trim levels for the owner to pick later
| Level | What stays |
|---|---|
| Full (build this) | All four places, 12 groups, one at a time |
| Trim 1: big only | Only the 7 big groups for everyone |
| Trim 2: proof first | Only from logged workouts, only after 4 weeks, only on the Up next card |
| Trim 3: report only | No cards; one line in the monthly report |

Plus a Settings switch, "Muscle tips", on by default.

## Sources (read)
- ACSM Position Stand 2026, Currier et al., Med Sci Sports Exerc 58(4):851-872: https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823
- Schoenfeld, Ogborn, Krieger 2017, dose-response meta-analysis (abstract): https://pubmed.ncbi.nlm.nih.gov/27433992/
- Pelland et al. 2024, dose-response meta-regressions (preprint): https://sportrxiv.org/index.php/server/preprint/view/460
- CDC adult activity guidelines: https://www.cdc.gov/physical-activity-basics/guidelines/adults.html
- RP, training volume landmarks: https://rpstrength.com/training-volume-landmarks-muscle-growth/
- Kolber et al. 2014, shoulder impingement in recreational lifters (abstract): https://pubmed.ncbi.nlm.nih.gov/24077379/
- Gallagher and Updegraff 2012, message framing meta-analysis (abstract): https://pubmed.ncbi.nlm.nih.gov/21993844/
- Hevy, muscle group chart: https://www.hevyapp.com/features/muscle-group-workout-chart/
- Hevy, sets per muscle group: https://www.hevyapp.com/features/sets-per-muscle-group-per-week/
- Hevy, monthly report: https://www.hevyapp.com/features/monthly-report/
- Fitbod, Weekly Set Targets: https://help.fitbod.me/hc/en-us/articles/24739986755223-Weekly-Set-Targets
- Fitbod, Muscle Recovery: https://help.fitbod.me/hc/en-us/articles/360006269014-Muscle-Recovery
- Fitbod, targets and recovery tabs (blog): https://fitbod.me/blog/the-best-bodybuilding-app-for-physique-goals/
- Boostcamp, Muscle Tracker: https://www.boostcamp.app/features/muscle-tracker
- MacroFactor, Levels: https://help.macrofactorapp.com/en/articles/342-understanding-levels
- JEFIT blog (Movement Balance claim): https://www.jefit.com/blog/7-best-ai-powered-progressive-overload-workout-trackers-of-2026-for-automated-strength-and-muscle-gains
- Bevel feedback board, muscle analytics: https://feedback.bevel.health/feature-requests/p/detailed-muscle-group-analytics-in-activity-tab
