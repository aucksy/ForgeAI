#!/usr/bin/env python3
"""Owner decision 17 Oct 2026 (docs/OWNER-INBOX.md #14): a whole phone run is split into pieces
("shards") that run AT THE SAME TIME on their own emulators, in ONE workflow run (qa-device.yml),
so a whole run takes ~1 h 20 min instead of ~3 h 30 min. Free on a public repo.

Quality rules this file keeps:
  - The shards together hold EXACTLY the whole run's parts (run-device-qa.sh OLD_PARTS +
    UAT_PARTS + w): none missing, none twice. Read from the script itself, so a part added there
    and not here fails this check (and its test) instead of silently never running.
  - Parts that lean on the parts before them stay in the same shard, in the script's order:
    A..I2 build one history (shard 1); J..M use J's Hevy file, L's routines and the workout
    counts of the parts before (shard 2; it starts from the demo, as a partial run does). The UAT
    parts and W each start from a fresh install (proven alone by partial runs), so they split.
  - `extra` (opt-in dnd, longrest, anim, mk) goes to the shard that holds W (mk runs after W).
  - A partial run (`only`) stays ONE piece, exactly as before (it never opens the release gate).

Usage:
  qa_shards.py matrix <only> <extra>   prints the GitHub matrix JSON {"include": [...]}
  qa_shards.py expected                prints the whole run's parts (one line)
  qa_shards.py check <qa-out-root>     after a whole run: every shard wrote shard-done.txt
                                       and together they ran exactly the whole run's parts.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, "apps", "mobile", "qa", "run-device-qa.sh")

# In each shard the parts run in the script's own order (the script decides the order).
SHARDS = [
    ("1-history", "a b c d e f g h h3 p1 p2 i link i2"),
    ("2-routines-gym", "j j2 j3 k l n p9 r br inv invf p7 p0 m"),
    ("3-uat-a", "uh ur un ud ue ub"),
    ("4-uat-b-workout", "uf ua uv ug uk w"),
]


def script_lists(path=SCRIPT):
    text = open(path, encoding="utf-8").read()

    def grab(name):
        m = re.search(r'^%s="([^"]*)"' % name, text, re.M)
        if not m:
            raise SystemExit("could not read %s from %s" % (name, path))
        return m.group(1).split()

    return grab("OLD_PARTS"), grab("UAT_PARTS"), grab("GATE_PARTS")


def expected(path=SCRIPT):
    old, uat, _ = script_lists(path)
    return old + uat + ["w"]


def problems(shards=SHARDS, path=SCRIPT):
    """Why these shards do not hold exactly the whole run's parts ([] = they do)."""
    want = expected(path)
    got = [p for _, parts in shards for p in parts.split()]
    out = []
    for p in sorted(set(want) - set(got)):
        out.append("part %s is in the whole run but in no shard" % p)
    for p in sorted(set(got) - set(want)):
        out.append("part %s is in a shard but not in the whole run" % p)
    for p in sorted({p for p in got if got.count(p) > 1}):
        out.append("part %s is in more than one shard" % p)
    return out


def matrix(only, extra, shards=SHARDS):
    only = " ".join(only.replace(",", " ").split())
    extra = " ".join(extra.replace(",", " ").split())
    if only:
        return {"include": [{"shard": "partial", "parts": "", "only": only, "extra": extra}]}
    out = []
    for name, parts in shards:
        holds_w = "w" in parts.split()
        out.append({"shard": name, "parts": parts, "only": "", "extra": extra if holds_w else ""})
    return {"include": out}


def check(root, shards=SHARDS, path=SCRIPT):
    """Every shard finished (shard-done.txt) and together they ran the whole run's parts."""
    errs = list(problems(shards, path))
    seen = []
    for name, parts in shards:
        done = os.path.join(root, name, "shard-done.txt")
        if not os.path.isfile(done):
            errs.append("shard %s has no shard-done.txt (it did not finish, or its evidence is missing)" % name)
            continue
        text = open(done, encoding="utf-8").read()
        m = re.search(r"^parts=(.*)$", text, re.M)
        ran = m.group(1).split() if m else []
        if sorted(ran) != sorted(parts.split()):
            errs.append("shard %s ran '%s', expected '%s'" % (name, " ".join(ran), parts))
        if not re.search(r"^status=0$", text, re.M):
            errs.append("shard %s ended with a failure (%s)" % (name, " ".join(text.split())))
        seen += ran
    missing = sorted(set(expected(path)) - set(seen))
    if missing:
        errs.append("parts never run: " + " ".join(missing))
    return errs


def main(argv):
    if len(argv) >= 2 and argv[1] == "matrix":
        bad = problems()
        if bad:
            print("\n".join(bad), file=sys.stderr)
            return 1
        print(json.dumps(matrix(argv[2] if len(argv) > 2 else "", argv[3] if len(argv) > 3 else "")))
        return 0
    if len(argv) == 2 and argv[1] == "expected":
        print(" ".join(expected()))
        return 0
    if len(argv) == 3 and argv[1] == "check":
        errs = check(argv[2])
        for e in errs:
            print("SHARD CHECK FAILED: " + e)
        if not errs:
            print("shard check: all %d shards finished green and ran every part of the whole run (%d parts)"
                  % (len(SHARDS), len(expected())))
        return 1 if errs else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
