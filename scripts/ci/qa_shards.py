#!/usr/bin/env python3
"""Owner decision 17 Oct 2026 (docs/OWNER-INBOX.md #14): a whole phone run is split into pieces
("shards") that run AT THE SAME TIME on their own emulators, in ONE workflow run (qa-device.yml),
so a whole run takes ~2 h instead of ~3 h 30 min (the A..R chain is the floor). Free on a public repo.

Quality rules this file keeps:
  - The shards together hold EXACTLY the whole run's parts (run-device-qa.sh OLD_PARTS +
    UAT_PARTS + w): none missing, none twice. Read from the script itself, so a part added there
    and not here fails this check (and its test) instead of silently never running.
  - Parts that lean on the parts before them stay in the same shard, in the script's order:
    A..R is one chain (shard 1). First split runs 39015325103 / 39015326627: J..R started from the
    demo failed on both phones (J expects the demo already removed by an earlier part; K..R lean on
    J and L), so they stay after I2. BR, INV, INV-f, P7, P0 and M passed from the demo alone
    (shard 2). The UAT parts and W each start from a fresh install (proven alone), so they split.
  - `extra` (opt-in dnd, longrest, anim, mk, clip, uat) goes to the shard that holds W (mk runs after W).
  - A partial run (`only`) stays ONE piece, exactly as before (it never opens the release gate).

Usage:
  qa_shards.py matrix <only> <extra> [<affected>]   prints the GitHub matrix JSON {"include": [...]}
  qa_shards.py expected                prints the whole run's parts (one line)
  qa_shards.py check <qa-out-root>     after a whole run: every shard wrote shard-done.txt
                                       and together they ran exactly the whole run's parts and extras.
  12 Nov 2026: a whole run also holds "0-canary" (CANARY, ~10 min) and "0-affected" (the parts using what
  changed since the last green whole run); the matrix fails fast, so a red one cancels every shard.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, "apps", "mobile", "qa", "run-device-qa.sh")

# In each shard the parts run in the script's own order (the script decides the order).
# Minutes from the runs above: shard 1 ~95 (A..I2 ~60 + J..R ~35, the floor), the rest ~35-50.
SHARDS = [
    ("1-history-routines", "a b c d e f g h h3 p1 p2 i link i2 j j2 j3 k l n p9 r"),
    ("2-gym-backup", "br inv invf p7 p0 m uh ur"),
    ("3-uat-a", "un ud ue ubk ub uf ua uv ug uk"),
    # 11 Nov 2026 (gate run 43020416051): with the 0.77.0 UAT parts the opt-in "uat" chain alone runs ~3 h 25 min
    # in the W shard; with ua..uk (~26 min) before it the shard hit the 240-min limit inside W. ua..uk start
    # from a fresh install, so they moved to shard 3 (~65 min before).
    ("4-workout", "w"),
    # 12 Nov 2026: the opt-in "uat" chain is split over shards 4-6 (UAT_SPLIT) so no shard runs ~3 h 45 min
    # (0.77.0 round 5: shard 4 took 208 / 228 min). "none" = no part of the whole run, only its extras.
    ("5-uat-b", "none"),
    ("6-uat-c", "none"),
]
# What the opt-in extra "uat" runs, per shard (minutes from the 0.77.0 round 5 owner run 43106093184):
# uatc = the UAT chain itself (u15, flows 1-14, the gym, F146, T74, 9, F61, R-336; ~60 min, one piece: each
# flow leans on the one before); every u-part starts from a fresh install + the demo (each proven alone with
# `only`), so they split freely. The order inside a shard is the script's own.
UAT_SPLIT = {
    "4-workout": "uatc",                                          # + W ~16 min: ~76 min
    "5-uat-b": "u344 u355 u358 u366 usel u198 u194 upic u456 u458 u461",  # ~77 min + the 12 Nov parts
    "6-uat-c": "u401 u199 u404 u452 u438 u444 u439 u436 u454 uage ulook",  # ~71 min + the 12 Nov parts
}
# Every whole run starts a ~10-minute canary next to the shards (fresh install + demo, an empty workout, the
# What's new card, the Profile chart: the screens most flows pass through). The matrix fails fast, so a red
# canary stops every shard of the round after ~15 minutes instead of 2 h (owner, 11 Nov 2026).
CANARY = "u444 u401"
# The parts that use what changed since the last green whole run of this phone also run next to the shards
# (scripts/ci/flows_to_check.py), so they fail first; more than this many and the round itself is the check.
AFFECTED_MAX = 12


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


def uat_parts(path=SCRIPT):
    """The u-parts the opt-in "uat" chain calls (part_uat in the script), in its order."""
    text = open(path, encoding="utf-8").read()
    m = re.search(r"^part_uat\(\) \{(.*?)^\}", text, re.M | re.S)
    if not m:
        raise SystemExit("could not read part_uat from %s" % path)
    # part_uat_core is the chain itself ("uatc"), not a u-part.
    return [p for p in re.findall(r"^\s*part_(u\w+)\s*$", m.group(1), re.M) if p != "uat_core"]


def problems(shards=SHARDS, path=SCRIPT):
    """Why these shards do not hold exactly the whole run's parts ([] = they do)."""
    want = expected(path)
    got = [p for _, parts in shards for p in parts.split() if p != "none"]
    out = []
    split = [p for parts in UAT_SPLIT.values() for p in parts.split() if p != "uatc"]
    for p in sorted(set(uat_parts(path)) - set(split)):
        out.append("u-part %s is in the uat chain but in no shard of UAT_SPLIT" % p)
    for p in sorted(set(split) - set(uat_parts(path))):
        out.append("u-part %s is in UAT_SPLIT but not in the uat chain" % p)
    for p in sorted({p for p in split if split.count(p) > 1}):
        out.append("u-part %s is in UAT_SPLIT twice" % p)
    for p in sorted(set(want) - set(got)):
        out.append("part %s is in the whole run but in no shard" % p)
    for p in sorted(set(got) - set(want)):
        out.append("part %s is in a shard but not in the whole run" % p)
    for p in sorted({p for p in got if got.count(p) > 1}):
        out.append("part %s is in more than one shard" % p)
    return out


def shard_extras(extra, shards=SHARDS):
    """shard name -> its extras. Everything opt-in goes with W (mk runs after W), but "uat" is split."""
    ex = extra.replace(",", " ").split()
    rest = [e for e in ex if e != "uat"]
    out = {}
    for name, parts in shards:
        mine = list(rest) if "w" in parts.split() else []
        if "uat" in ex:
            mine += UAT_SPLIT.get(name, "").split()
        out[name] = " ".join(mine)
    return out


def matrix(only, extra, shards=SHARDS, affected=""):
    only = " ".join(only.replace(",", " ").split())
    extra = " ".join(extra.replace(",", " ").split())
    if only:
        return {"include": [{"shard": "partial", "parts": "", "only": only, "extra": extra}]}
    ex = shard_extras(extra, shards)
    out = [{"shard": "0-canary", "parts": "", "only": CANARY, "extra": ""}]
    aff = " ".join(affected.replace(",", " ").split())
    if aff and len(aff.split()) <= AFFECTED_MAX:
        out.append({"shard": "0-affected", "parts": "", "only": aff, "extra": ""})
    for name, parts in shards:
        if parts == "none" and not ex[name]:
            continue  # an extras-only shard with nothing to run (no "uat" asked for)
        out.append({"shard": name, "parts": parts, "only": "", "extra": ex[name]})
    return {"include": out}


def check(root, shards=SHARDS, path=SCRIPT, extra=""):
    """Every shard finished (shard-done.txt) and together they ran the whole run's parts and extras."""
    errs = list(problems(shards, path))
    seen = []
    ex = shard_extras(extra, shards)
    for name, parts in shards:
        if parts == "none" and not ex[name]:
            continue
        done = os.path.join(root, name, "shard-done.txt")
        if not os.path.isfile(done):
            errs.append("shard %s has no shard-done.txt (it did not finish, or its evidence is missing)" % name)
            continue
        text = open(done, encoding="utf-8").read()
        m = re.search(r"^parts=(.*)$", text, re.M)
        ran = m.group(1).split() if m else []
        if sorted(ran) != sorted(parts.split()):
            errs.append("shard %s ran '%s', expected '%s'" % (name, " ".join(ran), parts))
        m = re.search(r"^extra=(.*)$", text, re.M)
        ran_ex = m.group(1).split() if m else []
        if sorted(ran_ex) != sorted(ex[name].split()):
            errs.append("shard %s ran the extras '%s', expected '%s'" % (name, " ".join(ran_ex), ex[name]))
        if not re.search(r"^status=0$", text, re.M):
            errs.append("shard %s ended with a failure (%s)" % (name, " ".join(text.split())))
        seen += [p for p in ran if p != "none"]
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
        print(json.dumps(matrix(argv[2] if len(argv) > 2 else "", argv[3] if len(argv) > 3 else "",
                                affected=argv[4] if len(argv) > 4 else "")))
        return 0
    if len(argv) == 2 and argv[1] == "expected":
        print(" ".join(expected()))
        return 0
    if len(argv) in (3, 4) and argv[1] == "check":
        errs = check(argv[2], extra=argv[3] if len(argv) > 3 else "")
        for e in errs:
            print("SHARD CHECK FAILED: " + e)
        if not errs:
            print("shard check: every shard finished green and ran every part of the whole run (%d parts) and its extras"
                  % len(expected()))
        return 1 if errs else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
