#!/usr/bin/env python3
"""Release gate: a release may only be built from a commit the cloud phone test passed on.

Called by .github/workflows/release-apk.yml before the Gradle build (audit QA-03).

Passes when ONE of these is true:
  1. A qa-device.yml run with conclusion "success" exists for the tagged commit itself.
  2. A qa-device.yml run passed on a recent first-parent ANCESTOR (up to MAX_WALK commits back),
     AND the ancestor -> tag diff touches ONLY things that never change the installed app:
       - PROGRESS.md, CONTEXT.md, anything under docs/
       - unit tests (apps/mobile/test/**) and the CI scripts (scripts/ci/**)
       - apps/mobile/app.json, where every changed line is the "version" line
     (e.g. a unit-test fix, then "bump the version, update PROGRESS", on top of the tested one).
  3. A MANUAL run (workflow_dispatch) with the input skip_phone_gate=true. Tag pushes never skip.

Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_REF, GITHUB_REF_TYPE, GITHUB_REF_NAME,
     GITHUB_EVENT_NAME, SKIP_PHONE_GATE ("true" to skip; honoured only for workflow_dispatch),
     QA_WORKFLOW (default qa-device.yml), GITHUB_STEP_SUMMARY (optional).
Exit 0 = pass, 1 = blocked.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
QA_WORKFLOW = os.environ.get("QA_WORKFLOW", "qa-device.yml")

PAPERWORK_FILES = {"PROGRESS.md", "CONTEXT.md"}
# None of these is built into the APK: notes, unit tests (vitest only) and the CI check scripts.
PAPERWORK_DIRS = ("docs/", "apps/mobile/test/", "scripts/ci/")
MAX_WALK = 8
APP_JSON = "apps/mobile/app.json"
VERSION_LINE = re.compile(r'^\s*"version"\s*:\s*"[^"]*"\s*,?\s*$')

lines = []


def say(msg):
    print(msg, flush=True)
    lines.append(msg)


def api(path):
    req = urllib.request.Request(API + path)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def summary(ok, headline):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        f.write("## Phone-test gate: " + ("PASSED" if ok else "BLOCKED") + "\n\n")
        f.write(headline + "\n\n")
        for l in lines:
            f.write("- " + l.replace("\n", " ") + "\n")
        f.write("\n")


def tag_commit(tag, fallback):
    """The commit a tag points at. An annotated tag points at a tag object first."""
    try:
        ref = api(f"/repos/{REPO}/git/ref/tags/{tag}")
    except urllib.error.HTTPError as e:
        say(f"could not read tag {tag} ({e.code}); using GITHUB_SHA")
        return fallback
    obj = ref["object"]
    hops = 0
    while obj["type"] == "tag" and hops < 5:
        obj = api(f"/repos/{REPO}/git/tags/{obj['sha']}")["object"]
        hops += 1
    if obj["type"] != "commit":
        raise SystemExit(f"tag {tag} does not point at a commit (type {obj['type']})")
    return obj["sha"]


def green_runs(sha):
    data = api(f"/repos/{REPO}/actions/workflows/{QA_WORKFLOW}/runs?head_sha={sha}&status=success&per_page=20")
    return [r for r in data.get("workflow_runs", []) if r.get("conclusion") == "success" and r.get("head_sha") == sha]


def only_paperwork(base, head):
    """True when base...head changes only release paperwork. Strict: anything unclear is a no."""
    cmp = api(f"/repos/{REPO}/compare/{base}...{head}")
    if cmp.get("status") != "ahead" or not (1 <= (cmp.get("ahead_by") or 0) <= MAX_WALK):
        say(f"tested commit -> tag is not a short straight line (status {cmp.get('status')}, ahead_by {cmp.get('ahead_by')})")
        return False
    files = cmp.get("files") or []
    if not files or len(files) >= 300:
        say(f"compare returned {len(files)} files; cannot prove the change is paperwork only")
        return False
    ok = True
    for f in files:
        name, status = f.get("filename", ""), f.get("status", "")
        if status == "renamed" and f.get("previous_filename") and not is_paperwork_path(f["previous_filename"]):
            say(f"NOT paperwork: {name} (renamed from {f['previous_filename']})")
            ok = False
            continue
        if is_paperwork_path(name):
            say(f"paperwork: {name} ({status})")
            continue
        if name == APP_JSON and status == "modified":
            patch = f.get("patch")
            if patch is None:
                say(f"NOT provable: {name} has no patch in the compare result")
                ok = False
                continue
            changed = [l[1:] for l in patch.splitlines()
                       if l[:1] in "+-" and not l.startswith("+++") and not l.startswith("---")]
            bad = [l for l in changed if not VERSION_LINE.match(l)]
            if bad or not changed:
                say(f"NOT paperwork: {name} changes more than its version line: {bad[:3]!r}")
                ok = False
            else:
                say(f"paperwork: {name} (version line only)")
            continue
        say(f"NOT paperwork: {name} ({status})")
        ok = False
    return ok


def is_paperwork_path(name):
    return name in PAPERWORK_FILES or name.startswith(PAPERWORK_DIRS)


def main():
    event = os.environ.get("GITHUB_EVENT_NAME", "")
    ref_type = os.environ.get("GITHUB_REF_TYPE", "")
    ref_name = os.environ.get("GITHUB_REF_NAME", "")
    skip = os.environ.get("SKIP_PHONE_GATE", "").strip().lower() == "true"

    if skip:
        if event == "workflow_dispatch":
            say("::warning::Phone-test gate SKIPPED by the manual input skip_phone_gate=true. This build was not proven on the cloud phone.")
            summary(True, "**Skipped on request (manual run).** Nothing here was proven on the cloud phone.")
            return 0
        say(f"skip_phone_gate ignored: only manual runs may skip (this is a {event} run)")

    sha = os.environ.get("GITHUB_SHA", "")
    if ref_type == "tag":
        sha = tag_commit(ref_name, sha)
    say(f"commit under release: {sha[:12]} ({ref_type} {ref_name})")

    runs = green_runs(sha)
    if runs:
        r = runs[0]
        say(f"phone test passed on this exact commit: run {r['id']} ({r['html_url']})")
        summary(True, f"Phone test **passed** on this commit: [run {r['id']}]({r['html_url']}).")
        return 0
    say("no passing phone test on this exact commit")

    # Walk back along first parents to the nearest commit the phone test passed on.
    cur = sha
    for step in range(1, MAX_WALK + 1):
        commit = api(f"/repos/{REPO}/commits/{cur}")
        parents = [p["sha"] for p in commit.get("parents", [])]
        if len(parents) != 1:
            say(f"{cur[:12]} has {len(parents)} parents; the walk stops here")
            break
        cur = parents[0]
        prun = green_runs(cur)
        if not prun:
            say(f"no passing phone test on {cur[:12]} ({step} back)")
            continue
        r = prun[0]
        say(f"phone test passed on {cur[:12]} ({step} back): run {r['id']} ({r['html_url']}); checking the diff")
        if only_paperwork(cur, sha):
            summary(True, f"Phone test **passed** on `{cur[:12]}` ([run {r['id']}]({r['html_url']})); everything after it changes only notes, unit tests, CI scripts or the version.")
            return 0
        say("the commits after it change the app itself, so that pass does not cover this release")
        break

    msg = (f"Run the phone test on this commit first: Actions > '{QA_WORKFLOW}' > Run workflow on "
           f"{sha[:12]} (or on the commit before a version-bump-only commit). Then re-run this release.")
    print("::error::" + msg, flush=True)
    lines.append(msg)
    summary(False, "**Blocked.** " + msg)
    return 1


if __name__ == "__main__":
    sys.exit(main())
