#!/usr/bin/env python3
"""Phone-test scroll lint (12 Nov 2026, after the 0.77.0 gate rounds).

Why: a Maestro `assertVisible` / `extendedWaitUntil` / `tapOn` never scrolls (trap 7). On a page that
scrolls, what a flow checks can sit just below the bottom edge (his phone: 360 dp, font 1.3) or just
above the top edge (Back from a share menu leaves the page where it was: UATF61, 0.77.0 round 5). A
check like that passes for weeks and then fails a 4-hour round. The fix is a scroll before the check,
through one shared sub-flow:

    - runFlow:
        file: sub-see.yaml          # look down, then up, then assert (no scroll when already in view)
        env:
          FIND: "Share to an AI app"

(sub-find.yaml does the same, centred, before a tap.)

What this checks: every Maestro command in apps/mobile/qa/*.yaml that asserts, waits for or taps a TEXT
or an id that the app shows on a page that SCROLLS. The scrolling pages are listed in one file,
apps/mobile/qa/scrollable-screens.yaml, which this script writes from the app's own code
(`--write-screens`; CI fails when it is out of date, so a new page is listed the day it is added). A
text "is on a scrolling page" when it is one of the strings or testIDs in that page's code (the route
file and what it imports, two levels deep).

A check is fine when:
  - it goes through sub-see / sub-find (or the journeys' xc-/xj-sub-find) with FIND = its target, or
    the command just before it is a scrollUntilVisible of the same target;
  - it says on purpose that the thing must be in view WITHOUT scrolling: a comment line
    `# in-view: <reason>` right above it (a pinned button, a pop-up, the top of a page just opened);
  - its target is in the file's `pinned:` list (the tab bar, pinned buttons, Android's own dialogs).

Existing flows are counted per file in scripts/ci/flow-scroll-baseline.json: a count may only go DOWN.
A new flow, or a new bare check in an old one, fails CI with the file, line and the fix. Only checks and
waits (GATED) count; a bare tap is listed as a warning (a tap that misses fails at once, on the line that
names it, while a check after Back passes or fails depending on where the page was left).

Usage:
  flow_scroll_lint.py                 check (CI); exit 1 on a new bare check or a stale screens file
  flow_scroll_lint.py --list [FLOW]   every bare check, with line numbers
  flow_scroll_lint.py --update        write the lower counts into the baseline
  flow_scroll_lint.py --write-screens regenerate apps/mobile/qa/scrollable-screens.yaml (keeps `pinned:`)
  flow_scroll_lint.py --fix FLOW...   rewrite the plain bare assert/wait checks in these flows to the helper
  flow_scroll_lint.py --fix --taps FLOW...   then the plain bare taps (the helper goes before the tap)
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # the release gate imports flows_to_check (which imports this) without pyyaml; it reads no yaml
    yaml = None

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "apps" / "mobile" / "qa"
SRC = ROOT / "apps" / "mobile" / "src"
APP = SRC / "app"
SCREENS = QA / "scrollable-screens.yaml"
BASELINE = Path(__file__).with_name("flow-scroll-baseline.json")

HELPERS = ("sub-see.yaml", "sub-find.yaml", "xc-sub-find.yaml", "xj-sub-find.yaml")
CHECKS = ("assertVisible", "tapOn", "extendedWaitUntil", "doubleTapOn", "longPressOn")
GATED = ("assertVisible", "extendedWaitUntil")
SCROLLS = re.compile(r"\b(ScrollView|FlatList|SectionList|FlashList|KeyboardAwareScrollView)\b")
# Files whose words are everywhere and say nothing about one page.
SKIP_DIRS = ("components/ui/", "theme/", "db/", "engine/")
DEPTH = 2

# ------------------------------------------------------------------ the app side: pages and their words

IMPORT = re.compile(r"""(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)""")


def resolve(spec: str, here: Path) -> Path | None:
    if spec.startswith("@/"):
        base = SRC / spec[2:]
    elif spec.startswith("."):
        base = (here.parent / spec).resolve()
    else:
        return None
    for cand in (base, Path(str(base) + ".tsx"), Path(str(base) + ".ts"), base / "index.tsx", base / "index.ts"):
        if cand.is_file():
            return cand
    return None


def rel(p: Path) -> str:
    return p.resolve().relative_to(ROOT).as_posix()


_text_cache: dict[Path, str] = {}


def text_of(p: Path) -> str:
    if p not in _text_cache:
        _text_cache[p] = p.read_text(encoding="utf-8", errors="replace")
    return _text_cache[p]


def reached(route: Path, depth: int = DEPTH) -> list[Path]:
    """The route file and the app files it imports, `depth` levels deep (never the shared ui kit)."""
    seen, frontier = [route], [route]
    for _ in range(depth):
        nxt = []
        for f in frontier:
            for m in IMPORT.finditer(text_of(f)):
                p = resolve(m.group(1) or m.group(2), f)
                if p is None or p in seen or p.suffix not in (".ts", ".tsx"):
                    continue
                try:
                    p.resolve().relative_to(SRC.resolve())
                except ValueError:
                    continue
                r = p.resolve().relative_to(SRC.resolve()).as_posix()
                if r.startswith(SKIP_DIRS):
                    continue
                seen.append(p)
                nxt.append(p)
        frontier = nxt
    return seen


def scrolls(files: list[Path]) -> bool:
    for f in files:
        t = text_of(f)
        if SCROLLS.search(t):
            return True
        if re.search(r"<Screen\b", t) and "scroll={false}" not in t:
            return True
    return False


STR = re.compile(r"""'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`""", re.S)
JSX_TEXT = re.compile(r">\s*([^<>{}\n][^<>{}]*?)\s*<")
TESTID = re.compile(r"""testID=\{?\s*['"`]([^'"`$]+)['"`]""")


def words_of(f: Path) -> set[str]:
    """Every string, template piece and JSX text in an app file that looks like words on screen."""
    return words_in(text_of(f))


def words_in(t: str) -> set[str]:
    t = re.sub(r"^\s*(import|export)\s.*?from\s+['\"][^'\"]+['\"];?", "", t, flags=re.M)
    out = set()
    for m in STR.finditer(t):
        s = m.group(1) if m.group(1) is not None else m.group(2) if m.group(2) is not None else m.group(3)
        for piece in re.split(r"\$\{[^}]*\}", s or ""):
            piece = piece.replace("\\'", "'").replace('\\"', '"').strip()
            if looks_like_words(piece):
                out.add(piece)
    for m in JSX_TEXT.finditer(t):
        piece = " ".join(m.group(1).split())
        if looks_like_words(piece):
            out.add(piece)
    return out


def looks_like_words(s: str) -> bool:
    if len(s) < 3 or not re.search(r"[A-Za-z]{2}", s):
        return False
    if re.fullmatch(r"[a-z0-9_.\-/:@#]+", s) or re.search(r"[{};=]|=>|\(\)", s):
        return False  # code, keys, paths, imports
    return True


def ids_of(f: Path) -> set[str]:
    return set(TESTID.findall(text_of(f)))


def ids_in(t: str) -> set[str]:
    return set(TESTID.findall(t))


def route_files() -> list[Path]:
    out = []
    for p in sorted(APP.rglob("*.tsx")):
        name = p.name
        if name.startswith("_layout") or name.startswith("+") or p.parent.name == "app" and name.startswith("qa-"):
            continue
        out.append(p)
    return out


def load_screens_file() -> dict:
    if not SCREENS.is_file():
        return {}
    return yaml.safe_load(SCREENS.read_text(encoding="utf-8")) or {}


def computed_screens(hand: dict) -> list[dict]:
    rows = []
    for r in route_files():
        files = reached(r)
        rows.append({"route": rel(r), "scrolls": scrolls(files)})
    for extra in hand.get("overlays") or []:
        p = ROOT / extra
        if p.is_file():
            rows.append({"route": extra, "scrolls": scrolls(reached(p, 1))})
    return rows


def write_screens(hand: dict) -> str:
    rows = computed_screens(hand)
    lines = [
        "# Pages of the member app that SCROLL, and so can hide what a phone-test flow checks (trap 7).",
        "# Read by scripts/ci/flow_scroll_lint.py. The `screens:` list is WRITTEN by that script from the app's",
        "# code (python3 scripts/ci/flow_scroll_lint.py --write-screens); CI fails when it is out of date.",
        "# Edit only `overlays:` (full-screen pop-ups drawn by a layout, not a route) and `pinned:` (texts that",
        "# never scroll away: the tab bar, buttons pinned to the bottom, Android's own dialogs).",
        "",
        "overlays:",
    ]
    for o in hand.get("overlays") or []:
        lines.append(f"  - {o}")
    lines.append("")
    lines.append("pinned:")
    for p in hand.get("pinned") or []:
        lines.append("  - " + json.dumps(p, ensure_ascii=False))
    lines.append("")
    lines.append("screens:")
    for row in rows:
        lines.append(f"  - {{route: \"{row['route']}\", scrolls: {'true' if row['scrolls'] else 'false'}}}")
    return "\n".join(lines) + "\n"


def scrolling_words(conf: dict) -> tuple[set[str], set[str]]:
    words, ids = set(), set()
    for row in conf.get("screens") or []:
        if not row.get("scrolls"):
            continue
        p = ROOT / row["route"]
        if not p.is_file():
            continue
        depth = 1 if row["route"] in (conf.get("overlays") or []) else DEPTH
        for f in reached(p, depth):
            words |= words_of(f)
            ids |= ids_of(f)
    return words, ids


# ------------------------------------------------------------------ the flow side

def target_of(name: str, val):
    """(kind, target, plain) of a check command: kind 'text' | 'id', plain = the one-string form."""
    if name == "extendedWaitUntil":
        if not isinstance(val, dict) or "visible" not in val:
            return None
        val = val["visible"]
        if isinstance(val, str):
            return ("text", val, True)
    if isinstance(val, str):
        return ("text", val, True)
    if isinstance(val, dict):
        if "text" in val and isinstance(val["text"], str):
            return ("text", val["text"], False)
        if "id" in val and isinstance(val["id"], str):
            return ("id", val["id"], False)
    return None


LITERAL = re.compile(r"^\^?((?:[^\\.*+?()\[\]{}|^$]|\\[.?()\[\]*+])+)\$?$")


def core(t: str) -> str | None:
    """The plain words of a target with no real regex in it ('^Ask an AI$' -> 'Ask an AI')."""
    t2 = re.sub(r"^\(\?i\)", "", t)
    m = LITERAL.match(t2)
    if not m:
        return None
    return re.sub(r"\\(.)", r"\1", m.group(1))


def on_scrolling_page(kind: str, t: str, words: set[str], ids: set[str], lower: dict) -> bool:
    if "${" in t:
        return False  # a value the flow fills in at run time (a sub-flow's FIND, a gym name)
    if kind == "id":
        return t in ids
    c = core(t)
    if c is not None:
        cl = c.lower().strip()
        if len(cl) < 3:
            return False
        if cl in lower:
            return True
        return len(cl) >= 12 and any(cl in w for w in lower if len(w) >= len(cl))
    if too_loose(t):
        return False
    try:
        rx = re.compile(t.replace("(?i)", ""), re.I if "(?i)" in t else 0)
    except re.error:
        return False
    return any(rx.fullmatch(w) for w in words)


def too_loose(t: str) -> bool:
    """A 'contains' regex ('(?i).*(recent|downloads|files).*') matches half the app's sentences: it says
    nothing about which page a flow is on (it is usually Android's own file picker)."""
    body = re.sub(r"^\(\?i\)", "", t)
    if not body.startswith(".*"):
        return False
    runs = re.findall(r"[A-Za-z][A-Za-z ,']+", body)
    return max((len(r) for r in runs), default=0) < 15


def pinned_match(t: str, pinned: list[str]) -> bool:
    return t in pinned or (core(t) or "\0") in pinned


class Finding:
    def __init__(self, flow: str, line: int, cmd: str, target: str, plain: bool, block_end: int, indent: int):
        self.flow, self.line, self.cmd, self.target, self.plain = flow, line, cmd, target, plain
        self.block_end, self.indent = block_end, indent

    def text(self) -> str:
        return f"{self.flow}:{self.line}: bare {self.cmd} of '{self.target}' on a page that scrolls"


def scroll_target(cmd_name: str, val):
    if cmd_name == "scrollUntilVisible" and isinstance(val, dict):
        el = val.get("element")
        if isinstance(el, str):
            return el
        if isinstance(el, dict):
            return el.get("text") or el.get("id")
    if cmd_name == "runFlow" and isinstance(val, dict) and str(val.get("file", "")).endswith(HELPERS):
        env = val.get("env") or {}
        return env.get("FIND")
    return None


BROKEN: dict[str, str] = {}  # flow -> why it does not parse (filled by flow_findings)


def flow_findings(path: Path, words, ids, lower, pinned) -> list[Finding]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    out: list[Finding] = []
    try:
        docs = list(yaml.compose_all(text))
    except yaml.YAMLError as e:
        # A flow Maestro cannot read fails its whole part at once ("Parsing Failed"), after the build and
        # every part before it: run 43205679411 lost a 73-minute piece to one "\." in a double-quoted line.
        mark = getattr(e, "problem_mark", None)
        BROKEN[path.name] = f"line {mark.line + 1}: " if mark else ""
        BROKEN[path.name] += " ".join(str(e).split())[:160]
        return out
    if len(docs) < 2:
        return out
    commands = docs[-1]

    def marked(line_no: int) -> bool:
        i = line_no - 1
        if "# in-view" in lines[i]:
            return True
        j = i - 1
        while j >= 0 and lines[j].strip().startswith("#"):
            if lines[j].strip().startswith("# in-view"):
                return True
            j -= 1
        return False

    def walk(seq):
        if not isinstance(seq, yaml.SequenceNode):
            return
        prev = None
        for item in seq.value:
            if not isinstance(item, yaml.MappingNode) and not isinstance(item, yaml.ScalarNode):
                prev = None
                continue
            if isinstance(item, yaml.ScalarNode):
                prev = None
                continue
            for k, v in item.value:
                name = k.value
                val = yaml.safe_load(yaml.serialize(v)) if not isinstance(v, yaml.ScalarNode) else v.value
                if name in ("runFlow", "repeat", "retry") and isinstance(v, yaml.MappingNode):
                    for kk, vv in v.value:
                        if kk.value == "commands":
                            walk(vv)
                # An optional wait proves nothing by itself (the check after it does; --fix writes it so).
                optional = isinstance(val, dict) and val.get("optional") is True and name == "extendedWaitUntil"
                if name in CHECKS and not optional:
                    tg = target_of(name, val)
                    if tg:
                        kind, t, plain = tg
                        line = item.start_mark.line + 1
                        if (on_scrolling_page(kind, t, words, ids, lower) and not pinned_match(t, pinned)
                                and prev != t and not marked(line)):
                            out.append(Finding(path.name, line, name, t, plain and kind == "text",
                                               item.end_mark.line, item.start_mark.column))
                prev = scroll_target(name, val)
                if name in ("takeScreenshot",):
                    pass

    walk(commands)
    return out


def all_findings(conf=None):
    conf = conf if conf is not None else load_screens_file()
    words, ids = scrolling_words(conf)
    lower = {w.lower(): w for w in words}
    pinned = [str(p) for p in conf.get("pinned") or []]
    per: dict[str, list[Finding]] = {}
    for p in sorted(QA.glob("*.yaml")):
        if p.name == SCREENS.name:
            continue
        per[p.name] = flow_findings(p, words, ids, lower, pinned)
    return per


# ------------------------------------------------------------------ the rewrite (--fix)

TRANSIENT = re.compile(r"(?i)ing\b|saved|copied|removed|record|undo|\.\.\.|\u2026|sent\b|done|added|deleted")


def fix_flow(path: Path, findings: list[Finding], kinds=("assertVisible", "extendedWaitUntil", "tapOn")) -> int:
    """Rewrite plain bare checks to the helper. An assertVisible becomes the helper; an extendedWaitUntil
    keeps its wait (now optional: the helper right after it proves the thing is there); a tapOn gets the
    helper before it. Nothing moves while the thing is already in view: the helper scrolls only when it
    is not, so a flow that passed before does exactly the same steps."""
    raw = path.read_bytes().decode("utf-8")
    eol = chr(13) + chr(10) if chr(13) + chr(10) in raw else chr(10)
    lines = raw.splitlines(keepends=True)
    n = 0
    for f in sorted(findings, key=lambda f: -f.line):
        if not f.plain or f.cmd not in kinds:
            continue
        i = f.line - 1
        ind = " " * max(f.indent - 2, 0)
        q = "'" + f.target.replace("'", "''") + "'"
        helper = [f"{ind}- runFlow:{eol}", f"{ind}    file: sub-see.yaml{eol}", f"{ind}    env:{eol}",
                  f"{ind}      FIND: {q}{eol}"]
        end = f.block_end
        while end > i + 1 and (not lines[end - 1].strip() or lines[end - 1].strip().startswith("#")):
            end -= 1
        block = lines[i:end]
        if not block[0].lstrip().startswith("- " + f.cmd):
            continue
        if f.cmd == "assertVisible" and len(block) == 1:
            lines[i:end] = helper
        elif f.cmd == "extendedWaitUntil":
            if any(b.strip().startswith(("optional:", "notVisible:")) for b in block) or len(block) < 2:
                continue
            m = re.search(r"timeout:\s*(\d+)", "".join(block))
            # A short wait is for a pop-up or a toast; a word like "Saving" or "Copied" is a message that goes
            # away again. Checking it a second time after the wait could miss it, so those stay as they are.
            if not m or int(m.group(1)) < 15000 or TRANSIENT.search(f.target):
                continue
            sub = " " * (f.indent + 2)
            lines[i:end] = block + [f"{sub}optional: true{eol}"] + helper
        elif f.cmd == "tapOn" and len(block) == 1:
            lines[i:i] = helper
        else:
            continue
        n += 1
    path.write_bytes("".join(lines).encode("utf-8"))
    return n


# ------------------------------------------------------------------ main

def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # quiet: an old Python without reconfigure prints as before
        pass
    hand = load_screens_file()
    if "--write-screens" in argv:
        SCREENS.write_text(write_screens(hand), encoding="utf-8", newline="\n")
        print(f"wrote {rel(SCREENS)}")
        return 0
    if "--fix" in argv:
        names = [a for a in argv[1:] if not a.startswith("--")]
        kinds = ("tapOn",) if "--taps" in argv else ("assertVisible", "extendedWaitUntil")
        per = all_findings(hand)
        total = 0
        for name in names:
            n = fix_flow(QA / name, per.get(name, []), kinds)
            total += n
            print(f"{name}: {n} rewritten")
        print(f"{total} checks rewritten")
        return 0
    errs = []
    want = write_screens(hand)
    have = SCREENS.read_text(encoding="utf-8") if SCREENS.is_file() else ""
    if want != have:
        errs.append(f"{rel(SCREENS)} is out of date with the app's pages: run "
                    f"python3 scripts/ci/flow_scroll_lint.py --write-screens and commit it")
    per = all_findings(hand)
    if "--list" in argv:
        only = [a for a in argv[1:] if not a.startswith("--")]
        for name, fs in per.items():
            if only and name not in only:
                continue
            for f in fs:
                print(f.text())
        print(f"{sum(len(v) for v in per.values())} bare checks in {sum(1 for v in per.values() if v)} flows")
        return 0
    base = json.loads(BASELINE.read_text(encoding="utf-8")) if BASELINE.is_file() else {}
    # Only checks (assert / wait) are held to the count. A bare tap is listed as a warning: a tap of a button
    # in a pop-up is normal, and a tap that misses fails at once on the tap itself (trap 9).
    checks = {k: [f for f in v if f.cmd in GATED] for k, v in per.items()}
    taps = sum(1 for v in per.values() for f in v if f.cmd not in GATED)
    counts = {k: len(v) for k, v in checks.items() if v}
    if "--update" in argv:
        new = {k: v if "--force" in argv else min(v, base.get(k, v)) for k, v in counts.items()}
        if base and any(v > base.get(k, 0) for k, v in counts.items()) and "--force" not in argv:
            print("refusing to RAISE a count; fix the new bare checks (or pass --force on purpose)")
            return 1
        BASELINE.write_text(json.dumps(dict(sorted(new.items())), indent=1) + "\n", encoding="utf-8")
        print(f"baseline: {sum(new.values())} bare checks in {len(new)} flows")
        return 0
    for name, why in sorted(BROKEN.items()):
        errs.append(f"{name} does not parse, so Maestro fails its whole part ({why}). In a double-quoted "
                    f"line a backslash must be doubled; use single quotes or [.] instead of \\.")
    lower_now = []
    for name, n in sorted(counts.items()):
        allowed = base.get(name, 0)
        if n > allowed:
            errs.append(f"{name}: {n} bare checks on pages that scroll (allowed {allowed}); all of them:")
            for f in checks[name]:
                errs.append("    " + f.text())
    for name, allowed in base.items():
        if counts.get(name, 0) < allowed:
            lower_now.append(f"{name}: {allowed} -> {counts.get(name, 0)}")
    if lower_now:
        print("Fewer bare checks than the baseline (run --update to lock it in): " + "; ".join(lower_now))
    if errs:
        print("\n".join(errs))
        print("\nFix: put the check through the shared scroll helper (it scrolls only when the thing is out of view):\n"
              "    - runFlow:\n        file: sub-see.yaml\n        env:\n          FIND: \"<the same text>\"\n"
              "or, when it must be in view WITHOUT scrolling, a comment line '# in-view: <reason>' right above it.")
        return 1
    print(f"phone-test scroll lint: {sum(counts.values())} bare checks, none above the baseline "
          f"({len(counts)} flows still have some); {taps} bare taps on pages that scroll (warning only, --list shows them)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
