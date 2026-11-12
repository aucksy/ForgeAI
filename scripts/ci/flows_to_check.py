#!/usr/bin/env python3
"""Flows to check (12 Nov 2026, owner rule "update every test the change touches").

0.77.0 lost rounds to test scripts that were out of date with a change. The rule said "grep every test
script for the screen's testIDs, words and route" — by hand, and by WORDS only. Two of the misses changed
no word at all: the update screen pinned "Update now" / "Later" to the bottom (same words, new place), and
the flows that show that screen were not rerun (r336, f199). This script does the grep for every commit,
by words AND by screen:

  1. changed words: strings, JSX text and testIDs added or removed in the diff of each app file;
  2. screen words: every string and testID in a changed app file (a layout change moves them all);
  3. routes: an app file under src/app/ is a page; flows that open its deep link use it;
  4. changed phone-test files: the flow itself, and every flow that runs a changed sub-flow.

It prints the flows and Playwright specs that use any of them, the phone-test PARTS those flows belong to
(read from run-device-qa.sh / uat-wp4b.sh, so a new part is known the day it is added), and the `only`
list to run them first (qa-device.yml `only=affected` does this by itself).

Usage:
  flows_to_check.py [--base SHA] [--head SHA]        report on base..head (default HEAD~1..HEAD)
       --base green:<profile>                         base = newest ancestor with a green whole phone run
                                                      of that profile (default|owner; needs GITHUB_TOKEN)
       --summary FILE                                 also write the report as Markdown (job summary)
       --parts                                        print only the `only` list (one line; empty = none)
       --files a b c                                  use these changed files instead of git (tests)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flow_scroll_lint as L  # noqa: E402  (the same word reader as the scroll lint)

ROOT = L.ROOT
QA = L.QA
RUNNERS = [QA / "run-device-qa.sh", QA / "uat-wp4b.sh"]
SPECS = [ROOT / "apps" / "dashboard" / "e2e", ROOT / "apps" / "dashboard" / "e2e-live"]
APP_DIRS = ("apps/mobile/src/",)
PANEL_DIRS = ("apps/dashboard/src/",)
# A changed file whose words reach more than this share of all flows is "broad" (a shared word list, the
# tab bar): it is named, but its flows are not listed one by one; run the whole round for it.
BROAD = 0.35
# Parts of the A..R chain that run alone (only=<part>) from a fresh install; every other chain part leans on
# the parts before it (forgeai-qa-lessons trap 27: A..H alone, I..R only after them).
CHAIN = "a b c d e f g h h3 p1 p2 i link i2 j j2 j3 k l n p9 r".split()
ALONE = set("a c d e f g p1 p2".split())


def git(*args) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                          errors="replace").stdout


# ------------------------------------------------------------------ which part runs which flow

def part_map() -> dict[str, set[str]]:
    """flow file -> the parts that run it (directly or through a sub-flow)."""
    text = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in RUNNERS if p.is_file())
    lines = text.splitlines()
    funcs: dict[str, list[str]] = {}
    top: list[tuple[str | None, str]] = []  # (part or None, line) outside functions
    cur_fn, cur_part = None, None
    for ln in lines:
        m = re.match(r"^(\w+)\(\)\s*\{(.*)$", ln)
        if m and cur_fn is None:
            cur_fn = m.group(1)
            funcs[cur_fn] = [m.group(2)]
            if m.group(2).rstrip().endswith("}"):
                cur_fn = None
            continue
        if cur_fn is not None:
            if re.match(r"^\}", ln):
                cur_fn = None
            else:
                funcs[cur_fn].append(ln)
            continue
        m = re.match(r"^if qa_runs (\w+)", ln)
        if m:
            cur_part = m.group(1)
            top.append((cur_part, ln))
            continue
        if re.match(r"^fi\b", ln):
            cur_part = None
            continue
        m = re.match(r"^\s*(?:if\s+)?qa_runs (\w+)", ln)
        top.append((m.group(1) if m and cur_part is None else cur_part, ln))
    yaml_ref = re.compile(r"([A-Za-z0-9_.-]+\.yaml)")

    def flows_of(body: list[str], seen: set[str]) -> set[str]:
        out = set()
        for ln in body:
            if ln.lstrip().startswith("#"):
                continue
            out |= set(yaml_ref.findall(ln))
            for name in re.findall(r"\b(\w+)\b", ln):
                if name in funcs and name not in seen:
                    seen.add(name)
                    out |= flows_of(funcs[name], seen)
        return out

    by_flow: dict[str, set[str]] = {}
    for part, ln in top:
        if not part:
            continue
        for f in flows_of([ln], set()):
            by_flow.setdefault(f, set()).add(part)
    # A part's whole if-block (top-level lines between `if qa_runs X` and `fi`).
    block: dict[str, list[str]] = {}
    for part, ln in top:
        if part:
            block.setdefault(part, []).append(ln)
    for part, body in block.items():
        for f in flows_of(body, set()):
            by_flow.setdefault(f, set()).add(part)
    # Sub-flows: a flow covers every sub-flow it runs.
    for f in list(by_flow):
        for sub in sub_flows(f):
            by_flow.setdefault(sub, set()).update(by_flow[f])
    return {f: p for f, p in by_flow.items() if (QA / f).is_file()}


_subs: dict[str, set[str]] = {}


def sub_flows(flow: str, depth: int = 0) -> set[str]:
    if flow in _subs:
        return _subs[flow]
    p = QA / flow
    out: set[str] = set()
    if p.is_file() and depth < 6:
        for m in re.finditer(r"(?:file:|runFlow:)\s*['\"]?([A-Za-z0-9_.-]+\.yaml)", p.read_text(encoding="utf-8")):
            out.add(m.group(1))
            out |= sub_flows(m.group(1), depth + 1)
    _subs[flow] = out
    return out


def callers_of(sub: str) -> set[str]:
    return {p.name for p in QA.glob("*.yaml") if sub in sub_flows(p.name)}


def flows_reached(files: list[str]) -> dict[str, str]:
    """flow -> why, for the changed phone-test flows: each itself and every flow that runs it as a sub-flow.
    Needs no pyyaml (the release gate, scripts/ci/phone_gate.py, calls it)."""
    out: dict[str, str] = {}
    for path in files:
        if not (path.startswith("apps/mobile/qa/") and path.endswith(".yaml")):
            continue
        name = path.rsplit("/", 1)[-1]
        if name == L.SCREENS.name:
            continue
        if (QA / name).is_file():
            out.setdefault(name, "changed itself")
        for c in sorted(callers_of(name)):
            out.setdefault(c, f"runs the changed sub-flow {name}")
    return out


# ------------------------------------------------------------------ what changed

def changed_files(base: str, head: str) -> list[str]:
    return [l for l in git("diff", "--name-only", f"{base}..{head}").splitlines() if l.strip()]


def diff_words(base: str, head: str, path: str) -> tuple[set[str], set[str]]:
    """(changed words, changed testIDs) of one file: in removed lines and not added back, or the reverse."""
    diff = git("diff", "-U0", f"{base}..{head}", "--", path)
    minus = "\n".join(l[1:] for l in diff.splitlines() if l.startswith("-") and not l.startswith("---"))
    plus = "\n".join(l[1:] for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))

    return (L.words_in(minus) ^ L.words_in(plus)), (L.ids_in(minus) ^ L.ids_in(plus))


def route_of(path: str) -> str | None:
    if not path.startswith("apps/mobile/src/app/") or not path.endswith(".tsx"):
        return None
    r = path[len("apps/mobile/src/app/"):-4]
    r = re.sub(r"\([^)]*\)/", "", r)
    r = re.sub(r"/?index$", "", r)
    if "[" in r or r.startswith("_") or not r:
        return None
    return r


# ------------------------------------------------------------------ which flows use them

def flow_strings(path: Path) -> list[str]:
    """Every selector text, FIND value and copyTextFrom target in a flow (and the raw text for ids/links)."""
    import yaml
    out = []
    try:
        docs = list(yaml.safe_load_all(path.read_text(encoding="utf-8")))
    except Exception:  # quiet: an unparsable flow is the CI parse step's job; its raw text is still searched
        return out

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ("text", "visible", "notVisible", "element", "FIND", "assertVisible", "assertNotVisible",
                         "tapOn", "copyTextFrom", "longPressOn", "doubleTapOn") and isinstance(v, str):
                    out.append(v)
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    for d in docs:
        walk(d)
    return out


def matches(target: str, words: set[str], lower: dict[str, str], loose: bool = False) -> str | None:
    """The app word a flow target stands for, or None (same rules as the scroll lint)."""
    if "${" in target:
        return None
    c = L.core(target)
    if c is not None:
        cl = c.lower().strip()
        if len(cl) < 3:
            return None
        if cl in lower:
            return lower[cl]
        if loose and len(cl) >= 12:
            for w in lower:
                if cl in w:
                    return lower[w]
        return None
    if L.too_loose(target):
        return None
    try:
        rx = re.compile(target.replace("(?i)", ""), re.I if "(?i)" in target else 0)
    except re.error:
        return None
    for w in words:
        if rx.fullmatch(w):
            return w
    return None


def report(base: str, head: str, files: list[str] | None = None) -> dict:
    files = files if files is not None else changed_files(base, head)
    flows = sorted(p for p in QA.glob("*.yaml") if p.name != L.SCREENS.name)
    fstr = {p.name: flow_strings(p) for p in flows}
    fraw = {p.name: p.read_text(encoding="utf-8", errors="replace") for p in flows}
    hits: dict[str, list[str]] = {}  # flow -> reasons
    broad: list[str] = []
    seen_files = []

    def add(flow, why):
        hits.setdefault(flow, [])
        if why not in hits[flow]:
            hits[flow].append(why)

    for path in files:
        full = ROOT / path
        if path.startswith("apps/mobile/qa/") and path.endswith(".yaml"):
            if path.rsplit("/", 1)[-1] == L.SCREENS.name:
                continue
            for f, why in flows_reached([path]).items():
                add(f, why)
            seen_files.append(path)
            continue
        if not path.startswith(APP_DIRS + PANEL_DIRS) or not path.endswith((".ts", ".tsx")):
            continue
        seen_files.append(path)
        cw, ci = diff_words(base, head, path) if base else (set(), set())
        sw = L.words_of(full) if full.is_file() else set()
        si = L.ids_of(full) if full.is_file() else set()
        route = route_of(path)
        short = path.split("/src/", 1)[-1]
        found: dict[str, str] = {}
        for tier, words, ids in (("changed", cw, ci), ("screen", sw, si)):
            lower = {w.lower(): w for w in words}
            for name, targets in fstr.items():
                if name in found and found[name].startswith("changed"):
                    continue
                for t in targets:
                    w = matches(t, words, lower, loose=tier == "changed")
                    if w:
                        found.setdefault(name, f"{tier} word '{w}' in {short}")
                        break
                else:
                    for i in ids:
                        if re.search(r"""id:\s*['"]%s['"]""" % re.escape(i), fraw[name]):
                            found.setdefault(name, f"{tier} testID '{i}' in {short}")
                            break
        if route:
            for name, raw in fraw.items():
                if re.search(r"mettleup://%s\b" % re.escape(route), raw):
                    found.setdefault(name, f"opens the page {route} ({short})")
        screen_only = [n for n, why in found.items() if why.startswith("screen")]
        if len(screen_only) > BROAD * len(flows):
            broad.append(f"{short} (its words are in {len(screen_only)} flows)")
            found = {n: w for n, w in found.items() if not w.startswith("screen")}
        for n, why in found.items():
            add(n, why)
    # Specs: Playwright for the admin app (words of changed panel files) and the journeys.
    specs: dict[str, str] = {}
    panel_words = set()
    for path in files:
        if path.startswith(PANEL_DIRS) and (ROOT / path).is_file():
            panel_words |= {w for w in L.words_of(ROOT / path) if len(w) >= 6}
    if panel_words:
        for d in SPECS:
            for p in sorted(d.rglob("*.ts")) if d.is_dir() else []:
                t = p.read_text(encoding="utf-8", errors="replace")
                for w in panel_words:
                    if w in t:
                        specs[L.rel(p)] = w
                        break
    pmap = part_map()
    parts = pick_parts(hits, pmap)
    return {"base": base, "head": head, "files": seen_files, "flows": hits, "broad": broad, "specs": specs,
            "parts": parts, "unmapped": sorted(f for f in hits if f not in pmap and not f.startswith(("xc-", "xj-")))}


def pick_parts(hits: dict, pmap: dict[str, set[str]]) -> list[str]:
    """The smallest set of parts that runs every hit flow: per flow its most specific part (the one
    running the fewest flows), chain parts with what they lean on."""
    size: dict[str, int] = {}
    for f, ps in pmap.items():
        for p in ps:
            size[p] = size.get(p, 0) + 1
    want: set[str] = set()
    for f in hits:
        ps = pmap.get(f)
        if not ps:
            continue
        want.add(min(ps, key=lambda p: (size.get(p, 0), p)))
    out = set(want)
    for p in want:
        if p in CHAIN and p not in ALONE:
            out |= set(CHAIN[: CHAIN.index(p) + 1])
    order = expected_order()
    return sorted(out, key=lambda p: (order.index(p) if p in order else 999, p))


def expected_order() -> list[str]:
    text = (QA / "run-device-qa.sh").read_text(encoding="utf-8")
    out = []
    for name in ("OLD_PARTS", "UAT_PARTS", "GATE_PARTS"):
        m = re.search(r'^%s="([^"]*)"' % name, text, re.M)
        if m:
            out += m.group(1).split()
    return out


# ------------------------------------------------------------------ base = the last green whole run

def green_base(profile: str, head: str) -> str | None:
    repo, token = os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_TOKEN", "")
    if not repo:
        return None
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from phone_gate import run_kind  # the gate's own reading of a run name
    url = f"https://api.github.com/repos/{repo}/actions/workflows/qa-device.yml/runs?status=success&per_page=100"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                               **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            runs = json.load(r).get("workflow_runs", [])
    except Exception as e:
        print(f"::warning::could not read the phone-test runs ({e}); comparing with HEAD~1", file=sys.stderr)
        return None
    for r in runs:
        if r.get("conclusion") != "success" or run_kind(r.get("display_title")) != profile:
            continue
        sha = r.get("head_sha")
        if subprocess.run(["git", "merge-base", "--is-ancestor", sha, head], cwd=ROOT).returncode == 0:
            return sha
    return None


def markdown(rep: dict) -> str:
    out = [f"## Flows to check ({rep['base'][:10]}..{rep['head'][:10]})", ""]
    if not rep["files"]:
        out.append("No app or phone-test file changed: no flow to check.")
        return "\n".join(out) + "\n"
    out.append(f"Changed app / phone-test files: {len(rep['files'])}. Flows that use what changed: "
               f"**{len(rep['flows'])}**. Update every one this change breaks, in the same commit (owner rule).")
    if rep["parts"]:
        out.append("")
        out.append(f"Run these parts first (qa-device.yml, both profiles): `only={','.join(rep['parts'])}`")
    if rep["broad"]:
        out.append("")
        out.append("Changed files whose words are on most screens (run the whole round): " + "; ".join(rep["broad"]))
    if rep["flows"]:
        out.append("")
        out.append("| Flow | Why |")
        out.append("|---|---|")
        for f, why in sorted(rep["flows"].items()):
            out.append(f"| {f} | {'; '.join(why[:3])} |")
    if rep["unmapped"]:
        out.append("")
        out.append("Flows no part runs (check by hand): " + ", ".join(rep["unmapped"]))
    if rep["specs"]:
        out.append("")
        out.append("Playwright specs that use words of a changed admin-app file:")
        for s, w in sorted(rep["specs"].items()):
            out.append(f"- {s} ('{w}')")
    return "\n".join(out) + "\n"


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # quiet: an old Python without reconfigure prints as before
        pass
    args = argv[1:]

    def opt(name, default=None):
        if name in args:
            i = args.index(name)
            return args[i + 1] if i + 1 < len(args) else default
        return default

    head = opt("--head", "HEAD")
    head = git("rev-parse", head).strip() or head
    base = opt("--base")
    files = None
    if "--files" in args:
        files = args[args.index("--files") + 1:]
        base = base or ""
    elif base and base.startswith("green:"):
        found = green_base(base.split(":", 1)[1], head)
        base = found or git("rev-parse", f"{head}~1").strip()
    elif not base or set(base) == {"0"}:
        base = git("rev-parse", f"{head}~1").strip()
    rep = report(base, head, files)
    if "--parts" in args:
        print(",".join(rep["parts"]))
        return 0
    md = markdown(rep)
    print(md)
    summ = opt("--summary")
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(md)
    if rep["flows"]:
        print(f"::warning::{len(rep['flows'])} phone-test flows use what this push changed: "
              f"run only={','.join(rep['parts']) or '(see summary)'} first (see the job summary)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
