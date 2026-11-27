#!/usr/bin/env python3
"""No Gaps framework card check (owner, 27 Nov 2026: "Yes build this framework").

Every change from R-630 on carries a card: docs/changes/R-<n>.json (template: docs/changes/README.md).
This check refuses:
  push    (ci.yml): a commit in the pushed range whose message names R-<n> (n >= START), changes app files
          (not only docs), and has no card; any card that is malformed; a card marked "done" whose lane gates
          are not all done with evidence, whose G6 proof is only "read the code", or (Full lane) with no design
          note docs/designs/<id>.md.
  release (release-apk.yml, --release): everything above, plus any card still "active" or "waiting" unless it
          is "dark" (shipped behind a switch that is off). A release never ships an unfinished change.

Run: python3 scripts/ci/card_check.py [--base SHA --head SHA] [--release] [--summary FILE]
Self-test: python3 -m unittest discover -s scripts/ci -p 'test_card_check.py'
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

START = 630
GATES = ["G0_family", "G1_design", "G2_goldfish", "G3_tests_first", "G4_build", "G5_review", "G6_proven",
         "G7_delivered"]
LANE_DONE = {
    "full": GATES,
    "standard": [g for g in GATES if g != "G2_goldfish"],
    "light": ["G0_family", "G4_build", "G5_review", "G6_proven", "G7_delivered"],
}
STATUSES = {"active", "waiting", "done", "skipped"}
DOC_ONLY = re.compile(r"^(docs/|PROGRESS|CONTEXT|CLAUDE|README)|\.md$", re.I)
R_ID = re.compile(r"\bR-(\d{3,4})\b")
READ_ONLY_PROOF = re.compile(r"^\s*(code[- ]?read|read (the )?code|by reading)", re.I)


def card_problems(card, root="."):
    """Problems with one card, as plain lines. Empty list = good."""
    out = []
    cid = card.get("id") if isinstance(card, dict) else None
    if not isinstance(card, dict) or not isinstance(cid, str) or not R_ID.fullmatch(cid):
        return [f"card has no valid id like R-630: {cid!r}"]
    lane = card.get("lane")
    if lane not in LANE_DONE:
        out.append(f"{cid}: lane must be full, standard or light, not {lane!r}")
    status = card.get("status")
    if status not in STATUSES:
        out.append(f"{cid}: status must be one of {sorted(STATUSES)}, not {status!r}")
    if not str(card.get("family", "")).strip():
        out.append(f"{cid}: family (the cause) is empty")
    gates = card.get("gates")
    if not isinstance(gates, dict) or any(not isinstance(gates.get(g), dict) for g in GATES):
        out.append(f"{cid}: gates must hold all of {', '.join(GATES)}")
        return out
    if lane == "full" and status in ("active", "done") and not str(card.get("approved_by", "")).strip():
        out.append(f"{cid}: Full lane needs approved_by (the owner's words and date)")
    if status == "done" and lane in LANE_DONE:
        for g in LANE_DONE[lane]:
            st = gates[g]
            if not st.get("done") or not str(st.get("evidence", "")).strip():
                out.append(f"{cid}: marked done but {g} is not done with evidence")
        if READ_ONLY_PROOF.search(str(gates["G6_proven"].get("evidence", ""))):
            out.append(f"{cid}: G6 proof is only code reading; it needs a test run, UAT run or real check")
        if lane == "full" and not os.path.isfile(os.path.join(root, "docs", "designs", cid + ".md")):
            out.append(f"{cid}: Full lane is done but docs/designs/{cid}.md does not exist")
    return out


def load_cards(root="."):
    cards, problems = {}, []
    for p in sorted(glob.glob(os.path.join(root, "docs", "changes", "R-*.json"))):
        try:
            with open(p, encoding="utf-8") as f:
                c = json.load(f)
        except Exception as e:
            problems.append(f"{os.path.basename(p)}: not valid JSON ({e})")
            continue
        name = os.path.splitext(os.path.basename(p))[0]
        if isinstance(c, dict) and c.get("id") != name:
            problems.append(f"{name}.json: id inside is {c.get('id')!r}, must be {name!r}")
        problems += card_problems(c, root)
        cards[name] = c
    return cards, problems


def commits_needing_cards(commits, cards):
    """commits: [(sha, message, [files])]. Returns problem lines for commits that name a new R-id with no card."""
    out = []
    for sha, msg, files in commits:
        app_files = [f for f in files if not DOC_ONLY.search(f)]
        if not app_files:
            continue
        for n in sorted({int(x) for x in R_ID.findall(msg or "")}):
            if n >= START and f"R-{n}" not in cards:
                out.append(f"commit {sha[:8]} names R-{n} and changes {len(app_files)} app file(s) "
                           f"(e.g. {app_files[0]}) but docs/changes/R-{n}.json does not exist")
    return out


def release_problems(cards):
    return [f"{cid}: still {c.get('status')}; finish it, mark it dark (behind a switch that is off) or skipped"
            for cid, c in sorted(cards.items())
            if isinstance(c, dict) and c.get("status") in ("active", "waiting") and not c.get("dark")]


def git_commits(base, head):
    try:
        shas = subprocess.run(["git", "rev-list", f"{base}..{head}"], capture_output=True, text=True,
                              check=True).stdout.split()
    except Exception:
        shas = [head]
    out = []
    for s in shas[:300]:
        msg = subprocess.run(["git", "log", "-1", "--format=%B", s], capture_output=True, text=True).stdout
        files = subprocess.run(["git", "show", "--name-only", "--format=", s], capture_output=True,
                               text=True).stdout.split()
        out.append((s, msg, files))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--release", action="store_true")
    ap.add_argument("--summary")
    a = ap.parse_args(argv)
    cards, problems = load_cards(".")
    if a.base:
        problems += commits_needing_cards(git_commits(a.base, a.head), cards)
    if a.release:
        problems += release_problems(cards)
    open_cards = [c for c in cards.values() if isinstance(c, dict) and c.get("status") in ("active", "waiting")]
    lines = [f"No Gaps card check: {len(cards)} card(s), {len(open_cards)} open, {len(problems)} problem(s)."]
    lines += [f"- {p}" for p in problems]
    print("\n".join(lines))
    if a.summary:
        with open(a.summary, "a", encoding="utf-8") as f:
            f.write("### No Gaps card check\n\n" + "\n".join(lines) + "\n")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
