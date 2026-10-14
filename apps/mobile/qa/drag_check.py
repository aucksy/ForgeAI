"""Part J2 helper: find two routine cards on screen and drag one past the other (15 Oct 2026).

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


def main():
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
