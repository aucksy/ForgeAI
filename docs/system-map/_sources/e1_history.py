#!/usr/bin/env python3
"""Audit step 3E / E1: failure history of every GitHub Actions run of the last N days.

Stdlib only. Reads the GitHub token from the git credential helper (never prints or stores it).

Usage (from the repo root):
    python docs/system-map/_sources/e1_history.py fetch   --cache <dir outside the repo>
    python docs/system-map/_sources/e1_history.py csv     --cache <dir>
    python docs/system-map/_sources/e1_history.py summary
    python docs/system-map/_sources/e1_history.py all     --cache <dir>

Outputs:
    docs/system-map/test-history.csv          one row per job, per run attempt
    docs/system-map/test-history-summary.md   counts per workflow / job / step

Definitions used everywhere below:
    run attempt   = one (run id, attempt number). A re-run makes a new attempt of the same run id.
    red           = the attempt has at least one job whose conclusion is failure or timed_out.
    flaky candidate = a failed job where the SAME workflow + job name + head_sha has a successful
                    job in a later attempt of the same run ("re-run") or in another run ("other run").
    minutes       = job started_at -> completed_at (wall time of the job; queue time not counted).
"""
import argparse
import collections
import concurrent.futures
import csv
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = "aucksy/ForgeAI"
API = "https://api.github.com"
HERE = os.path.dirname(os.path.abspath(__file__))
MAP_DIR = os.path.dirname(HERE)
CSV_PATH = os.path.join(MAP_DIR, "test-history.csv")
SUMMARY_PATH = os.path.join(MAP_DIR, "test-history-summary.md")
BAD = ("failure", "timed_out")

FIELDS = [
    "run_id", "workflow", "workflow_file", "event", "head_sha", "ref", "run_attempt",
    "run_attempts_total", "run_conclusion_latest", "run_created_at", "run_title",
    "job_id", "job_name", "conclusion", "failed_steps", "job_started_at", "job_completed_at",
    "minutes", "job_url", "only_parts", "flow_name_in",
]

# Steps that run many test flows inside ONE step: the step name does not say which flow failed.
# Value = the line to look for in the job log (checked by hand on 5 logs, 18 Nov 2026: runs
# 43141461077, 44011849464, 43796622071, 44264776182, 43630726782).
MANY_FLOW_STEPS = {
    "Run the workout QA on an emulator": "job log line '[qa] PART <X> FAILED (<flow>.yaml: ...)' + artifact qa-out-<shard>",
    "Run the phone conditions": "job log + artifact (not sampled)",
    "Run the cross-role journeys": "job log line '[xj] J<n> step <k> FAILED (...)'",
    "Admin journeys (phone, real forms)": "job log: Playwright line with the failed e2e/<file>.spec.mjs and test title",
    "Panel crawl (every page, phone + computer, dark theme)": "job log (not sampled)",
}
ECHO_STEPS = ("Every shard green, every part run", "Require a passing phone test on this commit")


def only_parts(title):
    """The `only` input of a partial phone run, read from the run title, else ''."""
    m = re.search(r"\(partial (.+?), api \d+", title or "")
    if m and m.group(1) != "whole run":
        return m.group(1)
    m = re.search(r"^Phone conditions \((.+)\)$", title or "")
    if m and m.group(1) != "all":
        return m.group(1)
    return ""


def flow_name_in(failed_steps, parts):
    """Where the name of the failed flow can be found for this failed job."""
    steps = failed_steps.split(" | ") if failed_steps else []
    many = [s for s in steps if s in MANY_FLOW_STEPS]
    if not many:
        return "step name" if steps else ""
    one_part = parts and parts != "uat" and not re.search(r"[ ,]", parts)
    return "run title (one part: %s); log for the flow file" % parts if one_part else "log needed"


# ------------------------------------------------------------------ GitHub API

def get_token():
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    out = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True, env=env, timeout=60).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line[len("password="):]
    sys.exit("no GitHub token from git credential helper")


class Api:
    def __init__(self):
        self._token = get_token()
        self.calls = 0
        self.use_curl = False

    def _curl(self, url):
        """Fallback transport: this laptop's Python sometimes cannot verify GitHub's certificate
        (Windows store misses an issuer). curl uses the Windows store properly. The token goes in
        on stdin, never on the command line."""
        nl = chr(10)
        hdr = nl.join(["Authorization: Bearer " + self._token, "Accept: application/vnd.github+json",
                       "X-GitHub-Api-Version: 2022-11-28", "User-Agent: e1-history-script", ""])
        p = subprocess.run(["curl", "-sS", "--max-time", "90", "-H", "@-", "-w", nl + "%{http_code}", url],
                           input=hdr.encode("utf-8"), capture_output=True, timeout=120)
        body, _, code = p.stdout.decode("utf-8", "replace").rpartition(nl)
        return int(code or 0), body

    def get(self, path, params=None):
        url = path if path.startswith("http") else API + path
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        for attempt in range(6):
            if self.use_curl:
                try:
                    code, body = self._curl(url)
                except subprocess.TimeoutExpired:
                    code, body = 0, ""
                if code == 200:
                    self.calls += 1
                    return json.loads(body)
                if code == 404:
                    return None
                if code in (403, 429):
                    print("rate limited, waiting 60s", file=sys.stderr)
                    time.sleep(60)
                else:
                    time.sleep(3 * (attempt + 1))
                continue
            req = urllib.request.Request(url, headers={
                "Authorization": "Bearer " + self._token,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "e1-history-script",
            })
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    self.calls += 1
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code in (403, 429):
                    reset = e.headers.get("X-RateLimit-Reset")
                    remaining = e.headers.get("X-RateLimit-Remaining")
                    wait = 30
                    if remaining == "0" and reset:
                        wait = max(5, int(reset) - int(time.time()) + 5)
                    print("rate limited, waiting %ss" % wait, file=sys.stderr)
                    time.sleep(min(wait, 900))
                    continue
                if e.code == 404:
                    return None
                if e.code >= 500:
                    time.sleep(3 * (attempt + 1))
                    continue
                raise
            except urllib.error.URLError as e:
                if "CERTIFICATE_VERIFY_FAILED" in str(e):
                    self.use_curl = True
                    continue
                time.sleep(3 * (attempt + 1))
            except (TimeoutError, ConnectionError):
                time.sleep(3 * (attempt + 1))
        raise RuntimeError("gave up on " + url.split("?")[0])

    def paged(self, path, key, params=None):
        page = 1
        items = []
        while True:
            p = dict(params or {}, per_page=100, page=page)
            data = self.get(path, p)
            if not data:
                break
            chunk = data.get(key, [])
            items.extend(chunk)
            if len(chunk) < 100:
                break
            page += 1
        return items


# ------------------------------------------------------------------ fetch

def fetch(cache, days):
    os.makedirs(cache, exist_ok=True)
    api = Api()
    today = dt.datetime.now(dt.timezone.utc).date()
    since = today - dt.timedelta(days=days)
    runs = {}
    d = since
    while d <= today:
        # one day per query: the runs search stops at 1000 results per query
        day_runs = api.paged("/repos/%s/actions/runs" % REPO, "workflow_runs",
                             {"created": "%s..%s" % (d.isoformat(), d.isoformat())})
        if len(day_runs) >= 1000:
            print("WARNING: %s hit the 1000-result cap" % d, file=sys.stderr)
        for r in day_runs:
            runs[r["id"]] = r
        d += dt.timedelta(days=1)
    slim = []
    for r in runs.values():
        slim.append({
            "id": r["id"], "name": r.get("name"), "path": r.get("path"), "event": r.get("event"),
            "head_sha": r.get("head_sha"), "head_branch": r.get("head_branch"),
            "run_attempt": r.get("run_attempt") or 1, "status": r.get("status"),
            "conclusion": r.get("conclusion"), "created_at": r.get("created_at"),
            "display_title": r.get("display_title"), "html_url": r.get("html_url"),
        })
    slim.sort(key=lambda r: r["created_at"])
    with open(os.path.join(cache, "runs.json"), "w", encoding="utf-8") as f:
        json.dump({"since": since.isoformat(), "until": today.isoformat(), "runs": slim}, f)
    print("runs: %d (%s .. %s)" % (len(slim), since, today))

    jobs_path = os.path.join(cache, "jobs.json")
    jobs = {}
    if os.path.exists(jobs_path):
        with open(jobs_path, encoding="utf-8") as f:
            jobs = json.load(f)

    def one(run):
        out = []
        for n in range(1, run["run_attempt"] + 1):
            js = api.paged("/repos/%s/actions/runs/%s/attempts/%s/jobs" % (REPO, run["id"], n), "jobs")
            for j in js:
                out.append({
                    "id": j["id"], "name": j.get("name"), "run_attempt": j.get("run_attempt") or n,
                    "listed_in_attempt": n, "status": j.get("status"), "conclusion": j.get("conclusion"),
                    "started_at": j.get("started_at"), "completed_at": j.get("completed_at"),
                    "html_url": j.get("html_url"),
                    "steps": [{"name": s.get("name"), "conclusion": s.get("conclusion"),
                               "number": s.get("number")} for s in (j.get("steps") or [])],
                })
        return str(run["id"]), out

    todo = [r for r in slim if str(r["id"]) not in jobs and r["status"] == "completed"]
    print("fetching jobs for %d runs" % len(todo))
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        for rid, out in ex.map(one, todo):
            jobs[rid] = out
            done += 1
            if done % 100 == 0:
                print("  %d / %d" % (done, len(todo)))
                with open(jobs_path, "w", encoding="utf-8") as f:
                    json.dump(jobs, f)
    with open(jobs_path, "w", encoding="utf-8") as f:
        json.dump(jobs, f)
    print("api calls: %d" % api.calls)


# ------------------------------------------------------------------ csv

def minutes(a, b):
    if not a or not b:
        return ""
    try:
        t0 = dt.datetime.strptime(a, "%Y-%m-%dT%H:%M:%SZ")
        t1 = dt.datetime.strptime(b, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return ""
    return "%.1f" % max(0.0, (t1 - t0).total_seconds() / 60.0)


def write_csv(cache):
    with open(os.path.join(cache, "runs.json"), encoding="utf-8") as f:
        meta = json.load(f)
    with open(os.path.join(cache, "jobs.json"), encoding="utf-8") as f:
        jobs = json.load(f)
    rows = []
    for r in meta["runs"]:
        wf_file = (r.get("path") or "").split("/")[-1]
        seen = set()
        js = jobs.get(str(r["id"]))
        base = {
            "run_id": r["id"], "workflow": r.get("name") or "", "workflow_file": wf_file,
            "event": r.get("event") or "", "head_sha": r.get("head_sha") or "",
            "ref": r.get("head_branch") or "", "run_attempts_total": r["run_attempt"],
            "run_conclusion_latest": r.get("conclusion") or r.get("status") or "",
            "run_created_at": r.get("created_at") or "",
            "run_title": (r.get("display_title") or "").replace("\n", " ")[:120],
        }
        if not js:
            # a run with no jobs at all (workflow refused / not completed): keep one row so it is counted
            rows.append(dict(base, run_attempt=r["run_attempt"], job_id="", job_name="(no jobs)",
                             conclusion=r.get("conclusion") or r.get("status") or "", failed_steps="",
                             job_started_at="", job_completed_at="", minutes="", job_url=r.get("html_url") or ""))
            continue
        for j in js:
            if j["id"] in seen:      # a job carried over unchanged into a later attempt
                continue
            seen.add(j["id"])
            failed = [s["name"] for s in j["steps"] if s.get("conclusion") in BAD]
            ran = j.get("conclusion") not in ("skipped", None)
            rows.append(dict(
                base, run_attempt=j["run_attempt"], job_id=j["id"], job_name=j.get("name") or "",
                conclusion=j.get("conclusion") or j.get("status") or "",
                failed_steps=" | ".join(failed),
                job_started_at=j.get("started_at") or "", job_completed_at=j.get("completed_at") or "",
                minutes=minutes(j.get("started_at"), j.get("completed_at")) if ran else "0.0",
                job_url=j.get("html_url") or "", only_parts=only_parts(base["run_title"]),
                flow_name_in=flow_name_in(" | ".join(failed), only_parts(base["run_title"]))
                if j.get("conclusion") in BAD else ""))
    rows.sort(key=lambda x: (x["run_created_at"], x["run_id"], int(x["run_attempt"]), str(x["job_name"])))
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print("csv rows: %d -> %s (window %s .. %s)" % (len(rows), CSV_PATH, meta["since"], meta["until"]))
    return meta


# ------------------------------------------------------------------ summary

def fnum(x):
    return "{:,.0f}".format(x)


def summarize(window=""):
    with open(CSV_PATH, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["m"] = float(r["minutes"] or 0)
        r["run_attempt"] = int(r["run_attempt"])

    attempts = collections.defaultdict(list)          # (run_id, attempt) -> job rows
    for r in rows:
        attempts[(r["run_id"], r["run_attempt"])].append(r)
    red_attempts = {k for k, js in attempts.items() if any(j["conclusion"] in BAD for j in js)}
    cancelled_attempts = {k for k, js in attempts.items()
                          if k not in red_attempts and any(j["conclusion"] == "cancelled" for j in js)}
    run_ids = {r["run_id"] for r in rows}
    red_run_ids = {k[0] for k in red_attempts}
    still_red = {r["run_id"] for r in rows if r["run_conclusion_latest"] in BAD}

    # flaky candidates: same workflow + job name + sha has a success somewhere
    def fk(r):
        # hand-started runs: the run title carries the inputs (which parts, which phone), so two runs
        # of one commit only count as "the same test" when their titles match too
        return (r["workflow_file"], r["job_name"], r["head_sha"],
                r["run_title"] if r["event"] == "workflow_dispatch" else "")

    ok = collections.defaultdict(list)                # fk -> [(run_id, attempt)]
    for r in rows:
        if r["conclusion"] == "success":
            ok[fk(r)].append((r["run_id"], r["run_attempt"]))
    for r in rows:
        r["flaky"] = ""
        if r["conclusion"] in BAD:
            hits = ok.get(fk(r), [])
            if any(h[0] == r["run_id"] and h[1] > r["run_attempt"] for h in hits):
                r["flaky"] = "re-run"
            elif any(h[0] != r["run_id"] for h in hits):
                r["flaky"] = "other run"
    # run-level flaky: a red attempt whose run id (or same workflow + sha) later went green
    green_by_wf_sha = collections.defaultdict(set)
    for k, js in attempts.items():
        if k not in red_attempts and all(j["conclusion"] in ("success", "skipped") for j in js):
            green_by_wf_sha[fk(dict(js[0], job_name=""))].add(k)
    red_then_green = set()
    for k in red_attempts:
        js = attempts[k]
        greens = green_by_wf_sha.get(fk(dict(js[0], job_name="")), set())
        if any(g != k for g in greens):
            red_then_green.add(k)

    # Neighbour check (a HINT only): order every job's runs in time on one branch (+ same title). A failed
    # step is "alone" when the run before and the run after did not fail at that step. Also the longest
    # unbroken row of fails. Push runs change the code every time, so this cannot prove a flaky test.
    seqs = collections.defaultdict(list)
    for r in sorted(rows, key=lambda x: (x["run_created_at"], x["run_id"], x["run_attempt"])):
        if r["conclusion"] in ("success",) + BAD:
            seqs[(r["workflow_file"], r["job_name"], r["ref"],
                  r["run_title"] if r["event"] == "workflow_dispatch" else "")].append(r)
    alone = collections.Counter()                     # (wf, step) -> fails with clean neighbours
    streak = collections.Counter()                    # (wf, step) -> longest unbroken row of fails
    for key, seq in seqs.items():
        marks = [set(x["failed_steps"].split(" | ")) if x["conclusion"] in BAD and x["failed_steps"] else set()
                 for x in seq]
        for s_name in (set().union(*marks) if marks else ()):
            run = 0
            for i, m in enumerate(marks):
                if s_name in m:
                    run += 1
                    streak[(key[0], s_name)] = max(streak[(key[0], s_name)], run)
                    before = i == 0 or s_name not in marks[i - 1]
                    after = i == len(marks) - 1 or s_name not in marks[i + 1]
                    if before and after and len(marks) > 1:
                        alone[(key[0], s_name)] += 1
                else:
                    run = 0
    sole = collections.Counter()                      # (wf, step) -> red attempts where it was the only failed step
    for k in red_attempts:
        steps = set()
        for j in attempts[k]:
            if j["conclusion"] in BAD:
                names = j["failed_steps"].split(" | ") if j["failed_steps"] else ["(no failed step recorded)"]
                steps.update(x for x in names if x not in ECHO_STEPS)
        if len(steps) == 1:
            sole[(attempts[k][0]["workflow_file"], next(iter(steps)))] += 1
    echo_jobs = [r for r in rows if r["conclusion"] in BAD and r["failed_steps"] in ECHO_STEPS]

    total_min = sum(r["m"] for r in rows)
    red_min = sum(r["m"] for k in red_attempts for r in attempts[k])
    failed_jobs = [r for r in rows if r["conclusion"] in BAD]
    flaky_jobs = [r for r in failed_jobs if r["flaky"]]

    L = []
    A = L.append
    A("# Test history, last 30 days (audit step 3E / E1)")
    A("")
    A("Generated by `docs/system-map/_sources/e1_history.py` from the GitHub Actions API for `%s`. %s" % (REPO, window))
    A("Evidence for every number: `docs/system-map/test-history.csv` (one row per job; `run_id` + `job_url`).")
    A("")
    A("Words: a **run attempt** is one try of a run (a re-run is a new attempt of the same run id). **Red** = at least")
    A("one job failed or timed out. **Flaky candidate** = a failed job where the same workflow + job name + commit")
    A("passed in a later attempt (\"re-run\") or in another run (\"other run\"). It is a candidate, not a verdict: E2 decides.")
    A("**Minutes** = job start to job end, summed over jobs (machine minutes, not clock time; parallel jobs add up).")
    A("")
    A("## Headline")
    A("")
    A("| Measure | Count |")
    A("|---|---|")
    A("| Runs (unique run ids) | %d |" % len(run_ids))
    A("| Run attempts (runs + re-runs) | %d |" % len(attempts))
    A("| **Red run attempts** | **%d** (%.0f%%) |" % (len(red_attempts), 100.0 * len(red_attempts) / max(1, len(attempts))))
    A("| Runs that were red at least once | %d |" % len(red_run_ids))
    A("| Runs still red on their last attempt | %d |" % len(still_red))
    A("| Cancelled run attempts (not counted red) | %d |" % len(cancelled_attempts))
    A("| Red run attempts where the same workflow + commit also went fully green | %d |" % len(red_then_green))
    A("| Job rows | %d |" % len(rows))
    A("| Failed or timed-out jobs | %d |" % len(failed_jobs))
    A("| ...of which only an echo of another failure (phone-test `report` job, release `phone-gate`) | %d |" % len(echo_jobs))
    A("| Failed jobs that really ran a test or build | %d |" % (len(failed_jobs) - len(echo_jobs)))
    A("| **Flaky candidate jobs** | **%d** (%d passed on a re-run, %d passed in another run of the same commit) |" % (
        len(flaky_jobs), sum(1 for r in flaky_jobs if r["flaky"] == "re-run"),
        sum(1 for r in flaky_jobs if r["flaky"] == "other run")))
    A("| Total job minutes | %s (%.0f hours) |" % (fnum(total_min), total_min / 60))
    A("| **Job minutes inside red run attempts** | **%s (%.0f hours)** |" % (fnum(red_min), red_min / 60))
    A("| Job minutes of the failed jobs alone | %s (%.0f hours) |" % (
        fnum(sum(r["m"] for r in failed_jobs)), sum(r["m"] for r in failed_jobs) / 60))
    A("| Job minutes of flaky candidate jobs alone | %s (%.0f hours) |" % (
        fnum(sum(r["m"] for r in flaky_jobs)), sum(r["m"] for r in flaky_jobs) / 60))
    A("")

    # per workflow
    A("## Per workflow")
    A("")
    A("| Workflow file | Run attempts | Red | Red % | Red that also went green (same commit) | Cancelled | Job minutes | Minutes in red attempts |")
    A("|---|---|---|---|---|---|---|---|")
    wf = collections.defaultdict(lambda: {"att": set(), "red": set(), "rg": set(), "can": set(), "m": 0.0, "rm": 0.0})
    for k, js in attempts.items():
        w = wf[js[0]["workflow_file"] or js[0]["workflow"]]
        w["att"].add(k)
        m = sum(j["m"] for j in js)
        w["m"] += m
        if k in red_attempts:
            w["red"].add(k)
            w["rm"] += m
        if k in red_then_green:
            w["rg"].add(k)
        if k in cancelled_attempts:
            w["can"].add(k)
    for name, w in sorted(wf.items(), key=lambda kv: -kv[1]["rm"]):
        A("| %s | %d | %d | %.0f%% | %d | %d | %s | %s |" % (
            name, len(w["att"]), len(w["red"]), 100.0 * len(w["red"]) / max(1, len(w["att"])),
            len(w["rg"]), len(w["can"]), fnum(w["m"]), fnum(w["rm"])))
    A("")

    # per job
    A("## Per workflow and job (part)")
    A("")
    A("Only jobs that ran (skipped rows left out). Sorted by minutes spent on failed jobs.")
    A("")
    A("| Workflow | Job | Ran | Failed | Fail % | Flaky candidates (re-run / other run) | Cancelled | Minutes | Minutes on failed |")
    A("|---|---|---|---|---|---|---|---|---|")
    jb = collections.defaultdict(lambda: {"n": 0, "f": 0, "fr": 0, "fo": 0, "c": 0, "m": 0.0, "fm": 0.0, "ex": []})
    for r in rows:
        if r["conclusion"] == "skipped" or r["job_name"] == "(no jobs)":
            continue
        b = jb[(r["workflow_file"], r["job_name"])]
        b["n"] += 1
        b["m"] += r["m"]
        if r["conclusion"] in BAD:
            b["f"] += 1
            b["fm"] += r["m"]
            b["ex"].append(r["run_id"])
            if r["flaky"] == "re-run":
                b["fr"] += 1
            elif r["flaky"] == "other run":
                b["fo"] += 1
        elif r["conclusion"] == "cancelled":
            b["c"] += 1
    quiet = collections.defaultdict(lambda: [0, 0, 0, 0.0])
    for (w, j), b in sorted(jb.items(), key=lambda kv: (-kv[1]["fm"], -kv[1]["m"])):
        if not b["f"] and b["m"] < 400:
            q = quiet[w]
            q[0] += 1
            q[1] += b["n"]
            q[2] += b["c"]
            q[3] += b["m"]
            continue
        A("| %s | %s | %d | %d | %.0f%% | %d (%d / %d) | %d | %s | %s |" % (
            w, j.replace("|", "/"), b["n"], b["f"], 100.0 * b["f"] / max(1, b["n"]), b["fr"] + b["fo"],
            b["fr"], b["fo"], b["c"], fnum(b["m"]), fnum(b["fm"])))
    for w, q in sorted(quiet.items(), key=lambda kv: -kv[1][3]):
        A("| %s | (%d other jobs that never failed, each under 400 min) | %d | 0 | 0%% | 0 (0 / 0) | %d | %s | 0 |" % (
            w, q[0], q[1], q[2], fnum(q[3])))
    A("")

    # top 20 jobs
    A("## Top 20 most-failing jobs")
    A("")
    A("| # | Workflow | Job | Failed | Ran | Flaky candidates | Minutes on failed | Example run ids |")
    A("|---|---|---|---|---|---|---|---|")
    top = sorted(jb.items(), key=lambda kv: (-kv[1]["f"], -kv[1]["fm"]))[:20]
    for i, ((w, j), b) in enumerate(top, 1):
        if not b["f"]:
            break
        A("| %d | %s | %s | %d | %d | %d | %s | %s |" % (
            i, w, j.replace("|", "/"), b["f"], b["n"], b["fr"] + b["fo"], fnum(b["fm"]),
            ", ".join(b["ex"][-3:])))
    A("")

    # top 20 steps
    A("## Top 20 most-failing steps")
    A("")
    A("A job can fail with no failed step listed (runner lost, timed out, or cancelled mid-step); those show as \"(no failed step recorded)\".")
    A("")
    A("| # | Workflow | Job | Failed step | Fails | Flaky candidates | Minutes of those jobs | Example run ids |")
    A("|---|---|---|---|---|---|---|---|")
    st = collections.defaultdict(lambda: {"f": 0, "fl": 0, "m": 0.0, "ex": []})
    for r in failed_jobs:
        steps = r["failed_steps"].split(" | ") if r["failed_steps"] else ["(no failed step recorded)"]
        for s in steps:
            b = st[(r["workflow_file"], r["job_name"], s)]
            b["f"] += 1
            b["m"] += r["m"]
            b["ex"].append(r["run_id"])
            if r["flaky"]:
                b["fl"] += 1
    for i, ((w, j, s), b) in enumerate(sorted(st.items(), key=lambda kv: (-kv[1]["f"], -kv[1]["m"]))[:20], 1):
        A("| %d | %s | %s | %s | %d | %d | %s | %s |" % (
            i, w, j.replace("|", "/"), s.replace("|", "/"), b["f"], b["fl"], fnum(b["m"]), ", ".join(b["ex"][-3:])))
    A("")

    # failed step names with the job folded away (same step in many matrix parts)
    A("## Failing steps, all jobs of a workflow added together")
    A("")
    A("\"Only failed step\" = red run attempts where nothing else failed. \"Alone\" = the run before and the run after")
    A("(same job, same branch) did not fail at this step: a hint of a random fail, not proof. \"Longest row\" = most")
    A("fails in a row: a long row usually means a real break (or a broken test) that stayed until someone fixed it.")
    A("")
    A("| Workflow | Failed step | Fails | Only failed step | Flaky candidates | Alone | Longest row | Minutes of those jobs |")
    A("|---|---|---|---|---|---|---|---|")
    st2 = collections.defaultdict(lambda: {"f": 0, "fl": 0, "m": 0.0})
    for (w, j, s), b in st.items():
        c = st2[(w, s)]
        c["f"] += b["f"]
        c["fl"] += b["fl"]
        c["m"] += b["m"]
    for (w, s), b in sorted(st2.items(), key=lambda kv: (-kv[1]["f"], -kv[1]["m"]))[:30]:
        A("| %s | %s | %d | %d | %d | %d | %d | %s |" % (w, s.replace("|", "/"), b["f"], sole[(w, s)], b["fl"],
                                                   alone[(w, s)], streak[(w, s)], fnum(b["m"])))
    A("")

    # where the flow name lives
    A("## Phone and browser flows: which flow failed?")
    A("")
    A("The GitHub jobs API stops at the step. These steps each run many flows, so the step name does not say which")
    A("flow failed. Checked by hand on 5 job logs (runs 43141461077, 44011849464, 43796622071, 44264776182,")
    A("43630726782): the flow name IS in the job log, as one line that a script can grep. No flow name is in a job or step name.")
    A("")
    A("| Step | Where the failed flow is named | Failed jobs | Part known from the run title | Log needed (E2) |")
    A("|---|---|---|---|---|")
    need = collections.defaultdict(list)
    for sname, where in MANY_FLOW_STEPS.items():
        fj = [r for r in failed_jobs if sname in r["failed_steps"].split(" | ")]
        t = [r for r in fj if r["flow_name_in"].startswith("run title")]
        n = [r for r in fj if r["flow_name_in"] == "log needed"]
        for r in n:
            need[r["workflow_file"]].append(r)
        A("| %s | %s | %d | %d | %d |" % (sname, where, len(fj), len(t), len(n)))
    A("")
    A("Seen in those logs: phone test `[qa] PART UATR401 FAILED (uat-rel-r401-whats-new.yaml: ...)` (run 43141461077);")
    A("`[qa] PART UAT4 FAILED (uat-rel-4-workout.yaml ...)` and `PART UATR576C FAILED (uat-rel-r576-c-break.yaml ...)` (run 44011849464);")
    A("journeys `[xj] J3 step 3 FAILED (member: bell shows 1 new, opens the inbox)` (run 43630726782); admin journeys")
    A("`e2e/alerts-uat.spec.mjs:394 > Latest from your members on a computer, light theme...`, 1 failed / 324 passed (run 44264776182).")
    A("Run 43796622071 (shard 1-history-routines) is red with NO `PART ... FAILED` line in its log: cause unknown from the log lines read; E2 must open its artifact.")
    A("Also seen in all 4 phone logs read: the step \"Install the Android emulator (3 tries)\" prints `emulator download failed` three times")
    A("(in 3 of them with `sdkmanager: command not found`) and waits 20 s each time, so its 3 tries did not work in any log read")
    A("(about 1 minute lost per phone job; the emulator runner step then installs it itself).")
    A("")
    A("### Phone test fails where the run title names the part")
    A("")
    A("| Run title part (`only`) | Failed jobs | Passed jobs | Flaky candidates | Minutes on failed | Run ids of the fails |")
    A("|---|---|---|---|---|---|")
    pt = collections.defaultdict(lambda: {"f": [], "ok": 0, "fl": 0, "m": 0.0})
    for r in rows:
        if (r["workflow_file"] in ("qa-device.yml", "qa-conditions.yml") and r["only_parts"]
                and r["job_name"].startswith(("device-qa", "conditions"))):
            b = pt[(r["workflow_file"], r["only_parts"])]
            if r["conclusion"] in BAD:
                b["f"].append(r["run_id"])
                b["m"] += r["m"]
                b["fl"] += 1 if r["flaky"] else 0
            elif r["conclusion"] == "success":
                b["ok"] += 1
    for (w, part), b in sorted(pt.items(), key=lambda kv: -len(kv[1]["f"])):
        if b["f"]:
            A("| %s: %s | %d | %d | %d | %s | %s |" % (w.replace(".yml", ""), part, len(b["f"]), b["ok"], b["fl"],
                                                    fnum(b["m"]), ", ".join(b["f"])))
    A("")
    A("### Runs whose logs E2 must read to get the flow name")
    A("")
    A("Every row is in the CSV with `flow_name_in` = `log needed` (job id and URL there). Run ids, oldest first:")
    A("")
    for w, lst in sorted(need.items(), key=lambda kv: -len(kv[1])):
        ids = []
        for r in lst:
            if r["run_id"] not in ids:
                ids.append(r["run_id"])
        A("- **%s**: %d failed jobs in %d runs: %s" % (w, len(lst), len(ids), ", ".join(ids)))
    A("")

    # by event
    A("## By what started the run")
    A("")
    A("| Event | Run attempts | Red | Minutes | Minutes in red attempts |")
    A("|---|---|---|---|---|")
    ev = collections.defaultdict(lambda: [0, 0, 0.0, 0.0])
    for k, js in attempts.items():
        e = ev[js[0]["event"]]
        m = sum(j["m"] for j in js)
        e[0] += 1
        e[2] += m
        if k in red_attempts:
            e[1] += 1
            e[3] += m
    for name, e in sorted(ev.items(), key=lambda kv: -kv[1][2]):
        A("| %s | %d | %d | %s | %s |" % (name, e[0], e[1], fnum(e[2]), fnum(e[3])))
    A("")

    # re-runs
    A("## Re-runs (same run id tried again)")
    A("")
    multi = collections.defaultdict(set)
    for k in attempts:
        multi[k[0]].add(k[1])
    multi = {rid: a for rid, a in multi.items() if len(a) > 1 or max(a) > 1}
    A("Runs with more than one attempt: %d. Extra attempts in total: %d." % (
        len(multi), sum(max(a) - 1 for a in multi.values())))
    A("")
    A("| Run id | Workflow | Ref | Attempts | Last result | Jobs failed per attempt |")
    A("|---|---|---|---|---|---|")
    first = {}
    for r in rows:
        first.setdefault(r["run_id"], r)
    for rid in sorted(multi, key=lambda x: -max(multi[x]))[:40]:
        r = first[rid]
        per = []
        for n in sorted(multi[rid]):
            per.append("%d: %d" % (n, sum(1 for j in attempts[(rid, n)] if j["conclusion"] in BAD)))
        A("| %s | %s | %s | %d | %s | %s |" % (rid, r["workflow_file"], r["ref"], max(multi[rid]),
                                             r["run_conclusion_latest"], "; ".join(per)))
    A("")

    # whole phone rounds: clock time
    def ts(x):
        return dt.datetime.strptime(x, "%Y-%m-%dT%H:%M:%SZ")

    green_wall, red_wall = [], []
    for k, js in attempts.items():
        if js[0]["workflow_file"] != "qa-device.yml" or js[0]["only_parts"]:
            continue
        timed = [j for j in js if j["job_started_at"] and j["job_completed_at"]]
        if not timed:
            continue
        wall = (max(ts(j["job_completed_at"]) for j in timed) - min(ts(j["job_started_at"]) for j in timed)).total_seconds() / 60
        if k in red_attempts:
            red_wall.append(wall)
        elif k not in cancelled_attempts:
            green_wall.append(wall)
    A("## Whole phone-test rounds (qa-device.yml without `only`): clock time")
    A("")
    A("Clock time = first job start to last job end of one run attempt (shards run side by side).")
    A("")
    A("| Result | Rounds | Median clock minutes | Longest | Clock hours in total |")
    A("|---|---|---|---|---|")
    for name, w in (("Green", green_wall), ("Red", red_wall)):
        if w:
            sw = sorted(w)
            A("| %s | %d | %.0f | %.0f | %.0f |" % (name, len(w), sw[len(sw) // 2], sw[-1], sum(w) / 60))
    A("")

    A("## Limits of this file (what it cannot say)")
    A("")
    no_jobs = collections.Counter((r["workflow_file"], r["conclusion"]) for r in rows if r["job_name"] == "(no jobs)")
    A("- **Flow level**: not in the API. See \"Phone and browser flows\" above for the runs E2 must read.")
    A("- **Flaky candidates are a floor, not the real count.** A push run tests a new commit every time and is rarely")
    A("  re-run, so a random fail on a push can only show up as \"Alone\" (a hint). Hand-started phone runs only match")
    A("  when the run title (parts, phone, extras) is the same.")
    A("- **Cancelled jobs** (%d job rows) are not counted as fails. The API does not say why a job was cancelled: by hand, by a newer"
      % sum(1 for r in rows if r["conclusion"] == "cancelled"))
    A("  round replacing it, by a sibling shard failing first (fail-fast), or by a time limit. No job in the window has the result `timed_out`.")
    A("- **Minutes** are job start to job end. They are not the billed minutes and leave out time waiting for a runner.")
    A("- **Runs with no job rows**: %s. Counted as runs; they have no minutes." % (
        "; ".join("%s %s x%d" % (w, c, n) for (w, c), n in sorted(no_jobs.items())) or "none"))
    A("- **test-lab.yml**: %d runs in the window." % sum(1 for r in first.values() if r["workflow_file"] == "test-lab.yml"))
    A("- **Why a run failed** (app bug, test fault, runner fault) is step E2. Nothing here is a verdict.")
    A("")

    with open(SUMMARY_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L) + "\n")
    print("summary -> %s" % SUMMARY_PATH)
    print("runs=%d attempts=%d red_attempts=%d failed_jobs=%d flaky_jobs=%d total_min=%.0f red_min=%.0f" % (
        len(run_ids), len(attempts), len(red_attempts), len(failed_jobs), len(flaky_jobs), total_min, red_min))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["fetch", "csv", "summary", "all"])
    ap.add_argument("--cache", help="folder for the raw API answers (outside the repo; delete after)")
    ap.add_argument("--days", type=int, default=30)
    a = ap.parse_args()
    window = ""
    if a.cmd in ("fetch", "all"):
        fetch(a.cache, a.days)
    if a.cmd in ("csv", "all"):
        meta = write_csv(a.cache)
        window = "Window: runs created %s to %s (UTC)." % (meta["since"], meta["until"])
    if a.cmd in ("summary", "all"):
        if not window and a.cache and os.path.exists(os.path.join(a.cache, "runs.json")):
            with open(os.path.join(a.cache, "runs.json"), encoding="utf-8") as f:
                meta = json.load(f)
            window = "Window: runs created %s to %s (UTC)." % (meta["since"], meta["until"])
        summarize(window)


if __name__ == "__main__":
    main()
