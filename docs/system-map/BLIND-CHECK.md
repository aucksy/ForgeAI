# Blind check (plan 3G)

Scored 27 Nov 2026, about 04:15 IST, by the coordinator, after Phase B ended. The held-out list was opened
for the first time at that point. No helper brief named these items or hinted at them.

The held-out list: 7 problems Aakash found himself on 18 Nov 2026. The test: did the audit find them on its
own, by reading the code, notes and tests?

## Score: 1 found, 2 partly, 4 missed (29%, counting partly as half)

| Item | What Aakash found | Result | Closest audit finding |
|---|---|---|---|
| F222 | The watch update pop-up leaves no lasting sign once closed | **Found** | FN-A3-notes-claude-1-07 (S3): "A watch update is easy to miss: the pop-up hides for a day on the back button and leaves no lasting sign". It came from the project notes, so it is a read of an earlier report, not a fresh find. |
| F224 | The watch stops reading heart rate when its screen dims (gaps in Health Connect / Fitbit) | **Partly** | FN-A8-watch-app-1-07 (S4) notes that nothing tests the sensor stopping "when the screen dims", and FN-A5-watch-app-1-01 (S3, verified) finds the heart line keeps a stale number. Neither says the dimming makes gaps in the member's heart data. |
| F226 | The watch asks for RPE on warm-up sets, and an RPE picked on the watch did not reach the phone | **Partly** | FN-B-truth-watch-app-a-01 (S2, verified) finds a related watch-to-phone fault in the same "How hard was it?" step: the wrong set can be saved. No finding covers warm-ups or an effort score that never arrives. |
| F223 | The rest time control on the active workout screen does not look like a button | **Missed** | Lens 9 found five other controls that do not look tappable (for example FN-L9-phone-tracker-components-2-04, FN-L9-phone-native-02), but not the rest time control. |
| F225 | Weight-lifted totals missing for empty workouts or custom exercises | **Missed** | Nothing close. The nearest is FN-B-truth-phone-lib-core-b-01 (volume compared to an unusual week), which is a different fault. |
| F227 | The next-set suggestion repeats last time instead of adding one (Air Squat 66 and 45 reps suggested again) | **Missed** | Several findings about the Target line after a long break (FN-B-truth-phone-tracker-engine-b-01) and Plus limits, but none on a plain repeat. |
| F232 | Admin app: the history cards under notifications cannot be tapped any more (a regression) | **Missed** | Bell findings cover what History keeps (FN-A8-panel-brand-shell-1-02) and read status, not that its cards stopped opening. |

## Method holes (plan G3): why each miss happened

1. **F223, the look of the most-used control:** lens 9 read control styles file by file. It never looked at
   screen pictures of the active workout screen, the screen members use most. *Hole:* the look lens must start
   from pictures of the top 5 screens, not from code files.
2. **F225 and F227, wrong numbers from the training logic:** no lens ran the training maths on example data.
   The truth lens compared words with code logic, and code reading looks right in both cases. *Hole:* sums and
   suggestions need to be run on a small set of example histories (empty workout, custom exercise, bodyweight,
   high-rep move like Air Squat) and the answers checked by hand.
3. **F232, a lost tap (a regression):** code reading sees what a screen does today, not what it stopped doing.
   No lens compared recent changes for tap handlers that went missing, and nobody drove the admin bell.
   *Hole:* every audit needs a "what changed in the last 30 days" pass that drives each changed screen once.
4. **F224 (partly), device-only behaviour:** the sensor stopping on dim was seen only as a missing test, and
   nobody followed the readings into Health Connect to see the gaps. *Hole:* the phone-and-watch lens needs one
   real-watch run with the screen dimming, and must check what lands in Health Connect.
5. **F226 (partly), set types on the watch:** the audit checked the watch effort step for timing races, but
   no lens asked "which kinds of set should this appear on?". *Hole:* each step that asks the member something
   needs a "when should this NOT be asked?" question (warm-ups, drop sets, timed sets).

## What this means for the report

The audit is strong at reading promises against code: privacy, payments, words, missing tests. It is weak at
three kinds of fault that members feel most: wrong training numbers, controls that look wrong on the main
screen, and taps that stopped working after a change. Those need example-data runs and screen driving, not
more code reading. These holes feed Phase C (method fixes), which waits for the owner.
