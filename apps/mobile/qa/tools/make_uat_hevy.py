"""Write the small Hevy export the release-UAT part (qa/uat-rel-*.yaml, only=uat) imports.

Nine "Machine Day" workouts, every 3 days, the last one 2 days before `--today` (the phone's own
date, so the history is never "weeks ago" and rule R1's 3-week break never fires). Shaped so each
feature waiting for release can be reached in ONE workout, from a fresh install:

  - Pec Deck Fly ("Chest Fly (Machine)", a 5 kg stack): 25, 30, 35, an odd 38 kg, 45, then FOUR
    workouts at 40 kg x 10, 9, 8 with no progress -> the step-back card "Stuck at 40 kg for 4
    workouts ... Try 35 kg today?" (R-306/R-308), and R-310: 38 is never a suggestion (the very-hard
    step from 40 is 35). Unique weights 25/30/35/38/40/45: 5 of 6 on the 5 kg grid (>= 80 %).
  - Leg Extension (Machine): 40 x4, 50, then FOUR at 45 kg x 12, 10, 9 -> "Stuck at 45 kg for 4
    workouts ... Try 40 kg today?"; the flow taps Try.
  - Bench Press (Barbell): 50 .. 57.5, the last at 60 kg x 10, 8, 6 (range 6-10, just moved up, so
    no stall and no short-day repeat): per-set goals grow by Settings "Weight step" (R-303/R-307):
    Standard (5 %) 10, 9, 6; Large (10 %) 10, 9, 7.
  - Lateral Raise (Dumbbell) 8 kg x 12, 12: a dumbbell move off a bench, so "In use" does NOT open
    by itself and the rest bar says "Tap: In use" (R-299/R-304).
Times are 4:10 am (trap 17: never near a demo workout's start; there is no demo here anyway).

Usage: python3 make_uat_hevy.py OUT.csv --today 2026-11-03
Prints the compared workout's day as the session page writes it ("Sunday, 1 Nov 2026").
"""
import datetime as dt
import sys

COLS = ["title", "start_time", "end_time", "description", "exercise_title", "superset_id",
        "exercise_notes", "set_index", "set_type", "weight_kg", "reps", "distance_km",
        "duration_seconds", "rpe"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

PEC = [25, 30, 35, 38, 45, 40, 40, 40, 40]
LEG = [40, 40, 40, 40, 50, 45, 45, 45, 45]
BENCH = [50, 50, 52.5, 52.5, 55, 55, 57.5, 57.5, 60]


def hevy_time(t: dt.datetime) -> str:
    return f"{t.day} {MONTHS[t.month - 1]} {t.year}, {t.hour}:{t.minute:02d}"


def rows_for(today: dt.date):
    last = today - dt.timedelta(days=2)
    out = []
    for i in range(9):
        day = last - dt.timedelta(days=3 * (8 - i))
        start = dt.datetime(day.year, day.month, day.day, 4, 10)
        end = start + dt.timedelta(minutes=55)
        ex = [
            ("Bench Press (Barbell)", BENCH[i], [10, 8, 6]),
            ("Chest Fly (Machine)", PEC[i], [10, 9, 8]),
            ("Leg Extension (Machine)", LEG[i], [12, 10, 9]),
            ("Lateral Raise (Dumbbell)", 8, [12, 12]),
        ]
        for name, kg, reps in ex:
            for n, r in enumerate(reps):
                # As Hevy (and fixtures/qa-hevy.csv) writes them: empty numbers unquoted.
                out.append(f'"Machine Day","{hevy_time(start)}","{hevy_time(end)}","","{name}",,"",{n},"normal",{kg:g},{r},,,')
    return out, last


def main() -> None:
    out = sys.argv[1]
    today = dt.date.fromisoformat(sys.argv[sys.argv.index("--today") + 1])
    rows, last = rows_for(today)
    with open(out, "w", newline="", encoding="utf-8") as f:
        f.write(",".join(f'"{c}"' for c in COLS) + "\n")
        f.write("\n".join(rows) + "\n")
    print(f"{last.strftime('%A')}, {last.day} {MONTHS[last.month - 1]} {last.year}")


if __name__ == "__main__":
    main()
