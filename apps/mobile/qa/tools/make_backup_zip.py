#!/usr/bin/env python3
"""R-123 phone test fixture: qa/fixtures/qa-backup.zip, a "MettleUp backup" as ForgeAI 0.55.2 writes
it (src/backup/backupFormat.ts), for part UBK (qa/uat-bk.yaml): a fresh install restores it from the
welcome screen. What it holds (made up, workouts at 4 am IST, far from the demo's times):
  - 2 folders, "QA First" (order 1, followed) and "QA Second" (order 2), listed the other way round;
  - in "QA First" the routines "QA Push", "QA Pull", "QA Legs" (day_order 0, 1, 2), listed scrambled;
  - 3 workouts, a body weight and a body fat entry, the profile "QA Restored";
  - settings away from the defaults: lb, weekly goal 5, weight jumps Large, rep range Strength;
  - one progress photo (qa/fixtures/sample-progress-1.png).
test/backup/qaFixture.test.ts reads this file with the app's own reader, so it can't drift from the
format. Run from apps/mobile:  python qa/tools/make_backup_zip.py
"""
import json
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "..", "fixtures")


def workout(day, start_ms, routine, title, groups):
    return [groups, day, start_ms, "push", "manual", start_ms + 3600_000, title, None, None, routine]


def main():
    t0 = 1756677000000  # 2025-08-31 22:30 UTC = 1 Sep 2025, 4:00 am IST
    day = 86_400_000
    bench, squat, row, rdl, pulldown, press = (
        "c:barbell_bench_press", "c:barbell_back_squat", "c:barbell_row", "c:romanian_deadlift", "c:lat_pulldown", "c:leg_press")
    first = ["QA First", 1, [
        ["d-legs", "legs", 2, "QA Legs", [[squat, 0, 5, 5, 5, None, 180], [press, 1, 3, 10, 12]]],
        ["d-push", "push", 0, "QA Push", [[bench, 0, 4, 6, 8, '[{"type":"warmup","reps":10}]', 150]]],
        ["d-pull", "pull", 1, "QA Pull", [[pulldown, 1, 3, 8, 12, None, 90, 1], [row, 0, 4, 6, 8, None, 120, 1]]],
    ], 1]
    second = ["QA Second", 0, [["d-arms", "arms", 0, "QA Arms", [[rdl, 0, 3, 8, 10]]]], 2]
    items = [
        ["r", "f-second", second],
        ["r", "f-first", first],
        ["w", "qa-w1", workout("2025-09-01", t0, "d-push", "QA Push", [[bench, [[1, 60, 10, 1], [2, 80, 6, 0, 8.5]]]])],
        ["w", "qa-w2", workout("2025-09-03", t0 + 2 * day, "d-pull", "QA Pull", [[pulldown, [[1, 55, 10]], None, 1], [row, [[1, 70, 8]], None, 1]])],
        ["w", "qa-w3", workout("2025-09-05", t0 + 4 * day, "d-legs", "QA Legs", [[squat, [[1, 100, 5], [2, 100, 5]]]])],
        ["b", "2025-09-02", [79.5]],
        ["m", "2025-09-02|body_fat", [18.5]],
        ["u", "me", ["QA Restored", 31, 176, "strength", "intermediate", "", "2025-08-01", 2600, 150, 300, 70, "imperial", "en"]],
    ]
    photo = os.path.join(FIX, "sample-progress-1.png")
    with open(photo, "rb") as f:
        pic = f.read()
    backup = {
        "format": "mettleup-backup",
        "formatVersion": 1,
        "app": "ForgeAI",
        "appVersion": "0.55.2",
        "packVersion": 1,
        "createdAt": "2026-10-25T04:00:00.000Z",
        "units": "imperial",
        "counts": {"workouts": 3, "folders": 2, "routines": 4, "ownExercises": 0, "bodyWeights": 1, "measurements": 1, "photos": 1},
        "items": items,
        "hiddenExercises": [],
        "libraryEdits": [],
        "meta": {},
        "rows": {},
        "settings": {
            "forgeai-settings": {"unitSystem": "imperial", "language": "en"},
            "forgeai-tracker-prefs": {"weeklyGoal": 5, "weightJump": "large", "repRange": "strength"},
        },
        "photos": [{"kind": "progress", "id": "qa-photo-1", "file": "photos/progress-qa-photo-1.png", "date": "2025-09-02", "createdAt": t0 + day, "bytes": len(pic)}],
    }
    out = os.path.join(FIX, "qa-backup.zip")
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as z:
        z.writestr("photos/progress-qa-photo-1.png", pic)
        z.writestr("backup.json", json.dumps(backup, ensure_ascii=False))
    print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
