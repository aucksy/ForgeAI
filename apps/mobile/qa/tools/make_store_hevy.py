"""Write the Hevy-format history the Play Store screens are taken on (R-126, 25 Oct 2026).

The store pictures must look like a real member's phone, not a test phone: a steady four months of
Push / Pull / Legs, weights that climb smoothly (no deload dip on the chart), plain names. The
store-shots run (qa/run-store-shots.sh) imports it through the welcome's "From Hevy", follows the
three routines as the plan, and starts today's Push Day.

Shape:
  - 49 workouts on Mondays, Wednesdays and Fridays before `--today`, so today's workout is the
    member's 50th (the finish screen's "Your 50th workout");
  - Push Day / Pull Day / Leg Day in turn, ending with Leg Day, so Up next today is Push Day;
  - the bench climbs 60 -> 80 kg in 2.5 kg steps, 2 warm-ups (empty bar x 12, 40 x 8) and 3 x 8;
  - the LAST Push Day was a short one (two exercises, two working sets on the bench): today's full
    workout then lifts more than it, and the finish screen compares upward.

Usage: python3 make_store_hevy.py OUT.csv [--today 2026-10-26]
"""
import datetime as dt
import sys

COLS = ["title", "start_time", "end_time", "description", "exercise_title", "superset_id",
        "exercise_notes", "set_index", "set_type", "weight_kg", "reps", "distance_km",
        "duration_seconds", "rpe"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# name, warm-ups [(kg, reps)], start kg, end kg, reps, working sets
ROUTINES = {
    "Push Day": [
        ("Bench Press (Barbell)", [(20.0, 12), (40.0, 8)], 60.0, 80.0, 8, 3),
        ("Incline Bench Press (Dumbbell)", [], 20.0, 30.0, 10, 3),
        ("Lateral Raise (Dumbbell)", [], 8.0, 12.0, 12, 3),
        ("Triceps Pushdown", [], 25.0, 40.0, 12, 3),
    ],
    "Pull Day": [
        ("Lat Pulldown (Cable)", [], 50.0, 70.0, 10, 3),
        ("Seated Cable Row - V Grip (Cable)", [], 50.0, 70.0, 10, 3),
        ("Bicep Curl (Dumbbell)", [], 10.0, 16.0, 10, 3),
    ],
    "Leg Day": [
        ("Squat (Barbell)", [(20.0, 10), (60.0, 5)], 80.0, 110.0, 6, 3),
        ("Romanian Deadlift (Barbell)", [], 70.0, 100.0, 8, 3),
        ("Leg Press (Machine)", [], 120.0, 180.0, 10, 3),
        ("Leg Extension (Machine)", [], 35.0, 55.0, 12, 3),
    ],
}
ORDER = ["Push Day", "Pull Day", "Leg Day"]
WORKOUTS = 49


def hevy_time(t: dt.datetime) -> str:
    return f"{t.day} {MONTHS[t.month - 1]} {t.year}, {t.hour}:{t.minute:02d}"


def step(lo: float, hi: float, k: int, n: int, inc: float) -> float:
    """The k-th of n workouts of one routine: lo -> hi in whole `inc` steps, never going down."""
    if n <= 1:
        return hi
    w = lo + (hi - lo) * k / (n - 1)
    return round(w / inc) * inc


def main() -> None:
    out = sys.argv[1]
    today = dt.date.today()
    if "--today" in sys.argv:
        today = dt.date.fromisoformat(sys.argv[sys.argv.index("--today") + 1])
    days = []
    d = today - dt.timedelta(days=1)
    while len(days) < WORKOUTS:
        if d.weekday() in (0, 2, 4):
            days.append(d)
        d -= dt.timedelta(days=1)
    days.reverse()
    # The last workout is Leg Day: count back from it.
    titles = [ORDER[(2 - (len(days) - 1 - i)) % 3] for i in range(len(days))]
    per = {t: titles.count(t) for t in ORDER}
    seen = {t: 0 for t in ORDER}
    last_push = max(i for i, t in enumerate(titles) if t == "Push Day")
    rows = []
    for i, (day, title) in enumerate(zip(days, titles)):
        k = seen[title]
        seen[title] += 1
        short = i == last_push
        exercises = ROUTINES[title][:2] if short else ROUTINES[title]
        start = dt.datetime(day.year, day.month, day.day, 18, (i * 7) % 4 * 10)
        block = []
        for name, warmups, lo, hi, reps, sets in exercises:
            inc = 5.0 if "Machine" in name and "Leg Press" in name else (1.0 if "Dumbbell" in name else 2.5)
            work = step(lo, hi, k, per[title], inc)
            idx = 0
            for wkg, wr in warmups:
                block.append([name, idx, "warmup", wkg, wr])
                idx += 1
            n_sets = 2 if short and "Bench" in name else sets
            for _ in range(n_sets):
                block.append([name, idx, "normal", work, reps])
                idx += 1
        end = start + dt.timedelta(minutes=10 + 3 * len(block))
        for name, idx, kind, w, r in block:
            rows.append([title, hevy_time(start), hevy_time(end), "", name, "", "", idx, kind,
                         f"{w:g}", r, "", "", ""])
    text_cols = {0, 1, 2, 3, 4, 6, 8}

    def cell(i: int, v: object) -> str:
        if i in text_cols:
            return '"' + str(v).replace('"', '""') + '"'
        return "" if v == "" or v is None else str(v)

    with open(out, "w", newline="", encoding="utf-8") as f:
        f.write(",".join(f'"{c}"' for c in COLS) + "\n")
        for r in rows:
            f.write(",".join(cell(i, v) for i, v in enumerate(r)) + "\n")
    print(f"{out}: {len(days)} workouts, {len(rows)} sets, {days[0]} to {days[-1]} (today {today}); "
          f"last {titles[-1]}, bench {per['Push Day']} times")


if __name__ == "__main__":
    main()
