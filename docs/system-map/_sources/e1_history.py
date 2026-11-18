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
    "minutes", "job_url",
]


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
                job_url=j.get("html_url") or ""))
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
    ok = collections.defaultdict(list)                # (wf, job, sha) -> [(run_id, attempt)]
    for r in rows:
        if r["conclusion"] == "success":
            ok[(r["workflow_file"], r["job_name"], r["head_sha"])].append((r["run_id"], r["run_attempt"]))
    for r in rows:
        r["flaky"] = ""
        if r["conclusion"] in BAD:
            hits = ok.get((r["workflow_file"], r["job_name"], r["head_sha"]), [])
            if any(h[0] == r["run_id"] and h[1] > r["run_attempt"] for h in hits):
                r["flaky"] = "re-run"
            elif any(h[0] != r["run_id"] for h in hits):
                r["flaky"] = "other run"
    # run-level flaky: a red attempt whose run id (or same workflow + sha) later went green
    green_by_wf_sha = collections.defaultdict(set)
    for k, js in attempts.items():
        if k not in red_attempts and all(j["conclusion"] in ("success", "skipped") for j in js):
            green_by_wf_sha[(js[0]["workflow_file"], js[0]["head_sha"])].add(k)
    red_then_green = set()
    for k in red_attempts:
        js = attempts[k]
        greens = green_by_wf_sha.get((js[0]["workflow_file"], js[0]["head_sha"]), set())
        if any(g != k for g in greens):
            red_then_green.add(k)

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
    for (w, j), b in sorted(jb.items(), key=lambda kv: (-kv[1]["fm"], -kv[1]["m"])):
        A("| %s | %s | %d | %d | %.0f%% | %d (%d / %d) | %d | %s | %s |" % (
            w, j.replace("|", "/"), b["n"], b["f"], 100.0 * b["f"] / max(1, b["n"]), b["fr"] + b["fo"],
            b["fr"], b["fo"], b["c"], fnum(b["m"]), fnum(b["fm"])))
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
    A("| Workflow | Failed step | Fails | Flaky candidates | Minutes of those jobs |")
    A("|---|---|---|---|---|")
    st2 = collections.defaultdict(lambda: {"f": 0, "fl": 0, "m": 0.0})
    for (w, j, s), b in st.items():
        c = st2[(w, s)]
        c["f"] += b["f"]
        c["fl"] += b["fl"]
        c["m"] += b["m"]
    for (w, s), b in sorted(st2.items(), key=lambda kv: (-kv[1]["f"], -kv[1]["m"]))[:30]:
        A("| %s | %s | %d | %d | %s |" % (w, s.replace("|", "/"), b["f"], b["fl"], fnum(b["m"])))
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
