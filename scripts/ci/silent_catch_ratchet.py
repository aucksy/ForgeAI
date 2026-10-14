"""Silent-catch ratchet (14 Oct 2026, audit toolkit pick 3).

Counts the places where an error is caught and thrown away without a trace, in the app's
TypeScript, the panel's TypeScript and the native Kotlin. The Health Connect "Connect" button
was dead on Android 14+ for 11 releases because one such catch hid the error.

The counts may only go DOWN. A new silent catch fails CI with its file and line; to add one on
purpose, log the error (Kotlin: android.util.Log.w; TS: console.warn) or tell the user instead.
When the count drops, the script says so and `--update` writes the lower number.

What counts as silent:
  - a catch block whose body is empty or only comments (TS `catch {}` / `catch (e) {}`,
    Kotlin `catch (_: Throwable) {}`), or a Kotlin catch whose body never logs, rethrows,
    or reports (no Log., throw, error, warn, reject, return with an error/false);
  - a promise `.catch(() => {})`, `.catch(() => undefined)`, `.catch(() => null)`.

A catch that is quiet ON PURPOSE (nothing the person needs can be lost, e.g. saving a display
preference in a private window) says so in writing: a comment starting `quiet:` with the reason
inside the catch body. Those are not counted, and `--list` still shows none of them as silent, so
every exception is a reviewed, written decision rather than a habit.

Usage: python3 scripts/ci/silent_catch_ratchet.py [--update] [--list]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path(__file__).with_name("silent-catch-baseline.json")

AREAS = {
    "app-ts": (ROOT / "apps/mobile/src", (".ts", ".tsx")),
    "panel-ts": (ROOT / "apps/dashboard/src", (".ts", ".tsx")),
    "native-kt": (ROOT / "apps/mobile/modules", (".kt",)),
}

PROMISE_SWALLOW = re.compile(r"\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)")
CATCH_OPEN = re.compile(r"\bcatch\b\s*(\([^)]*\))?\s*\{")
KT_REPORTS = re.compile(r"Log\.|throw\b|\berror\b|\bwarn|reject|return\s+(false|null|-1|mapOf\(\"error\")|\bprintln|onError|sendEvent")


def strip_comments(body: str) -> str:
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"//[^\n]*", "", body)
    return body.strip()


def block_after(text: str, open_brace: int) -> str:
    depth = 0
    for i in range(open_brace, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[open_brace + 1 : i]
    return text[open_brace + 1 :]


def findings(path: Path, kotlin: bool) -> list[tuple[int, str]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    out: list[tuple[int, str]] = []
    for m in CATCH_OPEN.finditer(text):
        body = block_after(text, m.end() - 1)
        bare = strip_comments(body)
        silent = (bare == "" or (kotlin and not KT_REPORTS.search(bare))) and "quiet:" not in body
        if silent:
            line = text.count("\n", 0, m.start()) + 1
            out.append((line, "catch block drops the error"))
    if not kotlin:
        for m in PROMISE_SWALLOW.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            out.append((line, m.group(0)))
    return out


def scan() -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for area, (base, exts) in AREAS.items():
        items: list[str] = []
        if base.exists():
            for p in sorted(base.rglob("*")):
                if p.suffix not in exts or "node_modules" in p.parts or "build" in p.parts:
                    continue
                for line, what in findings(p, p.suffix == ".kt"):
                    items.append(f"{p.relative_to(ROOT).as_posix()}:{line}  {what}")
        result[area] = items
    return result


def main() -> int:
    update = "--update" in sys.argv
    show = "--list" in sys.argv
    found = scan()
    counts = {k: len(v) for k, v in found.items()}
    base = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}

    if update or not base:
        BASELINE.write_text(json.dumps(counts, indent=2) + "\n")
        print(f"silent-catch baseline written: {counts}")
        return 0

    failed = False
    for area, n in counts.items():
        allowed = base.get(area, 0)
        if n > allowed:
            failed = True
            print(f"::error::{area}: {n} silent catches, baseline {allowed}. A new one was added — log it or tell the user:")
            known = set()
            for item in found[area]:
                print(f"  {item}")
                known.add(item)
        elif n < allowed:
            print(f"{area}: {n} silent catches (baseline {allowed}) — lower it with --update.")
        else:
            print(f"{area}: {n} silent catches (= baseline).")
        if show:
            for item in found[area]:
                print(f"  {item}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
