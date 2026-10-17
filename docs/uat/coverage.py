"""UAT coverage numbers, derived from INVENTORY.md (never typed by hand).

Usage: python coverage.py            -> prints the table + the H-risk tasks not on a real screen
       python coverage.py --md       -> the same as a markdown block (for UAT-REPORT-<tag>.md)

Counts every task row "| X-NN | ... | LEVEL | RISK |" in INVENTORY.md. HIDDEN rows are listed
in the inventory but not counted. "On a real screen" = SCREEN or SCREEN-NEW.
"""
import io
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

INV = Path(__file__).with_name("INVENTORY.md")
ROW = re.compile(r"^\|\s*([A-Z]+)-(\d+)\s*\|")
ROLES = {"M": "Member (phone)", "O": "Owner (admin)", "F": "Front desk", "W": "Watch", "X": "Cross-role"}


def rows():
    for line in INV.read_text(encoding="utf-8").splitlines():
        m = ROW.match(line)
        if not m:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        level, risk = cells[-2].strip("* "), cells[-1].strip("* ")
        if level == "HIDDEN":
            continue
        yield m.group(1), f"{m.group(1)}-{m.group(2)}", cells[1], level, risk


def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    per = defaultdict(Counter)
    gaps = []
    for role, tid, task, level, risk in rows():
        per[role][level] += 1
        per[role]["ALL"] += 1
        if risk.startswith("H") and not level.startswith("SCREEN"):
            gaps.append((tid, level, task[:90]))
    md = "--md" in sys.argv
    head = "| Role | Tasks | Real screen | of which new | Logic only | Not covered |"
    lines = [head, "|---|---|---|---|---|---|"] if md else [head]
    tot = Counter()
    for role in ROLES:
        c = per.get(role, Counter())
        if not c:
            continue
        screen = c["SCREEN"] + c["SCREEN-NEW"]
        logic = c["LOGIC"] + c["LOGIC-NEW"]
        tot.update({"ALL": c["ALL"], "screen": screen, "new": c["SCREEN-NEW"], "logic": logic, "none": c["NONE"]})
        lines.append(f"| {ROLES[role]} | {c['ALL']} | {screen} | {c['SCREEN-NEW']} | {logic} | {c['NONE']} |")
    pct = 100 * tot["screen"] / max(tot["ALL"], 1)
    lines.append(f"| **Total** | **{tot['ALL']}** | **{tot['screen']} ({pct:.0f}%)** | {tot['new']} | {tot['logic']} | {tot['none']} |")
    print("\n".join(lines))
    print(f"\nH-risk tasks not on a real screen: {len(gaps)}")
    for g in gaps:
        print(f"- {g[0]} [{g[1]}] {g[2]}")


if __name__ == "__main__":
    main()
