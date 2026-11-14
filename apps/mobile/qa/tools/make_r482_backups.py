#!/usr/bin/env python3
"""R-482 phone test fixtures (part u482): five "MettleUp backup" files (src/backup/backupFormat.ts, as
make_backup_zip.py writes one), dated from the PHONE's day, so the muscle tips' "plan in use" rule
(every routine done once, the first 14+ days ago) holds or fails on purpose whatever day the run is.

  qa-r482-ppl.zip   "QA Tips": Push, Pull, Legs (test/tracker/muscleTipsRoutines.test.ts quadHeavyPlan
                    WITHOUT Standing Calf Raise). First workout 20 days ago, the last two Push and Pull,
                    so Up next is Legs. Expected: tip 1 on Legs, "None of your routines trains your calves.
                    Add 3 sets of Standing Calf Raise to your Legs routine?"
  qa-r482-own.zip   the owner's case (the test's ownersPlan(true)): Push, Pull 1, Pull 2, Legs WITH Standing
                    Calf Raise in Legs; the last workout Pull 1, so Up next is Pull 2. Expected: no tip at all.
  qa-r482-swap.zip  quadHeavyPlan (calf raise in Legs): hamstrings 3 sets a week, quads 12. Up next Legs.
                    Expected: tip 2, "Your routines give your hamstrings 3 sets a week and your quads 12.
                    Swap Leg Extension for Seated Leg Curl in your Legs routine?"
  qa-r482-new.zip   as ppl, but the first workout only 10 days ago (a new plan). Expected: no tip.
  qa-r482-shoulder.zip  R-483: the test's oneShoulderPlan, a normal Push, Pull, Legs with bench + incline pressing
                    and ONE shoulder exercise (Lateral Raise 3). Shoulders count direct work only: 3 sets a week,
                    chest 11. The last workout Legs, so Up next is Push. Expected: tip 2, "Your routines give your
                    shoulders 3 sets a week and your chest 11. Add 3 sets of Dumbbell Shoulder Press to your Push
                    routine, or swap Cable Fly for it?" (R-492 words)

Each workout logs only the routine's first exercise (bench, pulldown or squat), so the member's own
history never offers a calf or hamstring exercise and the tip picks the library's (Standing Calf Raise,
Seated Leg Curl). Workouts start at 12:00 UTC (17:30 IST): the same day on the default and owner phones.

Usage: make_r482_backups.py OUT_DIR --today YYYY-MM-DD
"""
import argparse
import datetime as dt
import json
import os
import zipfile


def ref(key):
    return "c:" + key


def routine(day_id, day_type, order, name, rows):
    # ex = [ref, exOrder, targetSets, repMin, repMax]
    return [day_id, day_type, order, name, [[ref(k), i, sets, lo, hi] for i, (k, sets, lo, hi) in enumerate(rows)]]


PUSH = [("barbell_bench_press", 4, 6, 10), ("incline_dumbbell_press", 4, 8, 12), ("cable_fly", 4, 10, 15),
        ("lateral_raise", 4, 12, 15), ("triceps_pushdown", 3, 10, 15)]
PULL = [("lat_pulldown", 4, 8, 12), ("seated_cable_row", 4, 8, 12), ("barbell_row", 4, 6, 10),
        ("face_pull", 3, 12, 15), ("dumbbell_curl", 3, 10, 15)]
LEGS_HEAVY = [("barbell_back_squat", 4, 5, 8), ("leg_press", 4, 8, 12), ("leg_extension", 4, 10, 15),
              ("lying_leg_curl", 3, 10, 15), ("standing_calf_raise", 3, 10, 15), ("plank", 3, 30, 60)]


# R-483 oneShoulderPlan (test/tracker/muscleTipsRoutines.test.ts): one shoulder exercise, no face pull.
PUSH_ONE_SHOULDER = [("barbell_bench_press", 4, 6, 10), ("incline_dumbbell_press", 4, 8, 12), ("cable_fly", 3, 10, 15),
                     ("lateral_raise", 3, 12, 15), ("triceps_pushdown", 3, 10, 15)]
PULL_NO_FACE = [("lat_pulldown", 4, 8, 12), ("seated_cable_row", 4, 8, 12), ("barbell_row", 3, 6, 10),
                ("dumbbell_curl", 3, 10, 15)]
LEGS_PLAIN = [("barbell_back_squat", 4, 5, 8), ("leg_press", 3, 8, 12), ("romanian_deadlift", 3, 8, 10),
              ("lying_leg_curl", 3, 10, 15), ("standing_calf_raise", 3, 10, 15), ("plank", 3, 30, 60)]


def no_calves(rows):
    return [r for r in rows if r[0] != "standing_calf_raise"]


def owners_plan():
    three = lambda keys: [(k, 3, 8, 12) for k in keys]  # noqa: E731
    return [
        routine("r482-push", "push", 0, "Push", three(["barbell_bench_press", "incline_dumbbell_press", "cable_fly", "lateral_raise", "triceps_pushdown"])),
        routine("r482-pull1", "pull", 1, "Pull 1", three(["lat_pulldown", "seated_cable_row", "face_pull", "dumbbell_curl"])),
        routine("r482-pull2", "pull", 2, "Pull 2", three(["barbell_row", "lat_pulldown", "dumbbell_curl"])),
        routine("r482-legs", "legs", 3, "Legs", three(["barbell_back_squat", "leg_press", "romanian_deadlift", "lying_leg_curl", "standing_calf_raise", "plank"])),
    ]


def ppl(legs, push=PUSH, pull=PULL):
    return [
        routine("r482-push", "push", 0, "Push", push),
        routine("r482-pull", "pull", 1, "Pull", pull),
        routine("r482-legs", "legs", 2, "Legs", legs),
    ]


FIRST = {"r482-push": ("barbell_bench_press", 60, 8), "r482-pull": ("lat_pulldown", 50, 10),
         "r482-pull1": ("lat_pulldown", 50, 10), "r482-pull2": ("barbell_row", 60, 8),
         "r482-legs": ("barbell_back_squat", 80, 6)}


def workout(today, days_ago, routine_id, name, day_type):
    day = today - dt.timedelta(days=days_ago)
    start = int(dt.datetime(day.year, day.month, day.day, 12, 0, tzinfo=dt.timezone.utc).timestamp() * 1000)
    key, kg, reps = FIRST[routine_id]
    groups = [[ref(key), [[1, kg, reps], [2, kg, reps], [3, kg, reps]]]]
    # w = [groups, date, started, dayType, source, ended, title, notes, easyWeek, routineId]
    return ["w", "r482-%s-%d" % (routine_id, days_ago), [groups, day.isoformat(), start, day_type, "manual", start + 3600_000, name, None, None, routine_id]]


def backup(today, routines, done, start=True):
    """done = [(days_ago, routine_id)] oldest first. start=False: no start day saved (an older backup, R-484)."""
    by_id = {r[0]: r for r in routines}
    # The folder's start day = its first workout, as a phone that followed it then saves it (folderRepo
    # followFolder). Without one, the app's first read stamps TODAY (planState.getPlanNow) and Up next
    # ignores every earlier workout: run 43393393093 showed "Up next: Push, Week 1".
    first = (today - dt.timedelta(days=done[0][0])).isoformat()
    items = [["r", "r482-folder", ["QA Tips", 1, routines, 1, None, json.dumps({"startISO": first} if start else {})]]]
    for days_ago, rid in done:
        r = by_id[rid]
        items.append(workout(today, days_ago, rid, r[3], r[1]))
    items.append(["u", "me", ["QA Tips", 30, 175, "strength", "intermediate", "", "2026-01-01", 2600, 150, 300, 70, "metric", "en"]])
    return {
        "format": "mettleup-backup",
        "formatVersion": 1,
        "app": "MettleUp",
        "appVersion": "0.77.0",
        "packVersion": 1,
        "createdAt": today.isoformat() + "T06:00:00.000Z",
        "units": "metric",
        "counts": {"workouts": len(done), "folders": 1, "routines": len(routines), "ownExercises": 0, "bodyWeights": 0, "measurements": 0, "photos": 0},
        "items": items,
        "hiddenExercises": [],
        "libraryEdits": [],
        "meta": {},
        "rows": {},
        "settings": {"forgeai-settings": {"unitSystem": "metric", "language": "en"}},
        "photos": [],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--today", required=True)
    a = ap.parse_args()
    today = dt.date.fromisoformat(a.today)
    os.makedirs(a.out, exist_ok=True)
    settled = [(20, "r482-push"), (19, "r482-pull"), (18, "r482-legs"), (9, "r482-push"), (8, "r482-pull"), (7, "r482-legs"), (2, "r482-push"), (1, "r482-pull")]
    files = {
        "qa-r482-ppl.zip": backup(today, ppl(no_calves(LEGS_HEAVY)), settled),
        "qa-r482-own.zip": backup(today, owners_plan(), [(20, "r482-push"), (19, "r482-pull1"), (18, "r482-pull2"), (17, "r482-legs"), (9, "r482-push"), (8, "r482-pull1"), (7, "r482-pull2"), (6, "r482-legs"), (2, "r482-push"), (1, "r482-pull1")]),
        "qa-r482-swap.zip": backup(today, ppl(LEGS_HEAVY), settled),
        "qa-r482-new.zip": backup(today, ppl(no_calves(LEGS_HEAVY)), [(10, "r482-push"), (9, "r482-pull"), (8, "r482-legs"), (2, "r482-push"), (1, "r482-pull")]),
        "qa-r482-shoulder.zip": backup(today, ppl(LEGS_PLAIN, PUSH_ONE_SHOULDER, PULL_NO_FACE), [(20, "r482-push"), (19, "r482-pull"), (18, "r482-legs"), (9, "r482-push"), (8, "r482-pull"), (7, "r482-legs"), (3, "r482-push"), (2, "r482-pull"), (1, "r482-legs")]),
        # R-484: the owner's plan from a backup with NO start day saved (before Phase 4): Up next must stay on
        # Pull 2 and the week line say "Week 3", also after a restart (it used to restart at Push, Week 1).
        "qa-r484-nostart.zip": backup(today, owners_plan(), [(20, "r482-push"), (19, "r482-pull1"), (18, "r482-pull2"), (17, "r482-legs"), (9, "r482-push"), (8, "r482-pull1"), (7, "r482-pull2"), (6, "r482-legs"), (2, "r482-push"), (1, "r482-pull1")], start=False),
    }
    for name, b in files.items():
        with zipfile.ZipFile(os.path.join(a.out, name), "w", compression=zipfile.ZIP_STORED) as z:
            z.writestr("backup.json", json.dumps(b, ensure_ascii=False))
    print(" ".join(sorted(files)))


if __name__ == "__main__":
    main()
