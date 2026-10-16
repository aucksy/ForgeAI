#!/usr/bin/env python3
"""Release gate: a release may only be built from a commit the cloud phone test passed on.

Called by .github/workflows/release-apk.yml before the Gradle build (audit QA-03).

Audit v2 (16 Oct 2026): the phone test must have passed on BOTH phones (PHONES), each a WHOLE
run on API 34 (qa-device.yml run names, see run_kind):
  - "default": the emulator as it boots (411 dp, font 1.0, UTC), the phone every release was
    proven on until now ("Device QA (Android emulator ...)");
  - "owner": the owner's own phone (360 dp, font 1.3, Asia/Kolkata), where the old flows used to
    miss what sat below the screen's edge ("Device QA (owner phone, api 34 ...)").
A partial run ("(partial ...)": some parts only, or another Android version) never counts.

Each phone passes when ONE of these is true:
  1. A qa-device.yml run of that kind with conclusion "success" exists for the tagged commit itself.
  2. One passed on a recent first-parent ANCESTOR (up to MAX_WALK commits back),
     AND the ancestor -> tag diff touches ONLY things that never change the installed app:
       - PROGRESS.md, CONTEXT.md, anything under docs/
       - unit tests (apps/mobile/test/**) and the CI scripts (scripts/ci/**)
       - apps/mobile/app.json, where every changed line is the "version" line
     (e.g. a unit-test fix, then "bump the version, update PROGRESS", on top of the tested one).
  3. A MANUAL run (workflow_dispatch) with the input skip_phone_gate=true. Tag pushes never skip.

AND (14 Oct 2026) the build check (ci.yml: typecheck + unit tests + silent-catch ratchet) must have
passed on the commit under release; one still running is waited for (up to 25 minutes). v0.38.0
and v0.39.0 went out while ci.yml was red on their commits, because nothing here looked at it.

Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_REF, GITHUB_REF_TYPE, GITHUB_REF_NAME,
     GITHUB_EVENT_NAME, SKIP_PHONE_GATE ("true" to skip; honoured only for workflow_dispatch),
     QA_WORKFLOW (default qa-device.yml), GITHUB_STEP_SUMMARY (optional).
Exit 0 = pass, 1 = blocked.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
QA_WORKFLOW = os.environ.get("QA_WORKFLOW", "qa-device.yml")
CI_WORKFLOW = os.environ.get("CI_WORKFLOW", "ci.yml")
CI_WAIT_SECONDS = int(os.environ.get("CI_WAIT_SECONDS", "1500"))

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


# The two phones a release must pass on (audit v2, 16 Oct 2026), in the order they are reported.
# The owner phone joined on 16 Oct 2026, once both whole runs were green on 77d5c5d: owner
# 38921849919 (+ Monkey), default 38921852434. The default stays too: two parallel free runs.
PHONES = ("default", "owner")
PHONE_WORDS = {
    "default": "the default emulator (profile default)",
    "owner": "the owner's phone (profile owner: 360 dp, font 1.3)",
}


def run_kind(title):
    """PURE. Which phone a qa-device.yml run proved, from its run name; None = it proves nothing.
    A PARTIAL run (`only`, or an API other than 34) ran a few parts or another Android, so it never
    opens the gate. A whole owner-profile run on API 34 is named "Device QA (owner phone, ...)";
    every other whole run is the default emulator ("Device QA (Android emulator ...)", or the
    caller's name when a release workflow calls it)."""
    t = title or ""
    if "(partial" in t:
        return None
    if "(owner phone" in t:
        return "owner"
    return "default"


def green_runs(sha, kind):
    data = api(f"/repos/{REPO}/actions/workflows/{QA_WORKFLOW}/runs?head_sha={sha}&status=success&per_page=50")
    return [r for r in data.get("workflow_runs", []) if r.get("conclusion") == "success" and r.get("head_sha") == sha
            and run_kind(r.get("display_title")) == kind]


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


def ci_verdict(runs):
    """'pass', 'fail' or 'wait' for the build-check runs of one commit. PURE."""
    done = [r for r in runs if r.get("status") == "completed"]
    if any(r.get("conclusion") == "success" for r in done):
        return "pass"
    if any(r.get("status") != "completed" for r in runs):
        return "wait"
    return "fail"


def ci_ok(sha):
    """The build check passed on `sha` (waits for a run still going)."""
    deadline = time.time() + CI_WAIT_SECONDS
    while True:
        data = api(f"/repos/{REPO}/actions/workflows/{CI_WORKFLOW}/runs?head_sha={sha}&per_page=20")
        runs = [r for r in data.get("workflow_runs", []) if r.get("head_sha") == sha]
        verdict = ci_verdict(runs)
        if verdict == "pass":
            r = next(r for r in runs if r.get("conclusion") == "success")
            say(f"build check passed on this commit: run {r['id']} ({r['html_url']})")
            return True
        if verdict == "fail":
            say(f"::error::The build check ({CI_WORKFLOW}) did not pass on {sha[:12]}"
                + (f" (run {runs[0]['id']}: {runs[0].get('conclusion')})" if runs else " (no run found)")
                + ". Fix it before releasing.")
            return False
        if time.time() > deadline:
            say(f"::error::The build check on {sha[:12]} is still running after {CI_WAIT_SECONDS // 60} minutes.")
            return False
        say("build check still running; waiting 30 s")
        time.sleep(30)


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

    covered = {}
    for kind in PHONES:
        found = cover(sha, kind)
        if found:
            covered[kind] = found
    missing = [k for k in PHONES if k not in covered]
    if not missing:
        if not ci_ok(sha):
            summary(False, "**Blocked.** The phone test passed on both phones, but the build check (typecheck + unit tests) did not pass on this commit.")
            return 1
        summary(True, "Phone test **passed** on both phones: " + "; ".join(
            f"{PHONE_WORDS[k]}: [run {r['id']}]({r['html_url']}) on `{c[:12]}`" for k, (c, r) in covered.items())
            + ". Build check passed too.")
        return 0

    need = " and ".join(PHONE_WORDS[k] for k in missing)
    msg = (f"Run the phone test on this commit first, a whole run on API 34 for {need}: Actions > "
           f"'{QA_WORKFLOW}' > Run workflow on {sha[:12]} (or on the commit before a version-bump-only "
           f"commit), `only` empty, `profile` = " + " / ".join(missing) + ". Then re-run this release.")
    print("::error::" + msg, flush=True)
    lines.append(msg)
    summary(False, "**Blocked.** " + msg)
    return 1


def cover(sha, kind):
    """(commit, run) of a passing whole run of this kind that covers `sha`, or None: on `sha`
    itself, or on a recent first-parent ancestor with only paperwork after it."""
    runs = green_runs(sha, kind)
    if runs:
        r = runs[0]
        say(f"{kind}: phone test passed on this exact commit: run {r['id']} ({r['html_url']})")
        return sha, r
    say(f"{kind}: no passing phone test on this exact commit")
    cur = sha
    for step in range(1, MAX_WALK + 1):
        commit = api(f"/repos/{REPO}/commits/{cur}")
        parents = [p["sha"] for p in commit.get("parents", [])]
        if len(parents) != 1:
            say(f"{kind}: {cur[:12]} has {len(parents)} parents; the walk stops here")
            return None
        cur = parents[0]
        prun = green_runs(cur, kind)
        if not prun:
            say(f"{kind}: no passing phone test on {cur[:12]} ({step} back)")
            continue
        r = prun[0]
        say(f"{kind}: phone test passed on {cur[:12]} ({step} back): run {r['id']} ({r['html_url']}); checking the diff")
        if only_paperwork(cur, sha):
            say(f"{kind}: everything after {cur[:12]} changes only notes, unit tests, CI scripts or the version")
            return cur, r
        say(f"{kind}: the commits after it change the app itself, so that pass does not cover this release")
        return None
    return None

if __name__ == "__main__":
    sys.exit(main())
