# ForgeAI exercise library — authoring spec (Phase 2)

You write entries for ForgeAI's bundled exercise library (an Android gym app used in India).
Output: ONE JSON file (array of objects) at the path your task gives. No other files.

## Hard rules
- Write ALL text yourself, from your own knowledge. Do NOT copy or paraphrase text from any
  website, dataset or file (the Everkinetic and free-exercise-db instructions are off limits as
  sources of wording). Exercise NAMES and muscle facts are fine.
- Plain English. Short words. No jargon: say "squeeze your shoulder blades together", not
  "retract your scapulae"; "keep your back flat", not "maintain a neutral spine".
- Steps: 2 to 4 steps, each one short sentence (max ~14 words, max 110 characters), imperative
  ("Lie on the bench…", "Lower the bar to your chest."). Cover set-up → the movement → the return.
  One safety cue at most, only where it matters.
- Every entry must be a real, common, safe exercise. Prefer what Indian commercial gyms have.

## Object fields (exact names)
```json
{
  "key": "barbell_bench_press",          // snake_case, unique, stable, ascii
  "name": "Barbell Bench Press",          // Title Case, unique (case-insensitive) across the WHOLE library
  "ek": "0042",                           // Everkinetic drawing id from your list, or null
  "equipment": "barbell",                 // barbell | dumbbell | machine | cable | bodyweight | other
  "type": "weight_reps",                  // see Types
  "primary": ["chest"],                   // 1 (rarely 2) muscle keys
  "secondary": ["triceps", "front_delts"],// 0-3 muscle keys, never repeating a primary
  "compound": true,
  "incrementKg": 2.5,
  "loadMode": "one",                      // see Load mode
  "bwShare": 0,                           // 1 ONLY for the pull-up / chin-up / dip / muscle-up families
  "easier": null,                         // key of an easier version, or null
  "harder": null,                         // key of a harder version, or null
  "repCap": null,                         // bodyweight reps only: rep cap before "try a harder version"
  "holdCapSec": null,                     // time holds only: cap in seconds
  "distUnit": null,                       // distance types only: "km" or "m"
  "aliases": ["bench", "chest press"],    // lowercase search words; Hindi/Hinglish where natural
  "linkNames": ["Bench Press (Barbell)"], // EXACT other titles meaning this exercise (see below)
  "steps": ["Lie on a flat bench, eyes under the bar, feet flat.", "..."]
}
```

### Muscle keys (only these)
chest, front_delts, side_delts, rear_delts, lats, upper_back, traps, lower_back, biceps, triceps,
forearms, abs, obliques, glutes, quads, hamstrings, adductors, abductors, calves, cardio

Guidance: presses → chest/front_delts/triceps; lateral raise → side_delts; rear-delt fly, face
pull → rear_delts; pulldown/pull-up → lats (+biceps, upper_back); rows → upper_back (+lats,
biceps, rear_delts); shrugs → traps; deadlift → glutes+hamstrings or lower_back (+traps);
squat → quads (+glutes, adductors); hip thrust → glutes (+hamstrings); crunch → abs;
twist/side bend → obliques; running/cycling/rowing machine → cardio (+quads etc.).

### Types (only these)
- weight_reps — kg × reps (default for loaded lifts)
- reps — bodyweight reps only (push-up, pull-up, sit-up, burpee)
- weighted — bodyweight move with ADDED weight (weighted pull-up/dip/push-up)
- assisted — machine or band HELP (assisted pull-up machine, band-assisted pull-up)
- time — a hold (plank, wall sit, dead hang, battle ropes for time)
- distance — distance only (rare: sled push in m)
- time_distance — distance + time (running, cycling, rowing machine, walking, farmer's walk)

### Load mode (how the typed weight counts)
- "one" — one bar / machine / one dumbbell held with both hands (goblet squat) — the default
- "both" — two dumbbells or kettlebells, one per hand, both moving together (DB bench, DB curl,
  lateral raise, DB shoulder press, DB shrug)
- "side" — one arm or one leg at a time, reps typed for ONE side (one-arm DB row, concentration
  curl, single-arm cable raise, single-leg curl, one-arm triceps extension)
- "both_side" — two dumbbells AND one leg at a time (DB lunges, DB Bulgarian split squat, DB step-up)
Barbells, machines, cables with both hands, bodyweight moves: "one".

### Increments
barbell 2.5 · dumbbell 2.5 (per dumbbell) · machine 5 · cable 2.5 · kettlebell 4 · weighted/assisted
bodyweight 2.5 (assisted machines 5) · band, cardio, plain bodyweight 1.

### Caps
- repCap: pull-up/chin-up/dip families 15, push-up family 25, others 20 (only on type "reps").
- holdCapSec: plank 60, side plank 45, dead hang 60, wall sit 90, hollow hold 45, L-sit 30.

### linkNames
EXACT titles that mean the same exercise — Hevy app titles (format "Name (Equipment)", e.g.
"Bench Press (Barbell)", "Lateral Raise (Dumbbell)", "Pull Up", "Chest Dip", "Plank",
"Treadmill") and ForgeAI's older names given in your task. Only exact equivalents; never short
generic words. Each linkName must be unique across the library.

### Shared family keys (use these EXACT keys; another helper may own the entry)
Pull-ups (back helper): pull_up, chin_up, assisted_pull_up, assisted_chin_up, weighted_pull_up,
weighted_chin_up, negative_pull_up, band_assisted_pull_up, inverted_row, muscle_up
Dips (chest helper): chest_dip, triceps_dip, assisted_dip, weighted_dip, bench_dip
Push-ups (chest helper): knee_push_up, incline_push_up, push_up, decline_push_up, archer_push_up,
diamond_push_up, wide_push_up, weighted_push_up, pike_push_up, handstand_push_up
Planks/holds (core helper): knee_plank, plank, rkc_plank, side_plank, dead_hang, wall_sit,
hollow_hold, l_sit
Leg raises (core helper): lying_leg_raise, hanging_knee_raise, hanging_leg_raise, toes_to_bar
Squats (legs helper): air_squat, jump_squat, goblet_squat, barbell_back_squat, pistol_squat

Version chains (easier → harder): knee_push_up → incline_push_up → push_up → decline_push_up →
archer_push_up; pike_push_up → handstand_push_up; band_assisted_pull_up/assisted_pull_up →
pull_up → weighted_pull_up; assisted_chin_up → chin_up → weighted_chin_up; assisted_dip →
chest_dip → weighted_dip; bench_dip → triceps_dip; knee_plank → plank → rkc_plank;
lying_leg_raise → hanging_knee_raise → hanging_leg_raise → toes_to_bar; air_squat → pistol_squat;
inverted_row → pull_up; pull_up → muscle_up.
Set "easier"/"harder" on the entries you own following these chains.
