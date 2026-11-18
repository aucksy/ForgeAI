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


def fetch(cache, only_job=None):
    os.makedirs(os.path.join(cache, "digest"), exist_ok=True)
    os.makedirs(os.path.join(cache, "raw"), exist_ok=True)
    status_path = os.path.join(cache, "status.json")
    status = json.load(open(status_path)) if os.path.exists(status_path) else {}
    _, failed = failed_rows()
    todo = [r for r in failed if r["failed_steps"] not in ECHO_STEPS and r["job_id"] and r["job_id"] not in status]
    if only_job:
        todo = [{"job_id": only_job}]
    print("failed jobs: %d, to fetch now: %d" % (len(failed), len(todo)))
    tok = get_token()
    hdr = "\n".join(["Authorization: Bearer " + tok, "Accept: application/vnd.github+json",
                     "X-GitHub-Api-Version: 2022-11-28", "User-Agent: e2-label-script", ""]).encode("utf-8")

    def one(r):
        jid = r["job_id"]
        raw = os.path.join(cache, "raw", jid + ".log")
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


# LABEL-PART-GOES-HERE


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["fetch", "label", "summary", "one"])
    ap.add_argument("job", nargs="?")
    ap.add_argument("--cache")
    a = ap.parse_args()
    if a.cmd == "fetch":
        fetch(a.cache)


if __name__ == "__main__":
    main()
