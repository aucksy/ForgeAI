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

# Equipment the pipeline can build today (pipeline/forgeanim/props.py): dumbbells, a straight barbell (held by both hands), an adjustable bench (flat to
# upright), a plain box (step / plyo box / wall block) and the floor. Anything else waits for a new prop.
READY_EQUIPMENT = {"dumbbell", "bodyweight", "barbell", "machine", "other", "cable"}   # barbell: straight bar; machine: own plain geometry (recipe "machine" parts), 13 Nov 2026
# "other" (13 Nov 2026): props_other.py builds a decline bench, back-extension bench, stability ball, pull-up / lean bar,
# parallettes, a post, weight plates, a sled and a kettlebell; the "other" keys it cannot show honestly are in NEEDS.
# cable (13 Nov 2026): props.py cable_column + D-handle / straight bar / rope / ankle cuff.
# Dumbbell / bodyweight keys that still need a prop the pipeline does not have.
NEEDS = {
    "weighted_push_up": "weight plate on the back",
    "handstand_push_up": "wall handstand (needs a check that the rig can go upside down)",
    "single_arm_dumbbell_wrist_curl": "a wrist that bends (the rig keeps the wrist straight)",
    # decline bench, pull-up bar, parallettes, plates: props_other.py (13 Nov 2026)
    "toes_to_bar": "a whole-body pike while hanging (hips ~160 deg flexed with the spine curled; not yet posed)",
    "hand_gripper": "a hand that squeezes a spring gripper (the rig's hand shapes are fixed fist / flat / cup)",
    "jump_rope": "a rope swinging round the body (a still cannot show it honestly)",
    "battle_ropes": "two heavy ropes in waves from an anchor (rope shape not built)",
    "outdoor_cycling": "a road bike (not built)",
    "sled_pull": "a harness or straps from the sled to the hands (not built)",
    "swimming": "cannot be shown honestly: swimming needs water, and drawn water would be invented detail (13 Nov 2026)",
    "hiking": "cannot be shown honestly: hiking needs a real trail; on a flat floor it is the walking picture (13 Nov 2026)",
    # machine keys not built yet (13 Nov 2026): the machine family covers seats, pads, handles, levers and stacks
    "assisted_chin_up": "assisted pull-up machine (knee platform + counterweight) not built yet",
    "machine_pullover": "pullover machine (elbow pads on a cam above the shoulder) not built yet",
    "chest_supported_t_bar_row": "chest-supported T-bar frame not built yet",
    "smith_machine_deadlift": "Smith frame for a standing lift not built yet",
    "smith_machine_good_morning": "Smith frame for a standing lift not built yet",
    "reverse_hack_squat": "hack-squat sled not built yet", "belt_squat": "belt-squat machine and hip belt not built yet",
    "glute_kickback_machine": "kickback machine (chest pad + foot plate) not built yet",
    "rotary_torso_machine": "rotary torso machine not built yet",
    # barbell keys that need more than a straight bar (13 Nov 2026)
    "meadows_row": "landmine (one bar end fixed to the floor)", "landmine_squat": "landmine",
    "trap_bar_shrug": "trap (hex) bar", "wide_grip_ez_bar_curl": "EZ (cambered) bar",
    "decline_ez_bar_skull_crusher": "EZ bar and decline bench", "barbell_spider_curl": "chest-down incline bench set-up",
    "reverse_preacher_curl": "preacher bench", "reverse_barbell_wrist_curl": "a wrist that bends",
    "behind_the_back_wrist_curl": "a wrist that bends",
    # cable keys that need more than the cable column (13 Nov 2026)
    "cable_preacher_curl": "preacher bench", "single_arm_cable_preacher_curl": "preacher bench",
    "cable_woodchop": "two hands stacked on one handle (the rig has closed fists only; one fist cannot wrap over the other)",
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
