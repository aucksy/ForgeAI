#!/usr/bin/env python3
"""Real-life phone conditions (UAT work package 7): what the PHONE holds, read over adb.

  db <label>                       pull the app's database (root, as part M does) and print one line
                                   "DB <label>: workouts=N sets=N open=0|1 open_done_sets=N plans=N
                                   plan_days=N measurements=N"; the numbers also go to
                                   $XC_OUT/db-<label>.json
  db-check <label> key=N [key>=N ...]
                                   the same pull, then each key compared ("CHECK OK" / "CHECK FAILED")
  channels <dump> [want...]        ForgeAI's notification channels in a `dumpsys notification` dump:
                                   prints id = name for each; every `id=Name` given must match, and
                                   the old channels (rest-timer, rest-over-alarm, rest-card) must be gone
  due <dump>                       the running rest's end (the rest card's `when`, epoch ms), or 0
  cards <dump>                     how many rest cards / "Rest is over" / live cards are showing
  over-any <after-dump> <due-ms>   a "Rest is over" was posted at all; prints how late (no budget)
  over-has <dump> <button>         the newest "Rest is over" carries that button
  late <after-dump> <due-ms>       just the number of seconds it came after the rest's end, or none
  rest-clean <dump> <due-ms>       after the rest's end: EITHER "Rest is over" was posted (any time
                                   after the end) OR nothing of that rest is left (no rest card still
                                   counting a rest that is over). FAILS on a stale card.

The notification parsing is notif.py's (imported, unchanged).
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import notif  # noqa: E402

PKG = "com.forgeai.app"
OLD_CHANNELS = ("rest-timer", "rest-over-alarm", "rest-card")
QUERIES = {
    "workouts": "SELECT COUNT(*) FROM workout_sessions",
    "sets": "SELECT COUNT(*) FROM set_entries",
    "plans": "SELECT COUNT(*) FROM workout_plans",
    "plan_days": "SELECT COUNT(*) FROM plan_days",
    "measurements": "SELECT COUNT(*) FROM body_measurements",
}


def out_dir():
    d = Path(os.environ.get("XC_OUT") or ".")
    d.mkdir(parents=True, exist_ok=True)
    return d


def pull_db():
    """The database files, copied out with root (the app's private folder)."""
    tmp = Path(tempfile.mkdtemp(prefix="xc-db-"))
    base = f"/data/data/{PKG}/files/SQLite/forgeai.db"
    for suffix in ("", "-wal", "-shm"):
        r = subprocess.run(["adb", "exec-out", f"su 0 cat {base}{suffix}"], capture_output=True, timeout=180)
        if r.returncode != 0 or not r.stdout or r.stdout.startswith(b"cat:"):
            if suffix == "":
                raise RuntimeError(f"could not read {base} ({r.stdout[:80]!r} {r.stderr[:80]!r})")
            continue
        (tmp / f"forgeai.db{suffix}").write_bytes(r.stdout)
    return tmp / "forgeai.db"


def summary():
    path = pull_db()
    con = sqlite3.connect(str(path))
    try:
        out = {}
        for k, q in QUERIES.items():
            try:
                out[k] = int(con.execute(q).fetchone()[0])
            except sqlite3.Error as e:
                out[k] = f"? ({e})"
        try:
            row = con.execute("SELECT value FROM meta WHERE key = 'activeWorkoutDraft'").fetchone()
            draft = json.loads(row[0]) if row and row[0] else None
        except (sqlite3.Error, ValueError):
            draft = None
        out["open"] = 1 if draft else 0
        done = 0
        if draft:
            for ex in draft.get("exercises") or []:
                done += sum(1 for s in ex.get("sets") or [] if s.get("done"))
        out["open_done_sets"] = done
        return out
    finally:
        con.close()


def cmd_db(label, checks):
    try:
        s = summary()
    except (RuntimeError, sqlite3.Error, subprocess.TimeoutExpired) as e:
        print(f"DB {label}: NOT READ ({e})")
        return 1
    (out_dir() / f"db-{label}.json").write_text(json.dumps(s, indent=1), encoding="utf-8")
    print(f"DB {label}: " + " ".join(f"{k}={v}" for k, v in s.items()))
    rc = 0
    for c in checks:
        m = re.match(r"^(\w+)(>=|<=|=)(\d+)$", c)
        if not m:
            print(f"CHECK FAILED db {label}: bad check '{c}'")
            rc = 1
            continue
        k, op, n = m.group(1), m.group(2), int(m.group(3))
        v = s.get(k)
        ok = isinstance(v, int) and ((op == "=" and v == n) or (op == ">=" and v >= n) or (op == "<=" and v <= n))
        print(f"CHECK {'OK' if ok else 'FAILED'} db {label}: {k}={v} (want {op}{n})")
        rc |= 0 if ok else 1
    return rc


def app_channels(text):
    """{id: name} of ForgeAI's channels, from the AppSettings block of a dumpsys notification dump."""
    out = {}
    inside = False
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("AppSettings:"):
            inside = PKG in s
            continue
        if inside:
            # A name can hold commas ("Rest is over, sounds off"): read up to the next field.
            m = re.search(r"NotificationChannel\{mId='([^']+)', mName=(.*?), mDescription=", s)
            if m:
                out[m.group(1)] = m.group(2)
    if not out:
        # Older dumps: every channel line names its package nowhere; fall back to ForgeAI's own ids.
        for m in re.finditer(r"NotificationChannel\{mId='((?:rest|workout)[\w-]*)', mName=(.*?), mDescription=", text):
            out[m.group(1)] = m.group(2)
    return out


def cmd_channels(path, wants):
    ch = app_channels(open(path, encoding="utf-8", errors="replace").read())
    for k in sorted(ch):
        print(f"CHANNEL {k} = {ch[k]}")
    rc = 0
    for w in wants:
        cid, _, name = w.partition("=")
        ok = ch.get(cid) == name
        print(f"CHECK {'OK' if ok else 'FAILED'} channel {cid}: '{ch.get(cid)}' (want '{name}')")
        rc |= 0 if ok else 1
    old = [c for c in OLD_CHANNELS if c in ch]
    print(f"CHECK {'OK' if not old else 'FAILED'} old channels gone: {old or 'none left'}")
    return rc | (1 if old else 0)


def recs(path):
    return notif.records(open(path, encoding="utf-8", errors="replace").read())


def rest_cards(rs):
    return [b for b in rs if notif.is_card(b) and notif.title(b).startswith("Rest ")]


def overs(rs):
    return sorted([b for b in rs if notif.title(b) == "Rest is over"], key=notif.created, reverse=True)


def cmd_due(path):
    cards = rest_cards(recs(path))
    w = re.search(r"\bwhen=(\d+)", cards[0]) if cards else None
    print(int(w.group(1)) if w else 0)
    return 0


def cmd_cards(path):
    rs = recs(path)
    lives = [b for b in rs if notif.is_ongoing(b)]
    print(f"CARDS rest card {len(rest_cards(rs))}, Rest is over {len(overs(rs))}, live workout card {len(lives)} "
          f"(channels showing: {sorted({notif.channel_of(b) for b in rs})})")
    return 0


def cmd_over_any(path, due):
    o = overs(recs(path))
    if not o:
        print("CHECK FAILED rest alert: no 'Rest is over' in the list")
        return 1
    posted = notif.created(o[0])
    late = (posted - int(due)) / 1000 if int(due) else float("nan")
    print(f"CHECK OK rest alert: 'Rest is over' posted on {notif.channel_of(o[0])}, {late:.1f}s after the rest's end")
    return 0


def cmd_late(path, due):
    """Seconds between the rest's end and the newest "Rest is over" (one number), or "none"."""
    o = overs(recs(path))
    print(f"{(notif.created(o[0]) - int(due)) / 1000:.1f}" if o and int(due) else "none")
    return 0


def cmd_over_has(path, action):
    o = overs(recs(path))
    if not o:
        print("CHECK FAILED no 'Rest is over' in the list")
        return 1
    acts = notif.actions(o[0])
    ok = action in acts
    print(f"CHECK {'OK' if ok else 'FAILED'} 'Rest is over' buttons {acts} (want '{action}')")
    return 0 if ok else 1


def cmd_rest_clean(path, due):
    rs = recs(path)
    o = overs(rs)
    due = int(due)
    if o and notif.created(o[0]) >= due - 2000:
        late = (notif.created(o[0]) - due) / 1000
        print(f"CHECK OK rest after the update: 'Rest is over' came, {late:.1f}s after the rest's end ({notif.channel_of(o[0])})")
        return 0
    stale = [b for b in rest_cards(rs)]
    if stale:
        print(f"CHECK FAILED rest after the update: no 'Rest is over', and a rest card is still up after the rest ended: '{notif.title(stale[0])}'")
        return 1
    print("CHECK OK rest after the update: no 'Rest is over', but nothing stale either (the rest is cleanly gone)")
    return 0


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    c = argv[0]
    if c == "db":
        return cmd_db(argv[1], [])
    if c == "db-check":
        return cmd_db(argv[1], argv[2:])
    if c == "channels":
        return cmd_channels(argv[1], argv[2:])
    if c == "due":
        return cmd_due(argv[1])
    if c == "cards":
        return cmd_cards(argv[1])
    if c == "over-any":
        return cmd_over_any(argv[1], argv[2])
    if c == "rest-clean":
        return cmd_rest_clean(argv[1], argv[2])
    if c == "over-has":
        return cmd_over_has(argv[1], argv[2])
    if c == "late":
        return cmd_late(argv[1], argv[2])
    print(f"unknown command {c}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
