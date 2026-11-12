"""Which MettleUp exercises still have no picture, and how far each one has got.

Plain Python, no Blender, runs in about a second. It rebuilds the list from disk every time, so it never
goes stale (the daily picture job and any chat use it; DAILY-LOG.md keeps only decisions and the run log).

  python tools/exercise-anim/picture_status.py            # summary + the next 20 to work on
  python tools/exercise-anim/picture_status.py --next 40  # the next 40 keys, one per line (for a run)
  python tools/exercise-anim/picture_status.py --table    # every key without a picture, with its status

How "no picture" is worked out (the same rule the app uses for the Start/End pictures on an exercise page):
  every key in docs/exercise-library/part_*.json
  minus keys with a RepDB picture   (PICTURE_SOURCE_IDS in apps/mobile/src/tracker/catalog/pictures.ts,
                                     generated from docs/exercise-library/repdb-match.json)
  minus keys with an approved clip  (CLIP_VERSIONS in apps/mobile/src/tracker/clips/clipManifest.ts)
  minus keys with our own picture   (apps/mobile/assets/exercise-pictures-own/<key>__start.webp, made by
                                     export_pictures.py once the owner approved a look)
The Everkinetic line drawings (catalog/media.ts) are only in the "watch the movement" sheet, so they do not count.

Status per key, highest that applies:
  in-app       our own picture file is in the app folder above
  QA-pass      the cloud stills passed QA (qa.json)       QA-fail (reason) = failed (qa.json)
  rendered     the cloud stills exist but QA not done yet (qa.json "rendered" without "qa")
  recipe       specs/<key>.json exists
  researched   research/<key>.json exists
  queued       nothing yet, and the pipeline has the equipment
  needs-prop   nothing yet, and the pipeline lacks the equipment (see NEEDS below); skipped by --next

Order: library order (part A..E, file order). Usage data does not exist yet; if it ever does, sort by it here.
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
LIB = os.path.join(REPO, "docs", "exercise-library")
PICTURES_TS = os.path.join(REPO, "apps", "mobile", "src", "tracker", "catalog", "pictures.ts")
CLIPS_TS = os.path.join(REPO, "apps", "mobile", "src", "tracker", "clips", "clipManifest.ts")
OWN = os.path.join(REPO, "apps", "mobile", "assets", "exercise-pictures-own")
QA = os.path.join(HERE, "qa.json")

# Equipment the pipeline can build today (pipeline/forgeanim/props.py): dumbbells, an adjustable bench (flat to
# upright), a plain box (step / plyo box / wall block) and the floor. Anything else waits for a new prop.
READY_EQUIPMENT = {"dumbbell", "bodyweight"}
# Dumbbell / bodyweight keys that still need a prop the pipeline does not have.
NEEDS = {
    "weighted_push_up": "weight plate on the back",
    "handstand_push_up": "wall handstand (needs a check that the rig can go upside down)",
    "weighted_sissy_squat": "weight plate",
    "bodyweight_triceps_extension": "bar or Smith bar to lean on",
    "single_arm_dumbbell_wrist_curl": "a wrist that bends (the rig keeps the wrist straight)",
    "decline_dumbbell_skull_crusher": "decline bench", "decline_sit_up": "decline bench", "decline_oblique_crunch": "decline bench",
    "decline_leg_raise": "decline bench", "weighted_decline_crunch": "decline bench",
    "hanging_leg_raise": "pull-up bar", "toes_to_bar": "pull-up bar", "dead_hang": "pull-up bar",
    "l_sit": "parallettes or dip bars",
    "swimming": "water", "outdoor_run": "outdoor scene (or a plain running stride)",
    "hiking": "outdoor scene", "walking": "plain walking stride (possible; low value)",
    "stomach_vacuum": "a belly that draws in (the rig has no per-pose belly shape; research/stomach_vacuum.json)",
}


def library():
    out = []
    for p in sorted(glob.glob(os.path.join(LIB, "part_*.json"))):
        with open(p, encoding="utf-8") as f:
            out += json.load(f)
    return out


def keys_in(path, block):
    """Keys of a `const BLOCK ... = { key: ..., }` object in a TS file."""
    with open(path, encoding="utf-8") as f:
        s = f.read()
    m = re.search(block + r"[^=]*=\s*\{(.*?)\n\};", s, re.S)
    return set(re.findall(r"^\s+(\w+):", m.group(1), re.M)) if m else set()


def load_qa():
    if os.path.exists(QA):
        with open(QA, encoding="utf-8") as f:
            return json.load(f)
    return {}


def status_of(e, qa):
    k = e["key"]
    if os.path.exists(os.path.join(OWN, f"{k}__start.webp")):
        return "in-app"
    q = qa.get(k, {})
    if q.get("qa") == "pass":
        return "QA-pass"
    if q.get("qa") == "fail":
        return f"QA-fail ({q.get('reason', '?')})"
    if q.get("rendered"):
        return "rendered"
    if os.path.exists(os.path.join(HERE, "specs", f"{k}.json")):
        return "recipe"
    if os.path.exists(os.path.join(HERE, "research", f"{k}.json")):
        return "researched"
    if e["equipment"] not in READY_EQUIPMENT:
        return f"needs-prop ({e['equipment']})"
    if k in NEEDS:
        return f"needs-prop ({NEEDS[k]})"
    return "queued"


def rows():
    have = keys_in(PICTURES_TS, "PICTURE_SOURCE_IDS") | keys_in(CLIPS_TS, "CLIP_VERSIONS")
    qa = load_qa()
    return [(e["key"], e["name"], e["equipment"], e["type"], status_of(e, qa)) for e in library() if e["key"] not in have]


def main(argv):
    r = rows()
    if "--next" in argv:
        n = int(argv[argv.index("--next") + 1])
        qa = load_qa()
        # A key that failed twice is not picked again (listed for review in DAILY-LOG.md instead).
        pick = [k for k, _, _, _, s in r if s == "queued" or (s.startswith("QA-fail") and qa.get(k, {}).get("tries", 0) < 2)]
        print("\n".join(pick[:n]))
        return
    if "--table" in argv:
        print("| # | Key | Name | Equipment | Status |\n|---|---|---|---|---|")
        for i, (k, name, eq, _, s) in enumerate(r, 1):
            print(f"| {i} | {k} | {name} | {eq} | {s} |")
        return
    from collections import Counter
    c = Counter(s.split(" (")[0] for *_, s in r)
    print(f"Exercises without a picture: {len(r)} of {len(library())}")
    for s, n in c.most_common():
        print(f"  {s}: {n}")
    print("Next 20:", ", ".join(k for k, *_, s in r if s == "queued")[:2000] or "none queued")


if __name__ == "__main__":
    main(sys.argv[1:])
