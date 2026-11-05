"""iPhone parity gate (R-339, 5 Nov 2026; docs/ios/RESEARCH.md section E6).

Fails CI when something Android-only reaches the repo without a line in docs/ios/PARITY.yaml that
says what happens on iPhone (done / n-a / todo, with the reason). It reads the tree, never a
hand-kept list of what exists, so a new Android piece cannot slip past:

  1. Native module functions and events. Every Function("x") / AsyncFunction("x") / Events(...)
     in modules/<m>/android/**/*Module.kt must be either in that module's Swift twin
     (modules/<m>/ios/**/*.swift, same names) or named in a PARITY feature's `covers.functions`
     as "<module-folder>.<name>". A module with an ios/ folder must list "ios" or "apple" in
     expo-module.config.json, or the twin would never be linked.
  2. Android permissions: app.json android.permissions, the module manifests and the committed
     app manifest (lines that REMOVE a permission are skipped). Each needs `covers.permissions`.
  3. app.json: every plugin and every key of the "android" block needs `covers.plugins` /
     `covers.app_json_android`.
  4. Gradle dependencies (group:artifact) in modules/*/android/build.gradle and
     android/app/build.gradle need `covers.gradle`.
  5. TypeScript that switches on Android (Platform.OS compared with 'android') or uses the Android
     back button (BackHandler) needs `covers.files` (path under apps/mobile/).
  6. The Wear OS app (android/wear) needs `covers.paths`.

It also fails on a stale manifest: a covered name that no longer exists on disk, a feature marked
ios: done whose functions are missing from the Swift twin, an unknown status, a missing reason.

  python3 scripts/ci/ios_parity.py            # the CI gate (prints the iPhone to-do list)
  python3 scripts/ci/ios_parity.py --release  # also fails while any todo is blocking: true
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

STATUSES = {"done", "n-a", "todo"}
COVER_KINDS = ("functions", "permissions", "plugins", "app_json_android", "gradle", "files", "paths")

RE_FN = re.compile(r'\b(?:Async)?Function\(\s*"([A-Za-z0-9_]+)"')
RE_EVENTS = re.compile(r'\bEvents\(([^)]*)\)')
RE_QUOTED = re.compile(r'"([A-Za-z0-9_]+)"')
RE_PERM = re.compile(r'<uses-permission[^>]*android:name="([^"]+)"[^>]*>')
RE_GRADLE = re.compile(r'(?<![\w.])(?:implementation|api)\s*\(?\s*["\']([^"\':$\s]+:[^"\':$\s]+)')
RE_ANDROID_SWITCH = re.compile(r"Platform\.OS\s*[!=]==?\s*['\"]android['\"]|['\"]android['\"]\s*[!=]==?\s*Platform\.OS")
RE_BACK = re.compile(r"\bBackHandler\b")


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def native_names(files: list[Path]) -> set[str]:
    """Function / AsyncFunction / event names declared in Expo module source (Kotlin or Swift)."""
    out: set[str] = set()
    for f in files:
        text = _read(f)
        out.update(RE_FN.findall(text))
        for args in RE_EVENTS.findall(text):
            out.update(RE_QUOTED.findall(args))
    return out


def scan(mobile: Path) -> dict:
    """What is on disk under apps/mobile. Returns {kind: set(names)} plus module facts."""
    found: dict[str, set[str]] = {k: set() for k in COVER_KINDS}
    swift: dict[str, set[str]] = {}
    problems: list[str] = []

    modules = mobile / "modules"
    for m in sorted(p for p in modules.iterdir() if p.is_dir()) if modules.is_dir() else []:
        android = m / "android"
        if not android.is_dir():
            continue
        kt = sorted(android.rglob("*Module.kt"))
        for n in native_names(kt):
            found["functions"].add(f"{m.name}.{n}")
        ios = m / "ios"
        if ios.is_dir():
            swift[m.name] = native_names(sorted(ios.rglob("*.swift")))
            cfg = m / "expo-module.config.json"
            plats = json.loads(_read(cfg)).get("platforms", []) if cfg.is_file() else []
            if "ios" not in plats and "apple" not in plats:
                problems.append(f"modules/{m.name} has an ios/ folder but expo-module.config.json platforms {plats} "
                                "lists neither 'ios' nor 'apple': the Swift twin would never be linked")
        for man in android.rglob("AndroidManifest.xml"):
            found["permissions"].update(perms_of(_read(man)))
        gradle = android / "build.gradle"
        if gradle.is_file():
            found["gradle"].update(RE_GRADLE.findall(_read(gradle)))

    app_manifest = mobile / "android/app/src/main/AndroidManifest.xml"
    if app_manifest.is_file():
        found["permissions"].update(perms_of(_read(app_manifest)))
    app_gradle = mobile / "android/app/build.gradle"
    if app_gradle.is_file():
        found["gradle"].update(RE_GRADLE.findall(_read(app_gradle)))

    app_json = mobile / "app.json"
    if app_json.is_file():
        expo = json.loads(_read(app_json)).get("expo", {})
        android_block = expo.get("android", {}) or {}
        found["permissions"].update(android_block.get("permissions", []) or [])
        found["app_json_android"].update(k for k in android_block if k != "permissions")
        for p in expo.get("plugins", []) or []:
            found["plugins"].add(p[0] if isinstance(p, list) else p)

    src = mobile / "src"
    if src.is_dir():
        for f in sorted(list(src.rglob("*.ts")) + list(src.rglob("*.tsx"))):
            text = _read(f)
            if RE_ANDROID_SWITCH.search(text) or RE_BACK.search(text):
                found["files"].add(f.relative_to(mobile).as_posix())

    if (mobile / "android/wear").is_dir():
        found["paths"].add("android/wear")
    return {"found": found, "swift": swift, "problems": problems}


def perms_of(xml: str) -> set[str]:
    out = set()
    for m in RE_PERM.finditer(xml):
        if 'tools:node="remove"' in m.group(0):
            continue
        out.add(m.group(1))
    return out


def check(root: Path, release: bool = False) -> tuple[list[str], list[dict]]:
    """Returns (errors, todo features). Empty errors = the gate passes."""
    mobile = root / "apps/mobile"
    manifest_path = root / "docs/ios/PARITY.yaml"
    if not manifest_path.is_file():
        return [f"{manifest_path.relative_to(root).as_posix()} is missing"], []
    doc = yaml.safe_load(_read(manifest_path)) or {}
    features = doc.get("features") or []
    disk = scan(mobile)
    found, swift = disk["found"], disk["swift"]
    errors: list[str] = list(disk["problems"])

    covered: dict[str, dict[str, str]] = {k: {} for k in COVER_KINDS}
    ids: set[str] = set()
    todos: list[dict] = []
    for i, f in enumerate(features):
        fid = f.get("id") or f"<feature #{i + 1}>"
        if fid in ids:
            errors.append(f"PARITY.yaml: feature id '{fid}' is used twice")
        ids.add(fid)
        for side in ("android", "ios"):
            if f.get(side) not in STATUSES:
                errors.append(f"PARITY.yaml {fid}: {side}: must be one of done / n-a / todo (got {f.get(side)!r})")
        if f.get("ios") != "done" and not str(f.get("reason") or "").strip():
            errors.append(f"PARITY.yaml {fid}: ios is {f.get('ios')}, so it needs a reason")
        if not isinstance(f.get("blocking"), bool):
            errors.append(f"PARITY.yaml {fid}: blocking: must be true or false")
        if f.get("ios") == "todo":
            todos.append(f)
            if release and f.get("blocking") is True:
                errors.append(f"PARITY.yaml {fid}: iPhone todo marked blocking: true, so no release ({f.get('reason')})")
        covers = f.get("covers") or {}
        for kind, names in covers.items():
            if kind not in COVER_KINDS:
                errors.append(f"PARITY.yaml {fid}: unknown covers kind '{kind}' (use {', '.join(COVER_KINDS)})")
                continue
            for n in names or []:
                n = str(n)
                if n in covered[kind]:
                    errors.append(f"PARITY.yaml: {kind} '{n}' is listed under both {covered[kind][n]} and {fid}")
                covered[kind][n] = fid
                if n not in found[kind]:
                    errors.append(f"PARITY.yaml {fid}: {kind} '{n}' no longer exists on disk (stale line: remove it)")
                if kind == "functions" and f.get("ios") == "done":
                    mod, _, name = n.partition(".")
                    if name not in swift.get(mod, set()):
                        errors.append(f"PARITY.yaml {fid}: says ios: done but modules/{mod}/ios has no '{name}'")

    hints = {
        "functions": "Write its Swift twin in modules/<module>/ios (same name), or add it to a feature's covers.functions in docs/ios/PARITY.yaml",
        "permissions": "Add it to a feature's covers.permissions in docs/ios/PARITY.yaml with what iPhone does instead",
        "plugins": "Add it to a feature's covers.plugins in docs/ios/PARITY.yaml (does it need iOS options?)",
        "app_json_android": "Add the key to a feature's covers.app_json_android in docs/ios/PARITY.yaml (does iOS need its own key?)",
        "gradle": "Add group:artifact to a feature's covers.gradle in docs/ios/PARITY.yaml with the iPhone equivalent",
        "files": "This file switches on Android (Platform.OS or BackHandler): add it to a feature's covers.files in docs/ios/PARITY.yaml",
        "paths": "Add it to a feature's covers.paths in docs/ios/PARITY.yaml",
    }
    for kind in COVER_KINDS:
        for n in sorted(found[kind]):
            if n in covered[kind]:
                continue
            if kind == "functions":
                mod, _, name = n.partition(".")
                if name in swift.get(mod, set()):
                    continue
            errors.append(f"Android-only {kind[:-1] if kind.endswith('s') else kind} '{n}' has no iPhone twin and no PARITY entry. {hints[kind]}")
    return errors, todos


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parents[2]
    errors, todos = check(root, release="--release" in argv)
    print(f"iPhone parity: {len(todos)} feature(s) still todo on iPhone"
          f" ({sum(1 for t in todos if t.get('blocking'))} blocking):")
    for t in todos:
        print(f"  - {t.get('id')}: {t.get('reason')}")
    if errors:
        print(f"\n{len(errors)} parity problem(s):")
        for e in errors:
            print(f"::error::{e}")
        return 1
    print("\nparity gate passed: every Android-only piece has an iPhone line in docs/ios/PARITY.yaml")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
