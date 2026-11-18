#!/usr/bin/env python3
"""Audit step 3E / E3: what the release gate costs (time), from the CI history E1 collected.

Stdlib only, seconds long. Reads docs/system-map/test-history.csv, the workflow files, the Maestro
flows (apps/mobile/qa) and the local git history. Writes nothing but its own outputs:

  python docs/system-map/_tools/e3_gate_cost.py csv      -> docs/system-map/_work/E3-numbers.json
  python docs/system-map/_tools/e3_gate_cost.py logs <tmp-dir-outside-repo>
        downloads 6 job logs of ONE green whole round (LOG_RUN below), reads the "[qa] part X start"
        lines with their timestamps, writes docs/system-map/_work/E3-flow-times.json, deletes the logs.
  python docs/system-map/_tools/e3_gate_cost.py repeats  -> docs/system-map/_work/E3-repeats.json
  python docs/system-map/_tools/e3_gate_cost.py report   -> docs/system-map/test-gate-cost.md

Words: a "whole run" is one qa-device.yml run without `only` on one phone profile. A "round" is the
whole runs started within 15 minutes of each other (normally one per phone). "Machine minutes" = job
start to job end, summed over jobs. "Wall-clock" = first job start to last job end.
"""
import collections
import csv
import datetime
import json
import os
import re
import statistics
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
MAP = os.path.join(ROOT, "docs", "system-map")
WORK = os.path.join(MAP, "_work")
CSV = os.path.join(MAP, "test-history.csv")
QA = os.path.join(ROOT, "apps", "mobile", "qa")
REPO = "aucksy/ForgeAI"
# The newest green whole round with the release UAT on the owner's phone (the slower phone), 17 Nov 2026.
LOG_RUN = "44011846187"
ROUND_GAP_MIN = 15


def ts(x):
    return datetime.datetime.strptime(x, "%Y-%m-%dT%H:%M:%SZ") if x else None


def med(xs):
    return round(statistics.median(xs), 1) if xs else None


def mx(xs):
    return round(max(xs), 1) if xs else None


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


# ------------------------------------------------------------------ the CSV as run attempts

def load():
    rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
    att = collections.OrderedDict()
    for r in rows:
        att.setdefault((r["run_id"], int(r["run_attempt"] or 1)), []).append(r)
    out = []
    first = {}
    for (rid, n), jobs in att.items():
        if n == 1:
            first[rid] = {j["job_name"]: j["job_started_at"] for j in jobs}
    for (rid, n), jobs in att.items():
        j0 = jobs[0]
        # A re-run attempt lists the jobs it did not run again with their old times: keep only what ran.
        ran = [j for j in jobs if j["job_started_at"] and j["conclusion"] != "skipped"
               and (n == 1 or first.get(rid, {}).get(j["job_name"]) != j["job_started_at"])]
        concl = [j["conclusion"] for j in jobs]
        if any(c in ("failure", "timed_out") for c in concl):
            state = "red"
        elif any(c == "cancelled" for c in concl):
            state = "cancelled"
        elif all(c in ("success", "skipped") for c in concl):
            state = "green"
        else:
            state = "other"
        starts = [ts(j["job_started_at"]) for j in ran]
        ends = [ts(j["job_completed_at"]) for j in ran if j["job_completed_at"]]
        title = j0["run_title"]
        wf = j0["workflow_file"]
        kind = ""
        if wf == "qa-device.yml":
            if j0["event"] != "workflow_dispatch":
                kind = "other"
            elif "(partial" in title:
                kind = "partial"
            elif "(owner phone" in title:
                kind = "owner"
            else:
                kind = "default"
        out.append({
            "run_id": rid, "attempt": n, "attempts_total": int(j0["run_attempts_total"] or 1), "wf": wf,
            "title": title, "ref": j0["ref"], "sha": j0["head_sha"], "event": j0["event"], "state": state,
            "kind": kind, "uat": "+ uat" in title or ", uat" in title, "start": min(starts) if starts else ts(j0["run_created_at"]),
            "end": max(ends) if ends else None,
            "machine": round(sum(fnum(j["minutes"]) for j in ran), 1),
            "jobs": {j["job_name"]: (fnum(j["minutes"]), j["conclusion"]) for j in jobs},
            "ran": [j["job_name"] for j in ran],
        })
    for a in out:
        a["wall"] = round((a["end"] - a["start"]).total_seconds() / 60, 1) if a["end"] and a["start"] else None
    return rows, out


def part_table(atts, pick, label):
    """Median and slowest minutes of each job over the green attempts that `pick` keeps."""
    green = [a for a in atts if pick(a) and a["state"] == "green" and a["attempts_total"] == 1]
    jobs = collections.defaultdict(list)
    for a in green:
        for name, (m, c) in a["jobs"].items():
            if c == "success":
                jobs[name].append(m)
    return {
        "label": label, "green_attempts": len(green),
        "example_runs": [a["run_id"] for a in green[-3:]],
        "wall_median": med([a["wall"] for a in green]), "wall_slowest": mx([a["wall"] for a in green]),
        "machine_median": med([a["machine"] for a in green]), "machine_slowest": mx([a["machine"] for a in green]),
        "jobs": {n: {"n": len(v), "median": med(v), "slowest": mx(v)} for n, v in sorted(jobs.items())},
    }


def is_whole(a):
    return a["wf"] == "qa-device.yml" and a["kind"] in ("default", "owner")


def new_layout(a):
    return "device-qa (0-canary)" in a["jobs"]


def cmd_csv():
    rows, atts = load()
    res = {"window": [min(r["run_created_at"] for r in rows), max(r["run_created_at"] for r in rows)]}
    T = res["tables"] = {}
    T["phone_uat_default"] = part_table(atts, lambda a: is_whole(a) and a["kind"] == "default" and a["uat"] and new_layout(a),
                                        "Phone test, whole run + release UAT, default phone (layout since 12 Nov: canary + 6 shards)")
    T["phone_uat_owner"] = part_table(atts, lambda a: is_whole(a) and a["kind"] == "owner" and a["uat"] and new_layout(a),
                                      "Phone test, whole run + release UAT, owner phone (layout since 12 Nov)")
    T["phone_plain_new"] = part_table(atts, lambda a: is_whole(a) and not a["uat"] and new_layout(a),
                                      "Phone test, whole run without the UAT extra, either phone (layout since 12 Nov)")
    T["phone_uat_old"] = part_table(atts, lambda a: is_whole(a) and a["uat"] and not new_layout(a),
                                    "Phone test, whole run + release UAT, either phone (old layout: 4 shards, before 12 Nov)")
    T["phone_plain_old"] = part_table(atts, lambda a: is_whole(a) and not a["uat"] and not new_layout(a) and "clip" not in a["title"],
                                      "Phone test, whole run without UAT, either phone (old layout: 4 shards)")
    T["journeys"] = part_table(atts, lambda a: a["wf"] == "qa-journeys.yml", "Cross-role journeys")
    T["conditions_all"] = part_table(atts, lambda a: a["wf"] == "qa-conditions.yml" and "(all)" in a["title"], "Phone conditions (all)")
    T["release_tag"] = part_table(atts, lambda a: a["wf"] == "release-apk.yml" and a["ref"].startswith("v")
                                  and a["jobs"].get("publish", (0, ""))[1] == "success", "Build & Release on a tag (published)")
    T["ci_main"] = part_table(atts, lambda a: a["wf"] == "ci.yml" and a["ref"] == "main", "CI on main (every push)")
    T["wear_build"] = part_table(atts, lambda a: a["wf"] == "wear-build.yml", "Wear OS build + watch UAT")
    T["play_upload_manual"] = part_table(atts, lambda a: a["wf"] == "play-upload.yml", "Play upload started by hand")

    # ---- rounds: whole runs started together
    whole = sorted([a for a in atts if is_whole(a)], key=lambda a: a["start"])
    rounds = []
    for a in whole:
        if rounds and (a["start"] - rounds[-1]["start"]).total_seconds() / 60 <= ROUND_GAP_MIN:
            rounds[-1]["atts"].append(a)
        else:
            rounds.append({"start": a["start"], "atts": [a]})
    for r in rounds:
        r["end"] = max([a["end"] for a in r["atts"] if a["end"]] or [r["start"]])
        r["green"] = sorted(a["kind"] for a in r["atts"] if a["state"] == "green")
        r["both_green"] = {"default", "owner"} <= set(r["green"])
        r["wall"] = round((r["end"] - r["start"]).total_seconds() / 60, 1)
        r["machine"] = round(sum(a["machine"] for a in r["atts"]), 1)
        r["uat"] = any(a["uat"] for a in r["atts"])
    bg = [r for r in rounds if r["both_green"] and r["uat"] and all(new_layout(a) for a in r["atts"])]
    res["both_phone_green_rounds_new_layout_uat"] = {
        "n": len(bg), "wall_median": med([r["wall"] for r in bg]), "wall_slowest": mx([r["wall"] for r in bg]),
        "machine_median": med([r["machine"] for r in bg]), "machine_slowest": mx([r["machine"] for r in bg]),
        "runs": [[a["run_id"] for a in r["atts"]] for r in bg],
    }

    # ---- releases: the window between two published tags
    pubs = []
    for a in atts:
        if a["wf"] == "release-apk.yml" and a["ref"].startswith("v") and a["jobs"].get("publish", (0, ""))[1] == "success":
            pubs.append((a["end"], a["ref"], a))
    pubs.sort(key=lambda x: x[0])
    seen = set()
    pubs = [p for p in pubs if not (p[1] in seen or seen.add(p[1]))]
    rel = []
    prev = None
    for end, tag, a in pubs:
        if prev is not None:
            inwin = lambda x: x["start"] and prev < x["start"] <= end
            rs = [r for r in rounds if prev < r["start"] <= end]
            w = [x for x in atts if is_whole(x) and inwin(x)]
            first = min([r["start"] for r in rs] or [None], default=None) if rs else None
            rel.append({
                "tag": tag, "published": end.isoformat() + "Z", "prev_published": prev.isoformat() + "Z",
                "days_since_prev": round((end - prev).total_seconds() / 86400, 2),
                "rounds": len(rs), "rounds_uat": sum(1 for r in rs if r["uat"]),
                "rounds_both_green": sum(1 for r in rs if r["both_green"]),
                "whole_runs": len(w), "whole_green": sum(1 for x in w if x["state"] == "green"),
                "whole_red": sum(1 for x in w if x["state"] == "red"),
                "whole_cancelled": sum(1 for x in w if x["state"] == "cancelled"),
                "partial_runs": sum(1 for x in atts if x["kind"] == "partial" and inwin(x)),
                "journey_runs": sum(1 for x in atts if x["wf"] == "qa-journeys.yml" and inwin(x)),
                "release_runs_on_tag": sum(1 for x in atts if x["wf"] == "release-apk.yml" and x["ref"] == tag),
                "release_runs_red_on_tag": sum(1 for x in atts if x["wf"] == "release-apk.yml" and x["ref"] == tag and x["state"] == "red"),
                "hours_first_round_to_published": round((end - first).total_seconds() / 3600, 1) if first else None,
                "phone_machine_min": round(sum(x["machine"] for x in atts if x["wf"] == "qa-device.yml" and inwin(x)), 0),
                "all_gate_machine_min": round(sum(x["machine"] for x in atts if x["wf"] in (
                    "qa-device.yml", "qa-journeys.yml", "qa-conditions.yml", "release-apk.yml") and inwin(x)), 0),
            })
        prev = end
    res["releases"] = rel
    with_rounds = [r for r in rel if r["rounds"]]
    res["release_summary"] = {
        "releases_in_window": len(rel), "releases_with_a_whole_round": len(with_rounds),
        "rounds_mean": round(statistics.mean([r["rounds"] for r in with_rounds]), 1) if with_rounds else None,
        "rounds_median": med([r["rounds"] for r in with_rounds]),
        "rounds_max": mx([r["rounds"] for r in with_rounds]),
        "hours_median": med([r["hours_first_round_to_published"] for r in with_rounds]),
        "hours_mean": round(statistics.mean([r["hours_first_round_to_published"] for r in with_rounds]), 1) if with_rounds else None,
        "hours_max": mx([r["hours_first_round_to_published"] for r in with_rounds]),
        "partials_mean": round(statistics.mean([r["partial_runs"] for r in rel]), 1) if rel else None,
        "phone_machine_hours_mean": round(statistics.mean([r["phone_machine_min"] for r in rel]) / 60, 1) if rel else None,
    }
    # 0.79.0 is the one release whose rounds carry their own tags (qa-rel-079 .. 079j).
    q = [a for a in atts if a["ref"].startswith("qa-rel-079")]
    tags = sorted({a["ref"] for a in q})
    res["qa_rel_079"] = {
        "tags": tags,
        "whole_runs": sum(1 for a in q if is_whole(a)), "whole_green": sum(1 for a in q if is_whole(a) and a["state"] == "green"),
        "partial_runs": sum(1 for a in q if a["kind"] == "partial"),
        "first_start": min(a["start"] for a in q).isoformat() + "Z" if q else None,
        "last_end": max(a["end"] for a in q if a["end"]).isoformat() + "Z" if q else None,
        "hours": round((max(a["end"] for a in q if a["end"]) - min(a["start"] for a in q)).total_seconds() / 3600, 1) if q else None,
        "machine_min": round(sum(a["machine"] for a in q if a["wf"] != "ci.yml"), 0),
        "per_tag": [{"tag": t, "whole": [(a["kind"], a["state"], a["wall"], a["run_id"]) for a in q if a["ref"] == t and is_whole(a)],
                     "partials": sum(1 for a in q if a["ref"] == t and a["kind"] == "partial")} for t in tags],
    }

    # ---- rounds on commits where the app itself did not change (local git, no API)
    res["no_app_change"] = no_app_change(atts)
    json.dump(res, open(os.path.join(WORK, "E3-numbers.json"), "w", encoding="utf-8"), indent=1, default=str)
    print("wrote E3-numbers.json;", len(atts), "run attempts,", len(rounds), "rounds,", len(rel), "releases")


# ------------------------------------------------------------------ changed paths (local git)

def klass(path):
    if path.startswith("apps/mobile/qa/"):
        return "phone-test files"
    if path.startswith("docs/") or path.endswith(".md"):
        return "docs"
    if path.startswith("scripts/ci/") or path.startswith(".github/"):
        return "ci scripts"
    if path.startswith("apps/mobile/test/") or "/e2e" in path or ".test." in path:
        return "unit/web tests"
    if path.startswith("apps/mobile/") or path.startswith("packages/") or path in ("package.json", "package-lock.json"):
        return "phone app"
    if path.startswith("apps/dashboard/") or path.startswith("apps/hq/") or path.startswith("deploy/"):
        return "web panels"
    if path.startswith("supabase/"):
        return "server"
    return "other"


def git(*args):
    p = subprocess.run(["git", "-C", ROOT] + list(args), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    return p.returncode, p.stdout


def no_app_change(atts):
    out = {}
    # (a) CI on main: what the pushed head commit itself touched (one git call for all commits).
    code, text = git("log", "--since=2026-10-17", "--name-only", "--format=@%H", "--all")
    files = {}
    cur = None
    for line in text.splitlines():
        if line.startswith("@"):
            cur = line[1:]
            files[cur] = []
        elif line.strip() and cur:
            files[cur].append(line.strip())
    ci = [a for a in atts if a["wf"] == "ci.yml" and a["event"] == "push" and a["attempt"] == 1]
    tally = collections.Counter()
    mins = collections.Counter()
    for a in ci:
        f = files.get(a["sha"])
        if f is None:
            k = "unknown (commit not in the local clone)"
        elif not f:
            k = "merge or empty commit"
        else:
            ks = {klass(p) for p in f}
            k = "docs only" if ks == {"docs"} else \
                "phone-test files only (+docs)" if ks <= {"phone-test files", "docs"} else \
                "nothing the phone app or the panels are built from (tests, CI scripts, docs)" if ks <= {"phone-test files", "docs", "ci scripts", "unit/web tests"} else \
                "code"
        tally[k] += 1
        mins[k] += a["machine"]
    out["ci_push_runs_by_head_commit"] = {k: {"runs": v, "machine_min": round(mins[k])} for k, v in tally.most_common()}
    out["ci_push_runs_total"] = len(ci)

    # (b) whole phone runs: what changed since the previous whole run on the same phone.
    prev = {}
    t2 = collections.Counter()
    m2 = collections.Counter()
    ex = collections.defaultdict(list)
    for a in sorted([a for a in atts if is_whole(a) and a["attempt"] == 1], key=lambda a: a["start"]):
        p = prev.get(a["kind"])
        prev[a["kind"]] = a
        if not p:
            continue
        if p["sha"] == a["sha"]:
            k = "same commit as the previous whole run on this phone"
        else:
            code, text = git("diff", "--name-only", p["sha"], a["sha"])
            if code != 0:
                k = "unknown (commit not in the local clone)"
            else:
                ks = {klass(x) for x in text.splitlines() if x.strip()}
                # app.json alone with only a version line is not checked here: it counts as "phone app".
                k = "phone app changed" if "phone app" in ks else \
                    "server or web panels changed, phone app not" if ks & {"server", "web panels", "other"} else \
                    "only phone-test files, CI scripts, unit tests or docs changed"
        t2[k] += 1
        m2[k] += a["machine"]
        if len(ex[k]) < 4:
            ex[k].append(a["run_id"])
    out["whole_runs_vs_previous_whole_run"] = {k: {"runs": v, "machine_min": round(m2[k]), "example_runs": ex[k]} for k, v in t2.most_common()}
    return out


# ------------------------------------------------------------------ per-flow times from 6 logs

def cmd_logs(tmp):
    sys.path.insert(0, os.path.join(MAP, "_sources"))
    import e1_history  # the token and transport E1 used (git credential helper; never printed)
    token = e1_history.get_token()
    os.makedirs(tmp, exist_ok=True)
    rows = [r for r in csv.DictReader(open(CSV, encoding="utf-8")) if r["run_id"] == LOG_RUN
            and re.match(r"device-qa \([1-6]-", r["job_name"])]
    nl = chr(10)
    hdr = nl.join(["Authorization: Bearer " + token, "Accept: application/vnd.github+json", "User-Agent: e3-gate-cost", ""])
    res = {"run_id": LOG_RUN, "shards": {}}
    line_re = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.\d+Z (.*)$")
    for r in sorted(rows, key=lambda r: r["job_name"]):
        f = os.path.join(tmp, r["job_id"] + ".log")
        subprocess.run(["curl", "-sS", "-L", "--max-time", "300", "-H", "@-", "-o", f,
                        "https://api.github.com/repos/%s/actions/jobs/%s/logs" % (REPO, r["job_id"])],
                       input=hdr.encode(), capture_output=True, timeout=330)
        marks = []
        first_qa = last_qa = None
        boot = None
        with open(f, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                m = line_re.match(line.lstrip("\ufeff"))
                if not m:
                    continue
                t = datetime.datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S")
                msg = m.group(2)
                if "[qa] " not in msg or "echo " in msg:
                    continue
                q = msg.split("[qa] ", 1)[1].strip()
                first_qa = first_qa or t
                last_qa = t
                s = re.match(r"(?:gate )?part (\S+) (?:start|begins)", q)
                if s:
                    marks.append((t, s.group(1)))
        os.remove(f)
        js, je = ts(r["job_started_at"]), ts(r["job_completed_at"])
        flows = []
        for i, (t, name) in enumerate(marks):
            nxt = marks[i + 1][0] if i + 1 < len(marks) else last_qa
            flows.append({"name": name, "minutes": round((nxt - t).total_seconds() / 60, 1)})
        res["shards"][r["job_name"]] = {
            "job_id": r["job_id"], "job_minutes": fnum(r["minutes"]),
            "setup_minutes_before_first_test_line": round((first_qa - js).total_seconds() / 60, 1) if first_qa else None,
            "before_first_part": round((marks[0][0] - first_qa).total_seconds() / 60, 1) if marks else None,
            "after_last_test_line": round((je - last_qa).total_seconds() / 60, 1) if last_qa else None,
            "flows": flows,
        }
        print(r["job_name"], len(marks), "parts")
    try:
        os.rmdir(tmp)
    except OSError:
        pass
    json.dump(res, open(os.path.join(WORK, "E3-flow-times.json"), "w", encoding="utf-8"), indent=1)


# ------------------------------------------------------------------ repeated work in the flow files

def flow_facts(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    lines = text.splitlines()
    words, subs = set(), []
    fresh = bool(re.search(r"launchApp:\s*\n(?:\s+.*\n)*?\s+clearState:\s*true", text))
    launches = len(re.findall(r"^\s*-\s*launchApp", text, re.M))

    def val(i, key):
        v = lines[i].split(key, 1)[1].strip()
        if not v and i + 1 < len(lines):
            m = re.match(r"\s+(?:text|id):\s*(.+)$", lines[i + 1])
            v = m.group(1).strip() if m else ""
        return v.strip("\"'")

    for i, l in enumerate(lines):
        if re.match(r"\s*-\s*assertVisible:", l):
            v = val(i, "assertVisible:")
            if v:
                words.add(v)
        elif re.match(r"\s+visible:", l):
            v = val(i, "visible:")
            if v:
                words.add(v)
        m = re.match(r"\s*-\s*runFlow:\s*(\S+\.yaml)?", l)
        if m:
            f = m.group(1)
            if not f and i + 1 < len(lines):
                m2 = re.match(r"\s+file:\s*(\S+)", lines[i + 1])
                f = m2.group(1) if m2 else None
            if f:
                subs.append(f.strip("\"'"))
    return {"words": words, "subs": subs, "fresh": fresh, "launches": launches, "lines": len(lines)}


def cmd_repeats():
    flows = {f: flow_facts(os.path.join(QA, f)) for f in sorted(os.listdir(QA)) if f.endswith(".yaml")}
    tops = {f: v for f, v in flows.items() if not f.startswith("sub-")}
    res = {"flow_files": len(flows), "sub_flows": len(flows) - len(tops)}
    res["flows_that_wipe_and_relaunch_the_app"] = sorted(f for f, v in flows.items() if v["fresh"])
    res["launchApp_steps_total"] = sum(v["launches"] for v in flows.values())
    use = collections.Counter()
    calls = collections.Counter()
    for f, v in flows.items():
        for s in set(v["subs"]):
            use[s] += 1
        for s in v["subs"]:
            calls[s] += 1
    res["most_shared_sub_flows"] = [{"sub_flow": s, "used_by_flows": n, "calls": calls[s]} for s, n in use.most_common(15)]
    wc = collections.Counter()
    for f, v in tops.items():
        for w in v["words"]:
            wc[w] += 1
    res["words_waited_for_or_asserted_in_most_flows"] = [{"words": w[:90], "flows": n} for w, n in wc.most_common(20)]
    pairs = []
    names = sorted(tops)
    for i, a in enumerate(names):
        A = tops[a]["words"]
        if len(A) < 8:
            continue
        for b in names[i + 1:]:
            B = tops[b]["words"]
            if len(B) < 8:
                continue
            inter = len(A & B)
            j = inter / len(A | B)
            if j >= 0.5:
                pairs.append({"a": a, "b": b, "same_words": inter, "a_words": len(A), "b_words": len(B), "overlap": round(j, 2)})
    pairs.sort(key=lambda p: (-p["overlap"], -p["same_words"]))
    res["flow_pairs_checking_the_same_words"] = pairs[:25]
    res["flow_pairs_at_or_over_half"] = len(pairs)
    # how often run-device-qa.sh starts from a wiped app with the demo loaded
    sh = open(os.path.join(QA, "run-device-qa.sh"), encoding="utf-8", errors="replace").read()
    res["run_device_qa_calls"] = {f: len(re.findall(re.escape(f), sh)) for f in ("gate-demo.yaml", "pm clear", "adb install")}
    json.dump(res, open(os.path.join(WORK, "E3-repeats.json"), "w", encoding="utf-8"), indent=1)
    print("wrote E3-repeats.json;", len(flows), "flows,", len(pairs), "pairs at >= 0.5")


# ------------------------------------------------------------------ the report

def cmd_report():
    N = json.load(open(os.path.join(WORK, "E3-numbers.json"), encoding="utf-8"))
    F = json.load(open(os.path.join(WORK, "E3-flow-times.json"), encoding="utf-8"))
    R = json.load(open(os.path.join(WORK, "E3-repeats.json"), encoding="utf-8"))
    T = N["tables"]
    L = []
    A = L.append
    d, o = T["phone_uat_default"], T["phone_uat_owner"]
    both = N["both_phone_green_rounds_new_layout_uat"]
    rel_t, jr, ci, cond, wear = T["release_tag"], T["journeys"], T["ci_main"], T["conditions_all"], T["wear_build"]
    S = N["release_summary"]
    wall = round(both["wall_median"] + rel_t["wall_median"])
    machine = round(both["machine_median"] + jr["machine_median"] + ci["machine_median"] + rel_t["machine_median"])

    A("# What the release gate costs (audit step 3E / E3)")
    A("")
    A("Made by `docs/system-map/_tools/e3_gate_cost.py` from `docs/system-map/test-history.csv` (CI jobs, %s to %s UTC), the workflow files, the Maestro flow files and 6 job logs of run %s. Numbers behind every line: `docs/system-map/_work/E3-numbers.json`, `E3-flow-times.json`, `E3-repeats.json`."
      % (N["window"][0][:10], N["window"][1][:10], F["run_id"]))
    A("")
    A("## Headline")
    A("")
    A("**One release round = about %d minutes wall-clock (%.1f hours) and about %d machine minutes (%.0f machine hours), when everything passes first time.**"
      % (wall, wall / 60, machine, machine / 60))
    A("")
    A("- Wall-clock = the phone test on both phones at once with the release UAT (median %s min, slowest %s; %d green rounds since 12 Nov) + the release run after the tag (median %s min)."
      % (both["wall_median"], both["wall_slowest"], both["n"], rel_t["wall_median"]))
    A("- Machine minutes = both phones (%s) + journeys (%s) + CI on the commit (%s) + the release run (%s). Phone conditions (advisory, %s) and the watch build (%s) are extra when they run."
      % (both["machine_median"], jr["machine_median"], ci["machine_median"], rel_t["machine_median"], cond["machine_median"], wear["machine_median"]))
    A("- **A release needed %s rounds on average (median %s, worst %s)** in the last 30 days, over %d releases that had at least one whole round between them and the release before. From the first round to the published release: median %s hours, mean %s, worst %s."
      % (S["rounds_mean"], S["rounds_median"], S["rounds_max"], S["releases_with_a_whole_round"], S["hours_median"], S["hours_mean"], S["hours_max"]))
    A("- On top of the rounds, a release had %s partial phone runs on average, and the phone test alone used %s machine hours per release on average."
      % (S["partials_mean"], S["phone_machine_hours_mean"]))
    q = N["qa_rel_079"]
    A("- 0.79.0, the one release whose rounds are tagged (%s to %s, %d tags): %d whole runs (%d green), %d partial runs, %s hours from the first start to the last end, %d machine minutes."
      % (q["tags"][0], q["tags"][-1], len(q["tags"]), q["whole_runs"], q["whole_green"], q["partial_runs"], q["hours"], q["machine_min"]))
    A("")
    A("How a round is counted: whole phone runs started within %d minutes of each other are one round (normally one per phone). A release's rounds are the rounds started after the release before it was published. Whole runs done for other reasons in that time are counted too; the CSV cannot tell them apart." % ROUND_GAP_MIN)
    A("")
    A("## 1. What one phone release must pass today")
    A("")
    A("| # | Part | Workflow / job | Started by | Required to release? | Wall min (median / slowest) | Machine min (median / slowest) | Green runs measured |")
    A("|---|---|---|---|---|---|---|---|")

    def row(n, part, where, trig, req, t):
        A("| %s | %s | %s | %s | %s | %s / %s | %s / %s | %s |" % (n, part, where, trig, req, t["wall_median"], t["wall_slowest"],
                                                                 t["machine_median"], t["machine_slowest"], t["green_attempts"]))
    row(1, "Build check: types, unit tests, ratchets, panel crawl, database", "`ci.yml` check + database", "every push, any branch, no path filter (`ci.yml:9-14`)",
        "Yes. `phone_gate.py` waits for it on the release commit (`scripts/ci/phone_gate.py:32-34`)", ci)
    row(2, "Phone test, default phone, whole run + release UAT", "`qa-device.yml` plan, build, canary, shards 1-6, report", "by hand (`qa-device.yml:30-31`)",
        "Whole run: yes (`phone_gate.py:6-12`). The `uat` extra: not checked by the gate; it only adds checks (`qa-device.yml:61-62`)", d)
    row(3, "Phone test, owner phone (360 dp, font 1.3, IST), whole run + release UAT", "same workflow, `profile: owner`", "by hand", "Yes, same rule", o)
    row(4, "Cross-role journeys (phone + admin app + live server)", "`qa-journeys.yml` journeys", "by hand (`qa-journeys.yml:18-20`)",
        "Yes (`phone_gate.py:14-16`, `REQUIRED` line 126-127)", jr)
    row(5, "Phone conditions (offline, flaky, killed, Doze, upgrade)", "`qa-conditions.yml` previous, build old + new, conditions", "by hand (`qa-conditions.yml:36-37`)",
        "No: advisory (`qa-conditions.yml:33`)", cond)
    row(6, "Watch build, watch unit tests, watch UAT on 3 watch emulators", "`wear-build.yml` build + uat", "push to main touching watch paths, or by hand (`wear-build.yml:16-33`)",
        "No: the gate does not read it. The watch's unit tests run again inside part 7", wear)
    row(7, "Release run: phone-gate, build (types, unit tests, watch tests, APK + AAB + watch), release checks, update proof, publish, Play upload",
        "`release-apk.yml` phone-gate, build, update-proof, publish, play-upload", "pushing a `v*` tag (`release-apk.yml:48-51`)",
        "Yes; Play upload runs after publish, so it cannot block the GitHub release (`release-apk.yml:448-450`)", rel_t)
    A("")
    A("Parts 2, 3 and 4 can run at the same time; part 7 can only start after they are green. Each phone passes on the release commit itself, or on a commit up to 8 back when only docs, unit tests, CI scripts or the version line changed since (`phone_gate.py:18-30`, `MAX_WALK = 8`).")
    A("")
    A("### Inside each part (minutes per job, green runs only)")
    A("")
    for key in ("phone_uat_default", "phone_uat_owner", "phone_plain_new", "phone_uat_old", "phone_plain_old", "journeys", "conditions_all", "release_tag", "ci_main", "wear_build", "play_upload_manual"):
        t = T[key]
        A("**%s**: %d green runs, e.g. %s. Wall %s / %s, machine %s / %s." % (t["label"], t["green_attempts"], ", ".join(t["example_runs"]) or "none",
                                                                              t["wall_median"], t["wall_slowest"], t["machine_median"], t["machine_slowest"]))
        A("")
        if not t["jobs"]:
            continue
        A("| Job | Runs | Median | Slowest |")
        A("|---|---|---|---|")
        for n, v in sorted(t["jobs"].items(), key=lambda kv: -(kv[1]["median"] or 0)):
            if "${{" in n:
                continue
            A("| %s | %s | %s | %s |" % (n, v["n"], v["median"], v["slowest"]))
        A("")

    A("## 2. Rounds per release (last 30 days)")
    A("")
    A("| Release | Published (UTC) | Days since the one before | Rounds (with UAT) | Rounds green on both phones | Whole runs: green / red / cancelled | Partial runs | Journey runs | Release runs on the tag (red) | Hours, first round to published | Phone-test machine min |")
    A("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in N["releases"]:
        A("| %s | %s | %s | %s (%s) | %s | %s / %s / %s | %s | %s | %s (%s) | %s | %d |" % (
            r["tag"], r["published"][:16].replace("T", " "), r["days_since_prev"], r["rounds"], r["rounds_uat"], r["rounds_both_green"],
            r["whole_green"], r["whole_red"], r["whole_cancelled"], r["partial_runs"], r["journey_runs"], r["release_runs_on_tag"],
            r["release_runs_red_on_tag"], r["hours_first_round_to_published"] if r["hours_first_round_to_published"] is not None else "no whole round",
            r["phone_machine_min"]))
    A("")
    A("0.79.0 by its own tags:")
    A("")
    A("| Tag | Whole runs (phone, result, wall min, run id) | Partial runs |")
    A("|---|---|---|")
    for t in q["per_tag"]:
        A("| %s | %s | %s |" % (t["tag"], "; ".join("%s %s %s min (%s)" % tuple(w) for w in t["whole"]) or "none", t["partials"]))
    A("")

    A("## 3. The 20 slowest parts of a whole round")
    A("")
    A("From the 6 shard logs of the green owner-phone round %s (17 Nov 2026): each `[qa] part X start` line to the next one. A name ending `_seed` is the wipe + demo data load before a part." % F["run_id"])
    A("")
    allf = []
    seeds = []
    for sh, v in F["shards"].items():
        for f in v["flows"]:
            allf.append((f["minutes"], f["name"], sh))
            if f["name"].endswith("seed"):
                seeds.append(f["minutes"])
    allf.sort(reverse=True)
    A("| # | Part (log name) | Shard | Minutes |")
    A("|---|---|---|---|")
    for i, (m, n, sh) in enumerate(allf[:20], 1):
        A("| %d | %s | %s | %s |" % (i, n, sh.replace("device-qa ", ""), m))
    A("")
    A("Per shard in that round:")
    A("")
    A("| Shard | Job minutes | Setup before the first test line (boot, Maestro, emulator) | Parts | Test minutes | After the last test line (summary, upload) |")
    A("|---|---|---|---|---|---|")
    setups = []
    for sh, v in sorted(F["shards"].items()):
        tm = round(sum(f["minutes"] for f in v["flows"]) + (v["before_first_part"] or 0), 1)
        setups.append((v["setup_minutes_before_first_test_line"] or 0) + (v["after_last_test_line"] or 0))
        A("| %s | %s | %s | %d | %s | %s |" % (sh.replace("device-qa ", ""), v["job_minutes"], v["setup_minutes_before_first_test_line"], len(v["flows"]), tm, v["after_last_test_line"]))
    A("")
    A("Wipe + demo loads (`*seed` parts) in that one round: %d of them, %.0f minutes in total (median %.1f each)." % (len(seeds), sum(seeds), statistics.median(seeds) if seeds else 0))
    A("")

    A("## 4. Repeated work")
    A("")
    A("### 4a. The same thing done more than once in a round (measured)")
    A("")
    A("- **The whole phone test runs twice, once per phone**: %s + %s machine minutes (medians). By design (`phone_gate.py:6-12`)." % (d["machine_median"], o["machine_median"]))
    bq = d["jobs"].get("build", {}).get("median")
    A("- **The app is built from the same commit up to 6 times per release**: once per phone run (`qa-device.yml` build, median %s min each, two runs), once in journeys (inside its %s min), twice in conditions (old + new, median %s and %s), once in the release run (build job median %s). Only the release build is a different build (signed, ARM); the two phone-run builds and the journeys build are the same x86_64 test build." % (
        bq, jr["wall_median"], cond["jobs"].get("build (new)", {}).get("median"), cond["jobs"].get("build (old)", {}).get("median"), rel_t["jobs"].get("build", {}).get("median")))
    A("- **Wipe + demo data load before most UAT parts**: %d loads, %.0f minutes in one round on one phone (section 3). `gate-demo.yaml` is called %d times in `run-device-qa.sh`." % (
        len(seeds), sum(seeds), R["run_device_qa_calls"]["gate-demo.yaml"]))
    A("- **The canary re-runs two parts that shard 6 also runs** (u444, u401: `qa_shards.py` CANARY and UAT_SPLIT): median %s min per phone, a deliberate fail-fast cost." % d["jobs"].get("device-qa (0-canary)", {}).get("median"))
    aff = [a for a in (d["jobs"].get("device-qa (0-affected)"), o["jobs"].get("device-qa (0-affected)")) if a]
    A("- **The 0-affected piece re-runs parts the shards run anyway** (`qa-device.yml:19-22`): %s." % (
        "; ".join("%s green runs, median %s min, slowest %s" % (a["n"], a["median"], a["slowest"]) for a in aff) or "no green run carried it in the measured set"))
    A("- **Emulator setup per shard**: about %.0f minutes of each shard is boot, installs and upload, not tests (section 3); with 7 pieces per phone and 2 phones that is about %.0f machine minutes a round." % (
        statistics.median(setups), statistics.median(setups) * 14))
    A("- **Watch unit tests** run in `wear-build.yml` and again in the release run's build job (`release-apk.yml:150-154`). **Types and unit tests** run in `ci.yml` and again in the release run (`release-apk.yml:107-116`).")
    A("")
    A("### 4b. Rounds that re-tested an app that had not changed")
    A("")
    A("Whole phone runs, compared with the whole run before them on the same phone (local git diff of the two commits):")
    A("")
    A("| What changed since the previous whole run on that phone | Whole runs | Machine minutes | Example runs |")
    A("|---|---|---|---|")
    for k, v in N["no_app_change"]["whole_runs_vs_previous_whole_run"].items():
        A("| %s | %d | %d | %s |" % (k, v["runs"], v["machine_min"], ", ".join(v["example_runs"])))
    A("")
    A("CI on a push (`ci.yml` has no path filter, so every push runs the full check), by what the pushed head commit touched (%d push runs):" % N["no_app_change"]["ci_push_runs_total"])
    A("")
    A("| Head commit touched | CI runs | Machine minutes |")
    A("|---|---|---|")
    for k, v in N["no_app_change"]["ci_push_runs_by_head_commit"].items():
        A("| %s | %d | %d |" % (k, v["runs"], v["machine_min"]))
    A("")
    A("### 4c. Flow files that open the same screens and check the same words")
    A("")
    A("%d flow files (%d shared sub-flows). %d of them wipe the app and start it fresh; %d `launchApp` steps in all. Compared by script: the set of words each top-level flow waits for or asserts (`assertVisible` and `visible:` lines); %d pairs share half or more."
      % (R["flow_files"], R["sub_flows"], len(R["flows_that_wipe_and_relaunch_the_app"]), R["launchApp_steps_total"], R["flow_pairs_at_or_over_half"]))
    A("")
    A("| Flow A | Flow B | Same words | Words in A / B | Overlap |")
    A("|---|---|---|---|---|")
    for p in R["flow_pairs_checking_the_same_words"]:
        A("| %s | %s | %d | %d / %d | %s |" % (p["a"], p["b"], p["same_words"], p["a_words"], p["b_words"], p["overlap"]))
    A("")
    A("Sub-flows used by the most flow files:")
    A("")
    A("| Sub-flow | Used by flow files | Calls |")
    A("|---|---|---|")
    for s in R["most_shared_sub_flows"]:
        A("| %s | %d | %d |" % (s["sub_flow"], s["used_by_flows"], s["calls"]))
    A("")
    A("Words waited for or asserted in the most top-level flows:")
    A("")
    A("| Words | Flows |")
    A("|---|---|")
    for w in R["words_waited_for_or_asserted_in_most_flows"]:
        A("| `%s` | %d |" % (w["words"].replace("|", "\\|"), w["flows"]))
    A("")

    A("## 5. Parallel room")
    A("")
    sh = {n: v for n, v in o["jobs"].items() if re.match(r"device-qa \([1-6]-", n)}
    longest = max(sh.items(), key=lambda kv: kv[1]["median"])
    total = sum(v["median"] for v in sh.values())
    setup = statistics.median(setups)
    build = o["jobs"]["build"]["median"]
    work = total - setup * len(sh)
    chain = F["shards"].get("device-qa (1-history-routines)", {})
    chain_min = round(sum(f["minutes"] for f in chain.get("flows", [])) + (chain.get("before_first_part") or 0), 1)
    uatc = sum(f["minutes"] for f in F["shards"].get("device-qa (4-workout)", {}).get("flows", []))
    A("Owner phone, whole run + UAT, medians of %d green runs (the default phone is within a few minutes):" % o["green_attempts"])
    A("")
    A("- Pieces at once now: 7 per phone (canary + 6 shards; 8 when the 0-affected piece runs), so 14 to 16 emulators for a round on both phones.")
    A("- Shard minutes: %s. Sum %.0f." % (", ".join("%s %s" % (n.replace("device-qa ", ""), v["median"]) for n, v in sorted(sh.items())), total))
    A("- **Longest shard: %s, median %s min, slowest %s.** The shortest is %s min. The round waits for the longest." % (
        longest[0].replace("device-qa ", ""), longest[1]["median"], longest[1]["slowest"], min(v["median"] for v in sh.values())))
    A("- Round length now = build %s + longest shard %s + report 1 = **%.0f min** (measured wall median %s)." % (build, longest[1]["median"], build + longest[1]["median"] + 1, o["wall_median"]))
    A("- Test work without the per-shard setup (%.0f min each): %.0f min." % (setup, work))
    A("")
    A("| Shards | Balanced shard = setup + work / shards | Round = build + shard + report | Saved against today |")
    A("|---|---|---|---|")
    now = build + longest[1]["median"] + 1
    for n in (6, 8, 10, 12):
        b = setup + work / n
        A("| %d | %.0f min | %.0f min | %.0f min |" % (n, b, build + b + 1, now - (build + b + 1)))
    A("")
    A("Limits on balancing, from the files: parts A to R are one chain that must stay in one shard (`qa_shards.py:9-14`); in the read round that chain was %s test minutes, so no shard plan goes under about %.0f min for the shard and **%.0f min for the round** unless the chain is cut. The UAT chain `uatc` must also stay in one piece (`qa_shards.py:55-57`); with W it was %.0f test minutes. Every other u-part starts from a fresh install and can move freely."
      % (chain_min, setup + chain_min, build + setup + chain_min + 1, uatc))
    A("")
    A("So with today's 6 shards, only moving u-parts out of 6-uat-c into the short shards (2-gym-backup, 3-uat-a) brings the round from about %.0f to about %.0f minutes; 8 shards would not be faster than that until the A to R chain is split." % (
        now, max(build + setup + work / 6 + 1, build + setup + chain_min + 1)))
    A("")
    A("## What could not be measured")
    A("")
    A("- Which whole runs were release rounds and which were routine checks: the CSV has no such mark, so every whole run between two releases is counted for the later release.")
    A("- Per-part times come from ONE green round (6 logs, the brief's limit), not a median over many.")
    A("- How long the app build takes inside the journeys job (one job, no step times in the CSV): unknown.")
    A("- Waiting time between a red round and the next start (fixing time) is inside the hours figure and cannot be split from machine time.")
    A("- CI push runs are classed by the head commit only; a push of several commits may hide a code change behind a docs commit.")
    A("- Queue time before a job starts is not in the wall-clock figures (first job start to last job end).")
    open(os.path.join(MAP, "test-gate-cost.md"), "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print("wrote test-gate-cost.md,", len(L), "lines")


if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else ""
    if c == "csv":
        cmd_csv()
    elif c == "logs":
        cmd_logs(sys.argv[2])
    elif c == "repeats":
        cmd_repeats()
    elif c == "report":
        cmd_report()
    else:
        print(__doc__)
