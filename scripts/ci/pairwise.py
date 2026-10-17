"""Pairwise phone-setting matrix (UAT WP14, 17 Oct 2026).

NIST: most field failures need at most two settings to line up, so every PAIR of setting values
is covered once instead of every combination (3x3x2x3x2x2 = 216 phones -> about 10 runs). This
is the PICT idea in a few lines of Python, deterministic (same rows every time), no download.

Each row becomes one partial `qa-device.yml` run: api = the Android version, env = the rest
(font, width, network, time zone, battery saver). A partial run never opens the release gate.

Usage: python3 scripts/ci/pairwise.py            # the rows, one per line, as dispatch inputs
       python3 scripts/ci/pairwise.py --markdown # the table for docs/uat/ENV-MATRIX.md
"""
from __future__ import annotations

import itertools
import sys

# Order matters only for ties; the first value of each is the phone every release is proven on.
FACTORS: dict[str, list[str]] = {
    "api": ["34", "35", "36"],
    "font": ["1.0", "1.3", "2.0"],
    "width": ["411", "360"],
    "net": ["online", "offline", "flaky"],
    "tz": ["utc", "ist"],
    "saver": ["off", "on"],
}


def all_pairs(factors: dict[str, list[str]]) -> set[tuple[str, str, str, str]]:
    out = set()
    for a, b in itertools.combinations(factors, 2):
        for va in factors[a]:
            for vb in factors[b]:
                out.add((a, va, b, vb))
    return out


def pairs_of(row: dict[str, str]) -> set[tuple[str, str, str, str]]:
    return {(a, row[a], b, row[b]) for a, b in itertools.combinations(row, 2)}


def generate(factors: dict[str, list[str]] = FACTORS) -> list[dict[str, str]]:
    """Greedy: each new row is the full combination that covers the most uncovered pairs
    (ties: the earliest in itertools.product order, so the output never changes)."""
    names = list(factors)
    todo = all_pairs(factors)
    rows: list[dict[str, str]] = []
    candidates = [dict(zip(names, vals)) for vals in itertools.product(*(factors[n] for n in names))]
    while todo:
        best = max(candidates, key=lambda r: len(pairs_of(r) & todo))
        gain = pairs_of(best) & todo
        if not gain:  # cannot happen: every pair is in some candidate
            raise RuntimeError("pairwise: no row covers what is left")
        rows.append(best)
        todo -= gain
    return rows


def env_input(row: dict[str, str]) -> str:
    """The qa-device.yml `env` input for a row (everything but the Android version)."""
    return ",".join(f"{k}={v}" for k, v in row.items() if k != "api")


def main(argv: list[str]) -> int:
    rows = generate()
    if "--markdown" in argv:
        print("| # | api | font | width (dp) | network | time zone | battery saver |")
        print("|---|---|---|---|---|---|---|")
        for i, r in enumerate(rows, 1):
            print(f"| E{i} | {r['api']} | {r['font']} | {r['width']} | {r['net']} | {r['tz'].upper()} | {r['saver']} |")
        print(f"\n{len(rows)} runs cover all {len(all_pairs(FACTORS))} pairs (every combination would be "
              f"{len(list(itertools.product(*FACTORS.values())))}).")
    else:
        for r in rows:
            print(f"api={r['api']} env={env_input(r)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
