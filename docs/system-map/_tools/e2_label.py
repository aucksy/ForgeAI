#!/usr/bin/env python3
"""Audit step 3E / E2: label every failed test job of the last 30 days.

Stdlib only, light (4 downloads side by side, nothing else). Reads the GitHub token from the git
credential helper and hands it to curl on stdin (never printed, never stored).

Usage (from the repo root):
    python docs/system-map/_tools/e2_label.py fetch   --cache <folder outside the repo>
    python docs/system-map/_tools/e2_label.py label   --cache <folder>
    python docs/system-map/_tools/e2_label.py summary
    python docs/system-map/_tools/e2_label.py one <job_id> --cache <folder>   (fetch + label one job, timed)

fetch   downloads each failed job's log, keeps a small digest (the lines that matter), deletes the log.
label   applies the rules to the digests -> docs/system-map/test-failures.jsonl
        (hand labels in docs/system-map/_work/E2-hand-labels.json win over the rules)
summary writes docs/system-map/test-failures-summary.md

Input: docs/system-map/test-history.csv (from e1_history.py). Delete the cache folder afterwards.
"""
import argparse
import collections
import concurrent.futures
import csv
import json
import os
import re
import subprocess
import sys
import time

REPO = "aucksy/ForgeAI"
HERE = os.path.dirname(os.path.abspath(__file__))
MAP_DIR = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(MAP_DIR))
CSV_PATH = os.path.join(MAP_DIR, "test-history.csv")
OUT_JSONL = os.path.join(MAP_DIR, "test-failures.jsonl")
OUT_MD = os.path.join(MAP_DIR, "test-failures-summary.md")
HAND = os.path.join(MAP_DIR, "_work", "E2-hand-labels.json")
BAD = ("failure", "timed_out")
ECHO_STEPS = ("Every shard green, every part run", "Require a passing phone test on this commit")

ANSI = re.compile(r"\x1b\[[0-9;]*m")
STAMP = re.compile(r"^.?\d{4}-\d\d-\d\dT[\d:.]+Z ")
NOISE = re.compile(r"\[qa\] SKIPPED|\[qa\]\s+JS warning|^\s*(INFO|WARNING|USER_INFO|DEBUG)\s+\||^\s*✓ |^\s*ok \d+ ")
KEEP = re.compile(
    r"FAILED|FAIL\b|✘|✖|✕|not ok|^# (tests|pass|fail)|\b\d+ (failed|passed|flaky|did not run)|error TS\d+|Error:|ERROR|"
    r"Expected|Received|[Tt]imeout|timed out|waiting for|locator resolved|unexpected value|emulator|adb: |device offline|"
    r"no devices|device not found|sdkmanager|ENOSPC|No space left|Killed|[Oo]ut of memory|OutOfMemory|heap out|ECONNRESET|"
    r"ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|network|\b429\b|\b50[0234]\b|rate limit|lost communication|"
    r"shutdown signal|operation was canceled|exceeded the maximum|EADDRINUSE|address already in use|Could not|Unable to|"
    r"What went wrong|BUILD FAILED|exit code|retry #|Tests:|Test Suites:|ratchet|##\[(error|warning)\]|\[xj\]|"
    r"^\s+\d+\) |AssertionError|command not found|No such file|is visible|not visible|not found")


# ------------------------------------------------------------------ fetch

def get_token():
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    out = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True, env=env, timeout=60).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line[len("password="):]
    sys.exit("no GitHub token from git credential helper")


def failed_rows():
    with open(CSV_PATH, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    return rows, [r for r in rows if r["conclusion"] in BAD]


def digest(raw_path):
    """The lines of a job log that a label can be decided from. A few KB to ~150 KB."""
    with open(raw_path, encoding="utf-8", errors="replace") as f:
        lines = [ANSI.sub("", STAMP.sub("", x.rstrip("\n"))) for x in f]
    n = len(lines)
    out = ["LINES %d" % n, "== STEPS"]
    steps = [(i, l) for i, l in enumerate(lines) if l.startswith("##[group]Run ")]
    out += ["%d\t%s" % (i, l[9:200]) for i, l in steps]
    errs = [i for i, l in enumerate(lines) if l.startswith("##[error]")]
    out.append("== ERRORS")
    out += ["%d\t%s" % (i, lines[i][:600]) for i in errs[:40]]
    out.append("== QA")
    qa = [l for l in lines if (l.startswith("[qa] ") or l.startswith("[xj] ")) and not NOISE.search(l)]
    out += [l[:500] for l in qa[:4000]]
    out.append("== BEFORE FIRST ERROR")
    if errs:
        a = errs[0]
        out += [l[:400] for l in lines[max(0, a - 80):a + 1] if not NOISE.search(l)]
    out.append("== BLOCKS")
    blocks = 0
    for i, l in enumerate(lines):
        if blocks < 6 and (re.match(r"\s+\d+\) (e2e/|\[)", l) or "What went wrong" in l or re.match(r"\s*(FAIL|not ok) ", l)
                           or l.startswith("✖ ") or " FAIL " in l[:12]):
            blocks += 1
            out.append("-- block at %d" % i)
            out += [x[:400] for x in lines[i:i + 34]]
    out.append("== KEEP")
    keep = [l[:400] for l in lines if KEEP.search(l) and not NOISE.search(l)]
    if len(keep) > 700:
        keep = keep[:250] + ["... (%d lines cut) ..." % (len(keep) - 650)] + keep[-400:]
    out += keep
    out.append("== TAIL")
    out += [l[:300] for l in lines[-40:]]
    return "\n".join(out)[:400000]


def fetch(cache, only_job=None, reverse=False):
    os.makedirs(os.path.join(cache, "digest"), exist_ok=True)
    os.makedirs(os.path.join(cache, "raw"), exist_ok=True)
    # two fetches may run side by side (one --reverse): each keeps its own status file, and skips a
    # job whose digest is already on disk
    status_path = os.path.join(cache, "status-r.json" if reverse else "status.json")
    status = json.load(open(status_path)) if os.path.exists(status_path) else {}
    _, failed = failed_rows()
    todo = [r for r in failed if r["failed_steps"] not in ECHO_STEPS and r["job_id"] and r["job_id"] not in status]
    if reverse:
        todo.reverse()
    if only_job:
        todo = [{"job_id": only_job}]
    print("failed jobs: %d, to fetch now: %d" % (len(failed), len(todo)))
    tok = get_token()
    hdr = "\n".join(["Authorization: Bearer " + tok, "Accept: application/vnd.github+json",
                     "X-GitHub-Api-Version: 2022-11-28", "User-Agent: e2-label-script", ""]).encode("utf-8")

    def one(r):
        jid = r["job_id"]
        raw = os.path.join(cache, "raw", jid + ".log")
        if not only_job and os.path.exists(os.path.join(cache, "digest", jid + ".txt")):
            return jid, {"code": "200", "bytes": -1}
        code = "0"
        for attempt in range(4):
            try:
                p = subprocess.run(["curl", "-sS", "-L", "--max-time", "180", "-H", "@-", "-o", raw, "-w", "%{http_code}",
                                    "https://api.github.com/repos/%s/actions/jobs/%s/logs" % (REPO, jid)],
                                   input=hdr, capture_output=True, timeout=200)
                code = p.stdout.decode("ascii", "replace").strip()[-3:]
            except subprocess.TimeoutExpired:
                code = "0"
            if code in ("200", "404", "410"):
                break
            if code in ("403", "429"):
                time.sleep(60)
            else:
                time.sleep(3 * (attempt + 1))
        size = os.path.getsize(raw) if os.path.exists(raw) else 0
        if code == "200" and size > 0:
            with open(os.path.join(cache, "digest", jid + ".txt"), "w", encoding="utf-8", newline="\n") as f:
                f.write(digest(raw))
        if os.path.exists(raw):
            os.remove(raw)
        return jid, {"code": code, "bytes": size}

    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        for jid, st in ex.map(one, todo):
            status[jid] = st
            done += 1
            if done % 50 == 0:
                print("  %d / %d" % (done, len(todo)), flush=True)
                json.dump(status, open(status_path, "w"))
    json.dump(status, open(status_path, "w"))
    c = collections.Counter(s["code"] for s in status.values())
    print("fetch done:", dict(c))


# ------------------------------------------------------------------ label

# What kind of check a failed step is. First match wins.
KINDS = [
    ("e2e", r"Admin journeys|Panel crawl"),
    ("device", r"workout QA on an emulator|phone conditions|cross-role journeys|Workout dims|Workout keeps|largest text on the small watch|"
               r"Take the screens|Every picture is there|watch screens \(rendered\)"),
    ("type", r"Typecheck"),
    ("testlint", r"Phone-test files parse|Phone-test scroll lint"),
    ("lint", r"ratchet|Help library covers|Self-tests|Release checks|still declares its capability|What's new file|iOS parity|expo-doctor"),
    ("unit", r"Unit tests|Worker tests|HQ Worker|Security check and feature tests|Watch unit tests|flow tools"),
    ("setup", r"Set up |Start a local Supabase|Install |setup-|checkout|Upload QA evidence|Get every shard|cache"),
    ("build", r"Build |Stills |Probe lengths|Run python|render"),
    ("deploy", r"Upload to Play|Upload the watch app|WHATSAPP_TOKEN|New kinds of crash"),
]

# Runner faults. Only looked for next to the failure (the ##[error] lines, the 80 lines before the first one,
# the tail), never in the whole log: every phone log prints a harmless "emulator download failed" early on.
RUNNER = [
    ("network or download failed", r"Downloading from \S+ failed|timeout \(\d+ms\)|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|"
                                   r"Could not resolve host|503 Service|502 Bad Gateway|504 Gateway|429 Too Many|rate limit|Failed to download|"
                                   r"unable to access 'https|Could not GET|Read timed out|Connection reset|connect timed out|Connection refused|"
                                   r"Failed to CreateArtifact|Failed to make request|fetch failed|TLS handshake|net::ERR_|Unexpected token '<'|"
                                   r"failed to pull|toomanyrequests|i/o timeout|context deadline exceeded|unexpected EOF|error pulling image"),
    ("emulator did not boot or device offline", r"Timeout waiting for emulator|error: device offline|error: no devices|device '\S+' not found|"
                                                r"adb: device offline|emulator: ERROR|no devices/emulators found|device unauthorized|"
                                                r"adb: failed to install|cmd: Can't find service|device still connecting|Simulator.*(failed to boot|timed out)"),
    ("port in use", r"EADDRINUSE|address already in use|port \d+ is (already )?in use"),
    ("out of memory, killed or disk full", r"[Oo]ut of memory|OutOfMemoryError|heap out of memory|\bKilled\b|exit code 137|No space left|ENOSPC|"
                                           r"Gradle build daemon disappeared|daemon has been stopped"),
    ("runner lost", r"lost communication with the server|received a shutdown signal|The operation was canceled|runner.*stopped responding"),
    ("toolchain setup failed", r"sdkmanager: command not found|Unable to locate executable|Failed to install .*sdk|Could not find or load main class|"
                               r"exceeded the maximum execution time"),
]

TEST_PATH = re.compile(r"(^|/)(e2e|test|tests|__tests__|qa|\.maestro|__mocks__|fixtures|goldens?)/|\.(test|spec)\.[a-z]+$|^supabase/tests/")
APP_PATH = re.compile(r"^(apps/|deploy/|supabase/|packages/|plugins/|scripts/(?!ci/))")


def kind_of(step):
    for k, pat in KINDS:
        if re.search(pat, step or ""):
            return k
    return "other"


def is_app_file(p):
    return bool(APP_PATH.match(p)) and not TEST_PATH.search(p) and not p.endswith(".md")


_diff_cache = {}


def changed_files(a, b):
    key = (a, b)
    if key not in _diff_cache:
        p = subprocess.run(["git", "diff", "--name-only", a, b], cwd=ROOT, capture_output=True, text=True)
        _diff_cache[key] = [x for x in p.stdout.splitlines() if x] if p.returncode == 0 else None
    return _diff_cache[key]


def sections(text):
    sec = collections.defaultdict(list)
    cur = "HEAD"
    for l in text.split("\n"):
        if l.startswith("== "):
            cur = l[3:]
        else:
            sec[cur].append(l)
    return sec


def extract(kind, step, sec):
    """-> (list of failed flows/specs/tests, the evidence line)."""
    allk = sec["QA"] + sec["KEEP"]
    flows, line = [], ""
    seen = set()

    def add(f, l):
        nonlocal line
        f = f.strip()[:160]
        if f and f not in seen:
            seen.add(f)
            flows.append(f)
            if not line:
                line = l.strip()[:300]

    for l in sec["QA"]:
        m = re.search(r"\[qa\] PART (\S+) FAILED \(([^:)]+\.yaml)", l)
        if m:
            add(m.group(2), l)
            continue
        m = re.search(r"\[qa\] PART (\S+?):? (FAILED|.*)$", l) if "PART" in l and "FAILED" in l else None
        if m:
            add("part " + m.group(1), l)
        m = re.search(r"\[xj\] (J\d+) step (\d+) FAILED \(([^)]*)\)", l)
        if m:
            add("%s step %s (%s)" % m.groups(), l)
    if not flows:
        for l in allk:
            m = re.match(r"\s+\d+\) (?:\[[^\]]+\] › )?(e2e/[\w.\-/]+\.mjs):\d+:\d+ › (.*)", l)
            if m:
                add(m.group(1) + " › " + m.group(2).split(" › ")[0], l)
    if not flows:
        for l in allk:
            m = re.match(r"\s*FAIL\s+(\S+\.(?:test|spec)\.\w+)(?: > (.*))?", l)
            if m:
                add(m.group(1) + (" > " + m.group(2) if m.group(2) else ""), l)
                continue
            m = re.match(r"\s*FAIL\s+(supabase/tests/\S+?):?\s*$", l)
            if m:
                add(m.group(1), l)
                continue
            m = re.match(r"\s*not ok \d+ - (.*)", l)
            if m and not l.startswith("    "):
                add("node test: " + m.group(1), l)
                continue
            m = re.match(r"^(?:##\[error\])?(\S+\.(?:tsx?|mjs|js|kt))[(:](\d+)[,:]\d+\)?:? .*error (TS\d+)", l)
            if m:
                add(m.group(1) + " " + m.group(3), l)
    errs = [l.split("\t", 1)[-1] for l in sec["ERRORS"]]
    real = [e for e in errs if "Process completed with exit code" not in e and "failed with exit code" not in e]
    if not line:
        line = (real or errs or [""])[0][:300]
    # the reason, when the log gives one: Playwright's Error line + the test line it stopped at
    why = ""
    blk = sec["BLOCKS"] + sec["BEFORE FIRST ERROR"]
    e = next((l.strip() for l in blk if re.match(r"\s+(Error|TimeoutError|AssertionError)\b", l)), "")
    src = next((l.strip() for l in blk if re.match(r"\s+> +\d+ \|", l)), "")
    loc = next((l.strip() for l in blk if re.match(r"\s+Locator: ", l)), "")
    if kind == "e2e" and e:
        why = " | ".join(x for x in (e, loc, re.sub(r"\s+", " ", src)) if x)
    elif real and real[0] not in line:
        why = real[0].replace("##[error]", "")
    if why:
        line = (line + " || " + why)[:500]
    return flows, line


def near_failure(sec):
    return "\n".join([l.split("\t", 1)[-1] for l in sec["ERRORS"]] + sec["BEFORE FIRST ERROR"] + sec["TAIL"])


def runner_fault(kind, flows, sec, step):
    if kind == "device" and flows:
        return None          # a flow ran and failed: the phone was up
    if kind in ("unit", "e2e", "type", "lint", "testlint") and flows:
        text = "\n".join(l.split("\t", 1)[-1] for l in sec["ERRORS"])
    else:
        text = near_failure(sec)
    for name, pat in RUNNER:
        m = re.search(pat, text)
        if m:
            ln = [l for l in text.split("\n") if m.group(0) in l][0]
            return name, ln.strip()[:300]
    return None


def label_all(cache, only=None):
    rows, failed = failed_rows()
    status = {}
    for name in ("status.json", "status-r.json"):
        if os.path.exists(os.path.join(cache, name)):
            status.update(json.load(open(os.path.join(cache, name))))
    hand = json.load(open(HAND, encoding="utf-8")) if os.path.exists(HAND) else {}

    def fk(r):
        return (r["workflow_file"], r["job_name"], r["head_sha"], r["run_title"] if r["event"] == "workflow_dispatch" else "")

    ok = collections.defaultdict(list)
    for r in rows:
        if r["conclusion"] == "success":
            ok[fk(r)].append((r["run_id"], int(r["run_attempt"])))
    # push history per (workflow, job, ref), in time order: to find the next green
    seq = collections.defaultdict(list)
    for r in sorted(rows, key=lambda x: (x["run_created_at"], x["run_id"], int(x["run_attempt"]))):
        if r["event"] == "push" and r["conclusion"] in ("success",) + BAD:
            seq[(r["workflow_file"], r["job_name"], r["ref"])].append(r)

    work = []
    for r in failed:
        if r["failed_steps"] in ECHO_STEPS:
            continue
        if only and r["job_id"] != only:
            continue
        step = r["failed_steps"].split(" | ")[0]
        kind = kind_of(step)
        dpath = os.path.join(cache, "digest", r["job_id"] + ".txt")
        sec = sections(open(dpath, encoding="utf-8").read()) if os.path.exists(dpath) else None
        flows, line = extract(kind, step, sec) if sec else ([], "")
        work.append({"r": r, "step": step, "kind": kind, "sec": sec, "flows": flows, "line": line})

    # phone flows: where did each part run without failing? (only the logs we hold = failed jobs)
    flow_pass = collections.defaultdict(set)      # (sha, flow yaml) -> job ids where it started and did not fail
    for w in work:
        if not w["sec"] or w["kind"] != "device":
            continue
        qa = w["sec"]["QA"]
        if not any("[qa] done" in l for l in qa):
            continue
        failed_parts = {m.group(1).lower(): m.group(2) for m in
                        (re.search(r"PART (\S+) FAILED \(([^:)]+\.yaml)", l) for l in qa) if m}
        w["failed_parts"] = failed_parts
        for l in qa:
            m = re.match(r"\[qa\] part (\S+) start", l)
            if m and m.group(1).lower() not in failed_parts:
                flow_pass[(w["r"]["head_sha"], m.group(1).lower())].add(w["r"]["job_id"])

    out = []
    for w in work:
        r, step, kind, sec, flows, line = w["r"], w["step"], w["kind"], w["sec"], w["flows"], w["line"]
        label, rule = "UNKNOWN", "no rule matched"
        st = status.get(r["job_id"], {})
        if sec is None:
            label, rule = "NO LOG KEPT", "GitHub answered %s for the job log" % st.get("code", "nothing")
        else:
            rf = runner_fault(kind, flows, sec, step)
            hits = ok.get(fk(r), [])
            rerun = any(h[0] == r["run_id"] and h[1] > int(r["run_attempt"]) for h in hits)
            other = any(h[0] != r["run_id"] for h in hits)
            gate = re.search(r"Run the phone test on this commit first", near_failure(sec))
            if gate:
                label, rule = "ECHO", "E: a release gate that only repeats 'no green phone test on this commit yet'"
            elif rf:
                label, rule, line = "RUNNER FAULT", "R: " + rf[0], rf[1]
            elif kind == "setup":
                label, rule = "RUNNER FAULT", "R: a setup step failed (%s)" % step
            elif rerun or other:
                label, rule = "TEST FAULT", "T1: same commit passed this job on %s (no code change)" % ("a re-run" if rerun else "another run")
            elif kind == "device" and w.get("failed_parts") and all(
                    flow_pass.get((r["head_sha"], p)) for p in w["failed_parts"]):
                label, rule = "TEST FAULT", "T2: every failed flow ran clean on the same commit in another job (%s)" % ", ".join(
                    sorted({j for p in w["failed_parts"] for j in flow_pass[(r["head_sha"], p)]})[:3])
            elif kind == "e2e" and re.search(r"strict mode violation", "\n".join(sec["KEEP"] + sec["BLOCKS"])):
                label, rule = "TEST FAULT", "T3: Playwright strict mode violation (the wanted element was on screen, more than once)"
            elif kind == "testlint":
                label, rule = "TEST FAULT", "T5: the failed check lints the phone-test files themselves (%s)" % step
            elif kind == "type":
                files = [f.split(" ")[0] for f in flows]
                if files and all(TEST_PATH.search(f) for f in files):
                    label, rule = "TEST FAULT", "T6: every type error is in a test file"
                else:
                    label, rule = "APP BUG", "A0: type error"
            elif kind == "lint":
                label, rule = "APP BUG", "A0: lint / ratchet / release check failed (%s)" % step
            elif kind == "build" and re.search(r"Compilation (error|failed)|error TS\d+|e: file://|Execution failed for task .*compile",
                                               "\n".join(sec["KEEP"] + sec["BLOCKS"])):
                label, rule = "APP BUG", "A0: compile error"
            if label == "UNKNOWN" and kind in ("unit", "e2e") and r["event"] == "push":
                s = seq[(r["workflow_file"], r["job_name"], r["ref"])]
                i = next((k for k, x in enumerate(s) if x["job_id"] == r["job_id"]), None)
                nxt = next((x for x in s[i + 1:] if x["conclusion"] == "success"), None) if i is not None else None
                # how many runs in a row failed at this same step (a one-off can be a random fail)
                row = 1
                if i is not None:
                    k = i - 1
                    while k >= 0 and s[k]["conclusion"] in BAD and step in s[k]["failed_steps"].split(" | "):
                        row += 1
                        k -= 1
                    k = i + 1
                    while k < len(s) and s[k]["conclusion"] in BAD and step in s[k]["failed_steps"].split(" | "):
                        row += 1
                        k += 1
                files = changed_files(r["head_sha"], nxt["head_sha"]) if nxt and nxt["head_sha"] != r["head_sha"] else None
                if nxt and files is not None:
                    app = [f for f in files if is_app_file(f)]
                    tfiles = {f.split(" ")[0].split(" › ")[0].split(" > ")[0] for f in flows}
                    test_changed = any(any(f.endswith(t) for t in tfiles) for f in files) if tfiles else None
                    where = "next green run %s (%s..%s)" % (nxt["run_id"], r["head_sha"][:8], nxt["head_sha"][:8])
                    if not app:
                        label, rule = "TEST FAULT", "T4: went green with no app code changed; %s, %d files" % (where, len(files))
                    elif kind == "unit":
                        label = "APP BUG"
                        rule = "A1: went green after app code changed (%s); failing test file %s" % (
                            where, "also changed" if test_changed else "unchanged" if test_changed is False else "not named in the log")
                    elif kind == "e2e" and test_changed is False and row >= 2:
                        label, rule = "APP BUG", "A2: red %d runs in a row, went green after app code changed with the spec file unchanged; %s" % (row, where)
                    else:
                        rule = "no rule matched: went green after app code changed (%s); spec %s; %d red in a row" % (
                            where, "also changed" if test_changed else "unchanged" if test_changed is False else "not named", row)
                elif not nxt:
                    rule = "no rule matched: no later green run of this job on %s" % r["ref"]
        h = hand.get(r["job_id"])
        if h:
            label, rule, line = h["label"], "HAND: " + h["rule"], h.get("log_line") or line
        out.append({"run_id": r["run_id"], "job_id": r["job_id"], "workflow": r["workflow_file"], "job": r["job_name"],
                    "step": step, "flow": "; ".join(flows) if flows else "(" + (step or "no failed step recorded") + ")",
                    "head_sha": r["head_sha"], "label": label, "rule_that_fired": rule, "log_line": line,
                    "minutes": float(r["minutes"] or 0), "event": r["event"], "ref": r["ref"], "created": r["run_created_at"]})
    if only:
        return out
    with open(OUT_JSONL, "w", encoding="utf-8", newline="\n") as f:
        for o in out:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
    c = collections.Counter(o["label"] for o in out)
    print("labelled %d jobs -> %s" % (len(out), OUT_JSONL))
    for k, v in c.most_common():
        print("  %-12s %d" % (k, v))
    return out


# ------------------------------------------------------------------ summary

def fnum(x):
    return "{:,.0f}".format(x)


def pct(a, b):
    return "%.0f%%" % (100.0 * a / b) if b else "0%"


def summary(seconds_note=""):
    rows, failed = failed_rows()
    echo_skipped = [r for r in failed if r["failed_steps"] in ECHO_STEPS]
    o = [json.loads(l) for l in open(OUT_JSONL, encoding="utf-8")]
    L = []
    A = L.append
    order = ["RUNNER FAULT", "TEST FAULT", "APP BUG", "UNKNOWN", "NO LOG KEPT", "ECHO"]
    cnt = collections.Counter(x["label"] for x in o)
    mins = collections.Counter()
    for x in o:
        mins[x["label"]] += x["minutes"]
    real = [x for x in o if x["label"] != "ECHO"]
    M = len(real)
    notapp = cnt["RUNNER FAULT"] + cnt["TEST FAULT"]
    decided = notapp + cnt["APP BUG"]
    hand = sum(1 for x in o if x["rule_that_fired"].startswith("HAND"))

    A("# Why the tests went red, last 30 days (audit step 3E / E2)")
    A("")
    A("Made by `docs/system-map/_tools/e2_label.py` from `docs/system-map/test-history.csv` and the job logs on GitHub (`aucksy/ForgeAI`).")
    A("One row per failed job, with its run id, job id and the log line it was judged on: `docs/system-map/test-failures.jsonl`.")
    A("")
    A("## Headline")
    A("")
    A("**%d of %d red jobs were not app bugs (%s).** %d were a runner fault (the machine, the network, the emulator) and %d a test fault "
      "(the test failed while the app was right, or it passed again with no app change)." % (
          notapp, M, pct(notapp, M), cnt["RUNNER FAULT"], cnt["TEST FAULT"]))
    A("")
    A("- App bug (the red was right): **%d** (%s)." % (cnt["APP BUG"], pct(cnt["APP BUG"], M)))
    A("- Could not be told from the log: **%d UNKNOWN** (%s)." % (cnt["UNKNOWN"], pct(cnt["UNKNOWN"], M)))
    A("- Log no longer on GitHub: **%d NO LOG KEPT**." % cnt["NO LOG KEPT"])
    A("- Of the %d jobs that could be judged, %d were not app bugs (%s)." % (decided, notapp, pct(notapp, decided)))
    A("- Not in these numbers: %d echo jobs (a job that only repeats another job's red: %d `report` / `phone-gate` jobs skipped unread, "
      "%d release checks whose log says only \"run the phone test on this commit first\")." % (
          len(echo_skipped) + cnt["ECHO"], len(echo_skipped), cnt["ECHO"]))
    A("- %d labels were set by reading the log by hand (rule starts with `HAND`); the rest by rule." % hand)
    A("")
    A("| Label | Jobs | Share of %d | Machine minutes | What it means |" % M)
    A("|---|---|---|---|---|")
    means = {"RUNNER FAULT": "the machine, network, emulator or a setup step failed", "TEST FAULT": "the test was wrong or random; the app was fine",
             "APP BUG": "the test caught a real mistake in the app's code", "UNKNOWN": "the job log does not say enough",
             "NO LOG KEPT": "GitHub no longer has the log", "ECHO": "only repeats another red (not counted)"}
    for k in order:
        if cnt[k]:
            A("| %s | %d | %s | %s | %s |" % (k, cnt[k], pct(cnt[k], M) if k != "ECHO" else "-", fnum(mins[k]), means[k]))
    A("")

    A("## Which rule decided")
    A("")
    A("| Label | Rule | Jobs | Minutes |")
    A("|---|---|---|---|")
    rc = collections.defaultdict(lambda: [0, 0.0])
    for x in o:
        rule = x["rule_that_fired"]
        rule = re.sub(r"\(next green run.*|; next green run.*|\(\d{6,}.*| \(Re.*| \(Se.*| \(Th.*| \(Si.*| \(Pr.*| \(He.*| \(Ph.*| \(Set.*| \(Sta.*|: went green after.*|: no later green.*", "", rule)
        b = rc[(x["label"], rule)]
        b[0] += 1
        b[1] += x["minutes"]
    for (lab, rule), b in sorted(rc.items(), key=lambda kv: (order.index(kv[0][0]), -kv[1][0])):
        A("| %s | %s | %d | %s |" % (lab, rule.replace("|", "/"), b[0], fnum(b[1])))
    A("")

    A("## Per workflow and failed step")
    A("")
    A("| Workflow | Failed step | Jobs | Runner fault | Test fault | App bug | Unknown | No log | Not app bug % of judged |")
    A("|---|---|---|---|---|---|---|---|---|")
    ws = collections.defaultdict(collections.Counter)
    for x in real:
        ws[(x["workflow"], x["step"] or "(no failed step recorded)")][x["label"]] += 1
    for (w, s), c in sorted(ws.items(), key=lambda kv: -sum(kv[1].values())):
        j = c["RUNNER FAULT"] + c["TEST FAULT"] + c["APP BUG"]
        A("| %s | %s | %d | %d | %d | %d | %d | %d | %s |" % (
            w, s.replace("|", "/"), sum(c.values()), c["RUNNER FAULT"], c["TEST FAULT"], c["APP BUG"], c["UNKNOWN"], c["NO LOG KEPT"],
            pct(c["RUNNER FAULT"] + c["TEST FAULT"], j) if j else "-"))
    A("")

    A("## Top 15 flows by test-fault and flaky count")
    A("")
    A("A flow here is one phone flow file, one journey step, one browser spec or one unit test. \"Flaky\" = it passed on the same commit")
    A("(rules T1, T2). \"Test fault\" = the other TEST FAULT rules. When a job failed in several flows its minutes are split evenly.")
    A("")
    A("| # | Flow | Flaky | Test fault | Minutes lost on those | All red jobs with this flow | ...of which unknown | Example run / job |")
    A("|---|---|---|---|---|---|---|---|")
    fl = collections.defaultdict(lambda: {"fk": 0, "tf": 0, "m": 0.0, "all": 0, "unk": 0, "ex": ""})
    for x in real:
        names = x["flow"].split("; ")
        for nme in names:
            b = fl[(x["workflow"], nme)]
            b["all"] += 1
            if x["label"] == "UNKNOWN":
                b["unk"] += 1
            if x["label"] == "TEST FAULT":
                if re.match(r"(HAND: )?T[12]", x["rule_that_fired"]) or "flaky" in x["rule_that_fired"]:
                    b["fk"] += 1
                else:
                    b["tf"] += 1
                b["m"] += x["minutes"] / len(names)
                b["ex"] = "%s / %s" % (x["run_id"], x["job_id"])
    top = sorted(fl.items(), key=lambda kv: (-(kv[1]["fk"] + kv[1]["tf"]), -kv[1]["m"]))[:15]
    for i, ((w, nme), b) in enumerate(top, 1):
        if b["fk"] + b["tf"] == 0:
            break
        A("| %d | %s: %s | %d | %d | %s | %d | %d | %s |" % (i, w.replace(".yml", ""), nme.replace("|", "/")[:140], b["fk"], b["tf"],
                                                         fnum(b["m"]), b["all"], b["unk"], b["ex"]))
    A("")
    A("### Top 15 flows by red jobs of any label (for the flows nobody could judge)")
    A("")
    A("| # | Flow | Red jobs | Runner | Test fault | App bug | Unknown | Minutes (split) |")
    A("|---|---|---|---|---|---|---|---|")
    fa = collections.defaultdict(lambda: [collections.Counter(), 0.0])
    for x in real:
        names = x["flow"].split("; ")
        for nme in names:
            if nme.startswith("("):
                continue
            fa[(x["workflow"], nme)][0][x["label"]] += 1
            fa[(x["workflow"], nme)][1] += x["minutes"] / len(names)
    for i, ((w, nme), (c, m)) in enumerate(sorted(fa.items(), key=lambda kv: -sum(kv[1][0].values()))[:15], 1):
        A("| %d | %s: %s | %d | %d | %d | %d | %d | %s |" % (i, w.replace(".yml", ""), nme.replace("|", "/")[:140], sum(c.values()),
                                                         c["RUNNER FAULT"], c["TEST FAULT"], c["APP BUG"], c["UNKNOWN"], fnum(m)))
    A("")

    A("## CI step \"Admin journeys (phone, real forms)\"")
    A("")
    aj = [x for x in real if x["step"].startswith("Admin journeys")]
    c = collections.Counter(x["label"] for x in aj)
    A("%d red jobs, %s machine minutes." % (len(aj), fnum(sum(x["minutes"] for x in aj))))
    A("")
    A("| Label | Jobs | Share |")
    A("|---|---|---|")
    for k in order:
        if c[k]:
            A("| %s | %d | %s |" % (k, c[k], pct(c[k], len(aj))))
    A("")
    A("### The 5 specs that failed most")
    A("")
    A("| # | Spec file | Red jobs | Runner | Test fault | App bug | Unknown |")
    A("|---|---|---|---|---|---|---|")
    sp = collections.defaultdict(collections.Counter)
    for x in aj:
        for f in {n.split(" › ")[0] for n in x["flow"].split("; ")}:
            sp[f][x["label"]] += 1
    for i, (f, cc) in enumerate(sorted(sp.items(), key=lambda kv: -sum(kv[1].values()))[:5], 1):
        A("| %d | %s | %d | %d | %d | %d | %d |" % (i, f, sum(cc.values()), cc["RUNNER FAULT"], cc["TEST FAULT"], cc["APP BUG"], cc["UNKNOWN"]))
    A("")
    A("### The 5 failing lines seen most")
    A("")
    A("The line Playwright stopped at (first failure of the job), with line numbers removed so the same line counts once.")
    A("")
    A("| # | Failing line | Red jobs | Labels | Example run / job |")
    A("|---|---|---|---|---|")
    ln = collections.defaultdict(lambda: [collections.Counter(), ""])
    for x in aj:
        why = x["log_line"].split(" || ", 1)[1] if " || " in x["log_line"] else x["log_line"]
        why = re.sub(r"> +\d+ \|", ">", why)
        why = re.sub(r"\s+", " ", why).strip()[:230] or "(no line in the log)"
        ln[why][0][x["label"]] += 1
        ln[why][1] = "%s / %s" % (x["run_id"], x["job_id"])
    for i, (why, (cc, ex)) in enumerate(sorted(ln.items(), key=lambda kv: -sum(kv[1][0].values()))[:5], 1):
        A("| %d | `%s` | %d | %s | %s |" % (i, why.replace("|", "/").replace("`", "'"), sum(cc.values()),
                                          ", ".join("%s %d" % kv for kv in cc.most_common()), ex))
    A("")
    extra = os.path.join(MAP_DIR, "_work", "E2-summary-notes.md")
    if os.path.exists(extra):
        A(open(extra, encoding="utf-8").read().rstrip())
        A("")
    with open(OUT_MD, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L) + "\n")
    print("summary -> %s" % OUT_MD)
    print("M=%d notapp=%d (%s) app=%d unknown=%d nolog=%d echo=%d+%d" % (M, notapp, pct(notapp, M), cnt["APP BUG"], cnt["UNKNOWN"],
                                                                      cnt["NO LOG KEPT"], len(echo_skipped), cnt["ECHO"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["fetch", "label", "summary", "one"])
    ap.add_argument("job", nargs="?")
    ap.add_argument("--cache")
    ap.add_argument("--reverse", action="store_true")
    a = ap.parse_args()
    if a.cmd == "fetch":
        fetch(a.cache, reverse=a.reverse)
    elif a.cmd == "label":
        label_all(a.cache)
    elif a.cmd == "one":
        t0 = time.time()
        st = os.path.join(a.cache, "status.json")
        if os.path.exists(st):
            s = json.load(open(st))
            s.pop(a.job, None)
            json.dump(s, open(st, "w"))
        fetch(a.cache, only_job=a.job)
        for o in label_all(a.cache, only=a.job):
            print(json.dumps(o, ensure_ascii=False, indent=1))
        print("seconds: %.1f" % (time.time() - t0))
    elif a.cmd == "summary":
        summary()


if __name__ == "__main__":
    main()
