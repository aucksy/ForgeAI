"""Part J2/J3 helper: find two routine cards (J2) or two live-workout exercises (J3) on screen
and drag one past the other (15 Oct 2026).

  python3 drag_check.py order  <dump.xml> <nameA> <nameB>   -> prints "A-first" / "B-first" / "missing"
  python3 drag_check.py drag   <dump.xml> <from> <to>       -> prints "x1 y1 x2 y2" for adb input draganddrop

Cards are found by their Start buttons' accessibility labels ("Start routine <name>"), which sit
inside each card; the drag starts on the dragged card's button and ends just below the other one.
"""
import re
import sys
import xml.etree.ElementTree as ET

BOUNDS = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


def find(path, name):
    for node in ET.parse(path).iter("node"):
        if node.get("content-desc") == f"Start routine {name}" or node.get("text") == f"Start routine {name}":
            m = BOUNDS.match(node.get("bounds", ""))
            if m:
                return tuple(int(v) for v in m.groups())
    return None


SUFFIX = ". Open its history and how-to"


def nodes(path):
    """(content-desc, bounds) of every view in a uiautomator XML dump or a `maestro hierarchy`
    JSON tree (J3's fallback when the ticking workout clock stops uiautomator). [] = no readable file."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            raw = f.read()
    except OSError:
        return []
    start = raw.find("{")
    if start != -1 and "<hierarchy" not in raw:
        import json

        try:
            tree = json.loads(raw[start:])
        except ValueError:
            return []
        out, stack = [], [tree]
        while stack:
            n = stack.pop()
            a = n.get("attributes") or {}
            out.append((a.get("accessibilityText") or a.get("content-desc") or "", a.get("bounds") or ""))
            stack.extend(n.get("children") or [])
        return out
    try:
        return [(n.get("content-desc") or "", n.get("bounds", "")) for n in ET.fromstring(raw).iter("node")]
    except ET.ParseError:
        return []


def exercises(path):
    """J3: the live workout's exercise name rows, top to bottom: [(name, (x1, y1, x2, y2))]."""
    out = []
    for d, bounds in nodes(path):
        m = BOUNDS.match(bounds)
        if d.endswith(SUFFIX) and m:
            out.append((d[: -len(SUFFIX)], tuple(int(v) for v in m.groups())))
    return sorted(out, key=lambda t: t[1][1])


def main():
    if sys.argv[1] == "ex-names":
        # python3 drag_check.py ex-names <dump.xml>  -> the first two names, "|"-joined
        ex = exercises(sys.argv[2])
        print("|".join(n for n, _ in ex[:2]) if len(ex) >= 2 else "missing")
        return
    if sys.argv[1] == "ex-drag":
        # python3 drag_check.py ex-drag <dump.xml>  -> "x1 y1 x2 y2": the 2nd name row to above the 1st
        ex = exercises(sys.argv[2])
        if len(ex) < 2:
            print("missing")
            return
        (_, a), (_, b) = ex[0], ex[1]
        x1, y1 = (b[0] + b[2]) // 2, (b[1] + b[3]) // 2
        print(f"{x1} {y1} {x1} {max(a[1] - 60, 200)}")
        return
    cmd, path, a, b = sys.argv[1:5]
    ba, bb = find(path, a), find(path, b)
    if not ba or not bb:
        print("missing")
        return
    if cmd == "order":
        print("A-first" if ba[1] < bb[1] else "B-first")
        return
    # drag: from the middle of A's button to a little below B's button
    x1, y1 = (ba[0] + ba[2]) // 2, (ba[1] + ba[3]) // 2
    y2 = bb[3] + 40 if ba[1] < bb[1] else bb[1] - 40
    print(f"{x1} {y1} {x1} {y2}")


if __name__ == "__main__":
    main()
