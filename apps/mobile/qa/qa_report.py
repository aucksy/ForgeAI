"""Read the device QA output folder (qa-out/) after run-device-qa.sh. No adb needed.

Usage: qa_report.py <check> <qa-out dir>
  scan      crash / ANR / JS-error scan of every part's device log, the final logcat and the
            dropbox dump. Prints what it found, writes scan.txt, exits 1 on any finding.
            (audit QA-07, QA-08)
  skipped   lists every step Maestro did NOT run: conditional blocks whose condition was false
            and optional taps whose target was not on screen, as "SKIPPED: <why>" lines; writes
            skipped.txt. Never fails. (audit QA-10)
  summary   writes a Markdown summary (parts run / passed / failed, skipped steps, scan result,
            rest-alert timing, permission check) to $GITHUB_STEP_SUMMARY and summary.md.
"""
import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

PKG = "com.forgeai.app"

# --- crash / ANR / JS error patterns. Both logcat layouts match: "time" ("10-09 16:35:29.286 E/Tag( 123): msg")
# and the default "threadtime" ("10-09 16:35:29.286  1234  1250 E Tag     : msg").
NATIVE_CRASH = [
    re.compile(r"Fatal signal \d+.*\(" + re.escape(PKG) + r"\)"),
    re.compile(r">>> " + re.escape(PKG) + r" <<<"),
]
ANR = re.compile(r"ANR in " + re.escape(PKG) + r"\b")
# Error-level lines from React Native's JS console (console.error, fatal JS errors), its native
# bridge, or the app's own QA tag (if a QA build ever logs swallowed errors under "ForgeQA").
JS_ERROR = re.compile(r"\s[EF][/ ]\s*(ReactNativeJS|ReactNative|unknown:ReactNative|ForgeQA)\s*[(:]")
JS_ANY = re.compile(r"\s[VDIWEF][/ ]\s*ReactNativeJS\s*[(:]")
UNHANDLED = re.compile(r"(?i)unhandled (promise )?rejection|unhandled (js )?exception")
JS_WARN = re.compile(r"\sW[/ ]\s*(ReactNativeJS|ForgeQA)\s*[(:]")


def read(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def part_of(path, out):
    rel = os.path.relpath(path, out).replace("\\", "/")
    m = re.match(r"part-([a-z0-9]+)", rel)
    return m.group(1).upper() if m else rel


def java_crash(text):
    """FATAL EXCEPTION blocks that belong to our process (other apps' crashes don't count)."""
    hits = []
    lines = text.splitlines()
    for i, l in enumerate(lines):
        if "FATAL EXCEPTION" in l and any(f"Process: {PKG}" in x for x in lines[i + 1:i + 3]):
            hits.append("\n".join(lines[i:i + 12]))
    return hits


def scan(out):
    findings, warns = [], []
    logs = sorted(glob.glob(os.path.join(out, "part-*", "**", "*logcat*"), recursive=True))
    final = os.path.join(out, "logcat.txt")
    if os.path.exists(final):
        logs.append(final)
    for path in logs:
        where = part_of(path, out) if path != final else "final logcat"
        text = read(path)
        for block in java_crash(text):
            findings.append(f"APP CRASH ({where}):\n{block}")
        for l in text.splitlines():
            if any(p.search(l) for p in NATIVE_CRASH):
                findings.append(f"NATIVE CRASH ({where}): {l.strip()}")
            elif ANR.search(l):
                findings.append(f"ANR ({where}): {l.strip()}")
            elif JS_ERROR.search(l):
                findings.append(f"JS ERROR ({where}): {l.strip()}")
            elif JS_ANY.search(l) and UNHANDLED.search(l):
                findings.append(f"UNHANDLED JS ERROR ({where}): {l.strip()}")
            elif JS_WARN.search(l):
                warns.append(f"JS warning ({where}): {l.strip()}")
    # Android's dropbox keeps crash/ANR reports even after Maestro clears logcat.
    drop = read(os.path.join(out, "dropbox.txt"))
    for entry in re.split(r"\n(?=\d{4}-\d\d-\d\d \d\d:\d\d:\d\d )", drop):
        if f"Process: {PKG}" in entry:
            head = entry.strip().splitlines()[:6]
            findings.append("DROPBOX REPORT: " + " | ".join(h.strip() for h in head))
    reports = glob.glob(os.path.join(out, "part-*", "**", "crash-report*"), recursive=True) + \
        glob.glob(os.path.join(out, "part-*", "**", "anr-report*"), recursive=True)
    for r in reports:
        findings.append(f"MAESTRO CRASH/ANR REPORT: {os.path.relpath(r, out)}")
    # De-duplicate: the final logcat repeats the last part's lines.
    seen, uniq = set(), []
    for f in findings:
        key = re.sub(r"^\w[\w /]*\(([^)]*)\)", "", f)
        if key not in seen:
            seen.add(key)
            uniq.append(f)
    lines = [f"[qa] device logs scanned: {len(logs)} (every part's log + the final logcat + dropbox)"]
    if uniq:
        lines.append(f"[qa] CRASH / ANR / JS-ERROR SCAN: {len(uniq)} finding(s)")
        lines += ["[qa]   " + f for f in uniq[:40]]
    else:
        lines.append("[qa] crash / ANR / JS-error scan: clean")
    if warns:
        lines.append(f"[qa] JS warnings (not failing): {len(warns)}")
        lines += ["[qa]   " + w for w in warns[:20]]
    text = "\n".join(lines)
    print(text)
    with open(os.path.join(out, "scan.txt"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
    return 1 if uniq else 0


def describe(cmd):
    """Short human text for a Maestro command from commands.json."""
    k, v = next(iter(cmd.items()))
    if k == "tapOnElement":
        sel = v.get("selector", {})
        return "tap " + repr(sel.get("textRegex") or sel.get("idRegex") or sel)
    if k == "runFlowCommand":
        cond = v.get("condition", {})
        bits = []
        for ck in ("visible", "notVisible"):
            if ck in cond:
                s = cond[ck]
                bits.append(f"{'when' if ck == 'visible' else 'unless'} {s.get('textRegex') or s.get('idRegex') or s!r} on screen")
        inner = [describe(c) for c in v.get("commands", [])[:3]]
        return f"block ({', '.join(bits) or 'condition'}) -> " + "; ".join(inner)
    return k


def skipped(out, quiet=False):
    rows = []
    for path in sorted(glob.glob(os.path.join(out, "part-*", "*", "*", "commands.json"))):
        part = part_of(path, out)
        try:
            cmds = json.loads(read(path))
        except ValueError:
            rows.append((part, "?", f"commands.json unreadable: {path}"))
            continue
        for c in cmds:
            meta, cmd = c.get("metadata", {}), c.get("command", {})
            st = meta.get("status")
            seq = meta.get("sequenceNumber", "?")
            if st == "SKIPPED":
                # A skipped block that holds an assertion is a CHECK that did not run this time.
                kind = "CHECK NOT RUN: conditional " if '"assertConditionCommand"' in json.dumps(cmd) else "conditional "
                rows.append((part, seq, kind + describe(cmd) + " -- condition was false, block not run"))
            elif st == "WARNED":
                rows.append((part, seq, "optional " + describe(cmd) + " -- not on screen, step not run"))
    lines = [f"SKIPPED: part {p} step {s}: {why}" for p, s, why in rows]
    if not quiet:
        print("\n".join(f"[qa] {l}" for l in lines) or "[qa] no skipped steps")
    with open(os.path.join(out, "skipped.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + ("\n" if lines else ""))
    return rows


def fired_dialog_taps(out):
    """Optional 'Wait' taps that DID fire: an "isn't responding" dialog was on screen."""
    hits = []
    for path in sorted(glob.glob(os.path.join(out, "part-*", "*", "*", "commands.json"))):
        try:
            cmds = json.loads(read(path))
        except ValueError:
            continue
        for c in cmds:
            v = c.get("command", {}).get("tapOnElement")
            if v and v.get("selector", {}).get("textRegex") == "Wait" and c.get("metadata", {}).get("status") == "COMPLETED":
                hits.append(part_of(path, out))
    return hits


def parts(out):
    res = []
    for x in sorted(glob.glob(os.path.join(out, "part-*.xml"))):
        name = os.path.basename(x)[5:-4].upper()
        try:
            suite = ET.parse(x).getroot().find("testsuite")
            failed = int(suite.get("failures", "0")) > 0 if suite is not None else True
        except (ET.ParseError, OSError):
            failed = True
        res.append((name, "failed" if failed else "passed"))
    return res


def summary(out):
    timeline = read(os.path.join(out, "timeline.txt"))
    started = re.findall(r"part (\w+) start", timeline)
    results = dict(parts(out))
    md = ["## Cloud phone test", ""]
    md.append("| Part | Result |")
    md.append("|---|---|")
    for p in started:
        r = results.get(p.upper(), "no result file (did not finish)")
        if f"PART {p.upper()} FAILED" in timeline:
            r = "failed"
        md.append(f"| {p} | {r} |")
    n_pass = sum(1 for p in started if results.get(p.upper()) == "passed" and f"PART {p.upper()} FAILED" not in timeline)
    md += ["", f"**Parts run:** {len(started)} · **passed:** {n_pass} · **failed:** {len(started) - n_pass}", ""]

    side = [l for l in timeline.splitlines() if re.search(
        r"REST ALERT|REST CARD|ONGOING CARD|REST IS OVER|WIDGET LINK|NOTIFICATIONS OFF|BACKUP M|BIG TEXT|THREE-BUTTON NAV|FAILED|NOT FOUND|MISSING|exact alarm|LATE", l)]
    if side:
        md += ["### Side checks", ""] + ["- " + l.replace("[qa] ", "") for l in side] + [""]

    scan_txt = read(os.path.join(out, "scan.txt")).strip()
    md += ["### Crash / ANR / JS-error scan", "", "```", scan_txt or "scan did not run", "```", ""]
    waits = fired_dialog_taps(out)
    if waits:
        md += [f"An \"isn't responding\" dialog was dismissed with Wait in part(s) {', '.join(waits)}. "
               "If it was ForgeAI's, the scan above lists an ANR.", ""]

    rows = skipped(out, quiet=True)
    md += [f"### Skipped steps ({len(rows)})", ""]
    if rows:
        md += ["These steps did not run, so they proved nothing in this run:", ""]
        md += [f"- SKIPPED: part {p} step {s}: {why}" for p, s, why in rows]
    else:
        md += ["None."]
    md.append("")
    perm = read(os.path.join(out, "permissions-check.txt")).strip()
    if perm:
        md += ["### Permission list (this build vs scripts/ci/approved-permissions.txt)", "", "```", perm, "```", ""]
    text = "\n".join(md) + "\n"
    with open(os.path.join(out, "summary.md"), "w", encoding="utf-8") as f:
        f.write(text)
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)
    return 0


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    check, out = sys.argv[1], sys.argv[2]
    if check == "scan":
        return scan(out)
    if check == "skipped":
        skipped(out)
        return 0
    if check == "summary":
        return summary(out)
    print("unknown check " + check)
    return 2


if __name__ == "__main__":
    sys.exit(main())
