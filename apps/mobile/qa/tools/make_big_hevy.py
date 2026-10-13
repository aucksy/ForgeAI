"""Write a Hevy-format workout export the size of a real member's: ~500 workouts over 3 years.

Part W (the "real workout" journey, qa/real-workout-w*.yaml) imports it, so the phone test runs on
a history shaped like the owner's own (his Hevy export: ~500 workouts, 3 years) instead of the
demo's 13 tidy weeks. Audit lesson (13 Oct 2026): D:/Brain/Lessons/forgeai-audits-missed-what-a-
real-workout-shows.md.

Deterministic (fixed seed), generated at run time (never committed: ~1 MB). The history ENDS on
the Saturday before `--today` (part W pins the phone to Monday 1 March 2027), with:
  - three routines in rotation (Push A, Pull A, Legs A) plus a few free "Morning workout"s,
  - warm-ups (Hevy "warmup"), a drop set, RPE on the last working set,
  - a superset (Lateral Raise + Triceps Pushdown share a superset_id),
  - slow progressive overload with plateaus and deloads, missed weeks (holidays, so some
    chart bars are empty), and one 5-week break.

Usage: python3 make_big_hevy.py OUT.csv [--today 2027-03-01]
"""
import datetime as dt
import random
import sys

COLS = ["title", "start_time", "end_time", "description", "exercise_title", "superset_id",
        "exercise_notes", "set_index", "set_type", "weight_kg", "reps", "distance_km",
        "duration_seconds", "rpe"]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def hevy_time(t: dt.datetime) -> str:
    return f"{t.day} {MONTHS[t.month - 1]} {t.year}, {t.hour}:{t.minute:02d}"


def r25(x: float) -> float:
    """Round to the nearest 2.5 kg (a plate step)."""
    return round(x / 2.5) * 2.5


# name, warm-ups [(fraction of work weight, reps)], start kg, end kg, reps range, sets, extra
ROUTINES = {
    "Push A": [
        ("Bench Press (Barbell)", [(0.0, 12), (0.5, 8)], 50.0, 92.5, (5, 8), 3, "rpe"),
        ("Incline Bench Press (Dumbbell)", [(0.5, 12)], 16.0, 30.0, (8, 12), 3, "drop"),
        ("Lateral Raise (Dumbbell)", [], 6.0, 12.0, (12, 15), 3, "ss"),
        ("Triceps Pushdown", [], 20.0, 35.0, (10, 12), 3, "ss"),
    ],
    "Pull A": [
        ("Lat Pulldown (Cable)", [(0.5, 15)], 40.0, 70.0, (8, 12), 3, "rpe"),
        ("Seated Cable Row - V Grip (Cable)", [(0.5, 15)], 35.0, 65.0, (8, 12), 3, ""),
        ("Bicep Curl (Dumbbell)", [], 8.0, 16.0, (10, 12), 3, "drop"),
    ],
    "Legs A": [
        ("Squat (Barbell)", [(0.0, 10), (0.5, 6), (0.75, 3)], 60.0, 120.0, (5, 8), 3, "rpe"),
        ("Leg Extension (Machine)", [(0.4, 15)], 30.0, 60.0, (10, 15), 3, ""),
    ],
}
ORDER = ["Push A", "Pull A", "Legs A"]


def main() -> None:
    out = sys.argv[1]
    today = dt.date(2027, 3, 1)
    if "--today" in sys.argv:
        today = dt.date.fromisoformat(sys.argv[sys.argv.index("--today") + 1])
    rnd = random.Random(20261013)
    last = today - dt.timedelta(days=(today.weekday() - 5) % 7 or 7)  # the Saturday before today
    first = last - dt.timedelta(days=3 * 365)
    span = (last - first).days
    # Training days: Mon/Wed/Fri/Sat, skipping holiday weeks and one long break.
    days = []
    d = first
    break_start = first + dt.timedelta(days=span // 2)
    while d <= last:
        week = (d - first).days // 7
        holiday = week % 17 == 9 or (break_start <= d < break_start + dt.timedelta(days=35))
        if not holiday and d.weekday() in (0, 2, 4, 5) and (rnd.random() < 0.9 or d == last):
            days.append(d)
        d += dt.timedelta(days=1)
    rows = []
    # Rotate so the LAST workout is Legs A: Up next on the pinned Monday is then Push A, the
    # routine with warm-ups, a drop set, RPE and the superset that the journey needs.
    n_routine = sum(1 for i, day in enumerate(days) if not (i % 45 == 22 and day != last))
    turn = (2 - (n_routine - 1)) % 3
    for i, day in enumerate(days):
        progress = (day - first).days / span  # 0 → 1 over the three years
        free = i % 45 == 22 and day != last
        title = "Morning workout" if free else ORDER[turn % len(ORDER)]
        if not free:
            turn += 1
        start = dt.datetime(day.year, day.month, day.day, 18 if not free else 7, rnd.choice([0, 10, 20, 30]))
        exercises = ROUTINES["Push A"][:2] if free else ROUTINES[title]
        n_sets = 0
        block = []
        for name, warmups, lo, hi, (rmin, rmax), sets, extra in exercises:
            # Progress with plateaus: a step every ~6 weeks, a lighter (deload) week every 8th week.
            steps = int(progress * 26)
            work = r25(lo + (hi - lo) * steps / 26)
            if ((day - first).days // 7) % 8 == 7:
                work = r25(work * 0.85)
            work = max(work, 2.5)
            idx = 0
            for frac, reps in warmups:
                w = 20.0 if frac == 0.0 and "Barbell" in name else r25(work * frac) if frac > 0 else r25(work * 0.4)
                block.append([name, "", idx, "warmup", w, reps, ""])
                idx += 1
            for s in range(sets):
                reps = rnd.randint(rmin, rmax) - (1 if s == sets - 1 and rnd.random() < 0.5 else 0)
                rpe = ""
                if extra == "rpe" and s == sets - 1:
                    rpe = rnd.choice([7, 7.5, 8, 8.5, 9, 9.5])
                block.append([name, "0" if extra == "ss" else "", idx, "normal", work, reps, rpe])
                idx += 1
            if extra == "drop":
                block.append([name, "", idx, "dropset", r25(work * 0.7) or 2.5, rnd.randint(rmax, rmax + 4), ""])
                idx += 1
            n_sets += idx
        end = start + dt.timedelta(minutes=12 + 3 * n_sets + rnd.randint(-5, 10))
        for name, ss, idx, kind, w, reps, rpe in block:
            rows.append([title, hevy_time(start), hevy_time(end), "", name, ss, "", idx, kind,
                         f"{w:g}", reps, "", "", rpe])
    # Hevy lists the newest workout first.
    rows.reverse()
    # As Hevy writes it (and qa-hevy.csv has it): text quoted, numbers bare, an empty number empty.
    text_cols = {0, 1, 2, 3, 4, 6, 8}

    def cell(i: int, v: object) -> str:
        if i in text_cols:
            return '"' + str(v).replace('"', '""') + '"'
        return "" if v == "" or v is None else str(v)

    with open(out, "w", newline="", encoding="utf-8") as f:
        f.write(",".join(f'"{c}"' for c in COLS) + "\n")
        for r in rows:
            f.write(",".join(cell(i, v) for i, v in enumerate(r)) + "\n")
    workouts = len(days)
    print(f"{out}: {workouts} workouts, {len(rows)} sets, {days[0]} to {days[-1]} (today {today})")


if __name__ == "__main__":
    main()
