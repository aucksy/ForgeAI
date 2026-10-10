#!/usr/bin/env python3
"""Checks on the BUILT release APK, before it is published (audit H1: QA-01, QA-05, QA-26).

Usage:
  release_checks.py <apk>                       all checks (release-apk.yml)
  release_checks.py <apk> --only permissions --warn-only
                                                just the permission list, never fails
                                                (qa-device.yml: shows the real list early)
  release_checks.py --version-code 0.33.0         print the versionCode for a version (33000)

Checks (FAIL blocks the release, WARN is reported only):
  a. signing   FAIL if apksigner cannot verify the APK.
               When ALLOWED_CERT_SHA256 (comma-separated SHA-256 fingerprints) is set, the APK must
               carry the key-rotation signature (docs/RELEASE-SIGNING.md, audit DS-02 / QA-01):
                 - what Android 7-8 phones read (v1/v2, API minSdk..27) = the public debug key ONLY
                   (TRANSITION_FROM_DEBUG_KEY: every installed copy up to v0.31.0 has that key);
                 - what Android 9+ phones read (v3, API 28+) = an allowed key, never the debug key;
                 - the proof-of-rotation lineage runs debug key -> allowed key.
               Anything else FAILs (new key only breaks every installed copy; debug only means
               the rotation never ran). When it is unset the fingerprints are printed and allowed
               (debug-signed builds: forks, or before the key secrets exist), with a WARN.
  b. version   FAIL if versionCode is not above the last published release's, or versionName
               (semver) is not above it, or versionCode is not the one derived from the version
               (MAJOR*1_000_000 + MINOR*1_000 + PATCH; audit QA-26).
  c. permissions  FAIL if the APK's permission list differs from scripts/ci/approved-permissions.txt.
  d. 16 KB     WARN if `zipalign -c -P 16 -v 4` fails or a lib/arm64-v8a/*.so has a LOAD segment
               aligned below 16 KB (Android 15+ devices with 16 KB pages; a Play requirement).
  e. size      WARN if the APK grew more than 25% against the last release's APK.

Env: ANDROID_HOME / ANDROID_SDK_ROOT (build-tools), GITHUB_TOKEN, GITHUB_REPOSITORY,
     GITHUB_REF_NAME, ALLOWED_CERT_SHA256, GITHUB_STEP_SUMMARY, RUNNER_TEMP.
"""
import argparse
import glob
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
APPROVED = os.path.join(HERE, "approved-permissions.txt")
API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
# The React Native template's stock debug key (apps/mobile/android/app/debug.keystore, public).
PUBLIC_DEBUG_KEY = "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c"
SIZE_GROWTH_WARN = 0.25

# Key rotation (docs/RELEASE-SIGNING.md). Every copy of ForgeAI installed up to v0.31.0 is signed
# with PUBLIC_DEBUG_KEY. Android 7-8 (API 24-27) only read the v1/v2 signature and refuse an update
# whose v1/v2 signer differs from the installed one, so that slot must stay the debug key for as
# long as minSdk is below 28. Android 9+ read the v3 signature: the release key plus a lineage that
# proves the debug key handed over to it. Set this to False only if every phone that matters has
# been reinstalled from a release-key-only build (then any non-allowed signer FAILs).
TRANSITION_FROM_DEBUG_KEY = True
ROTATION_MIN_SDK = 28  # = --rotation-min-sdk-version in release-apk.yml; v3 exists from API 28

# versionCode = MAJOR*1_000_000 + MINOR*1_000 + PATCH (audit QA-26). Releases up to v0.31.0 used the
# release workflow's run number instead: v0.31.0 was run #45 (versionCode 45, the highest ever
# published), so 0.32.0 -> 32000 is far above every old code and the codes never go backwards
# again, even if the workflow is renamed or recreated and its run number restarts at 1.
LEGACY_MAX_VERSION_CODE = 45

results = []  # (check, "PASS"|"FAIL"|"WARN"|"INFO", text)


def report(check, level, text):
    results.append((check, level, text))
    prefix = {"FAIL": "::error::", "WARN": "::warning::"}.get(level, "")
    print(f"{prefix}[{check}] {level}: {text}", flush=True)


def build_tool(name):
    for root in (os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT")):
        if not root:
            continue
        dirs = sorted(glob.glob(os.path.join(root, "build-tools", "*")),
                      key=lambda p: [int(x) if x.isdigit() else 0 for x in re.split(r"[.\-]", os.path.basename(p))])
        for d in reversed(dirs):
            p = os.path.join(d, name)
            if os.path.exists(p):
                return p
    raise SystemExit(f"build tool '{name}' not found under $ANDROID_HOME/build-tools")


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def api(path):
    req = urllib.request.Request(API + path)
    req.add_header("Accept", "application/vnd.github+json")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def semver(s):
    m = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", (s or "").strip())
    return tuple(int(x) for x in m.groups()) if m else None


def version_code_for(version):
    """versionCode for 'x.y.z' (or 'x.y.z-dryrun.N' from a manual run): x*1_000_000 + y*1_000 + z."""
    m = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)(?:-dryrun\.\d+)?", (version or "").strip())
    if not m:
        raise ValueError(f"version '{version}' is not x.y.z")
    major, minor, patch = (int(x) for x in m.groups())
    if minor > 999 or patch > 999 or major > 2099:
        raise ValueError(f"version '{version}' does not fit MAJOR*1_000_000 + MINOR*1_000 + PATCH")
    return major * 1_000_000 + minor * 1_000 + patch


def badging(apk):
    code, out = run([build_tool("aapt2"), "dump", "badging", apk])
    if code != 0:
        raise SystemExit("aapt2 dump badging failed:\n" + out[-2000:])
    m = re.search(r"package: name='([^']*)' versionCode='(\d+)' versionName='([^']*)'", out)
    if not m:
        raise SystemExit("could not read the package line from aapt2 badging")
    tsdk = re.search(r"targetSdkVersion:'(\d+)'", out)
    msdk = re.search(r"sdkVersion:'(\d+)'", out)
    return {"package": m.group(1), "versionCode": int(m.group(2)), "versionName": m.group(3),
            "targetSdk": tsdk.group(1) if tsdk else "?", "minSdk": msdk.group(1) if msdk else "?"}


def permissions(apk):
    code, out = run([build_tool("aapt2"), "dump", "permissions", apk])
    if code != 0:
        raise SystemExit("aapt2 dump permissions failed:\n" + out[-2000:])
    names = set()
    for line in out.splitlines():
        m = re.match(r"\s*uses-permission(?:-sdk-23)?: name='([^']+)'", line)
        if m:
            names.add(m.group(1))
    return names


def approved_list():
    names = set()
    with open(APPROVED, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if line:
                names.add(line)
    return names


def check_permissions(apk, warn_only, out_dir=None):
    have = permissions(apk)
    want = approved_list()
    if out_dir:
        with open(os.path.join(out_dir, "permissions.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(sorted(have)) + "\n")
    added, removed = sorted(have - want), sorted(want - have)
    if not added and not removed:
        report("permissions", "PASS", f"{len(have)} permissions, same as scripts/ci/approved-permissions.txt")
        return
    lvl = "WARN" if warn_only else "FAIL"
    diff = "; ".join([f"+ {p} (in the APK, not approved)" for p in added] +
                     [f"- {p} (approved, not in the APK)" for p in removed])
    report("permissions", lvl, "the APK's permissions differ from scripts/ci/approved-permissions.txt: " + diff)
    print("Full list in the APK:\n  " + "\n  ".join(sorted(have)))


def norm_digest(d):
    return d.strip().lower().replace(":", "")


def parse_signers(text):
    """Every '<label> certificate SHA-256 digest: <hex>' line of apksigner output, in order, as
    (label, digest, min_sdk, max_sdk). min/max come from labels such as
    'V3 Signer (minSdkVersion=24, maxSdkVersion=27)' (printed when v3.1 is present); otherwise None."""
    out = []
    for m in re.finditer(r"^(.*?) certificate SHA-256 digest: ([0-9a-fA-F:]+)\s*$", text, re.M):
        label = m.group(1).strip()
        r = re.search(r"minSdkVersion=(\d+).*?maxSdkVersion=(\d+)", label)
        lo, hi = (int(r.group(1)), int(r.group(2))) if r else (None, None)
        out.append((label, norm_digest(m.group(2)), lo, hi))
    return out


def parse_schemes(text):
    """{'v1': True, 'v2': True, 'v3': True, 'v3.1': False, ...} from `apksigner verify -v`."""
    return {m.group(1): m.group(2) == "true"
            for m in re.finditer(r"^Verified using (v[\d.]+) scheme[^:]*: (true|false)\s*$", text, re.M)}


def digests_for_range(text, lo, hi):
    """Unique signer digests in `text` that apply to API lo..hi (labels without a range always do)."""
    seen = []
    for _label, d, a, b in parse_signers(text):
        if (a is None or (a <= hi and b >= lo)) and d not in seen:
            seen.append(d)
    return seen


def _name(d, allowed):
    if d == PUBLIC_DEBUG_KEY:
        return f"{d} (the PUBLIC React Native debug key)"
    return f"{d} (an allowed release key)" if d in allowed else f"{d} (NOT in ALLOWED_CERT_SHA256)"


def evaluate_signing(full, old_range, new_range, lineage, allowed, min_sdk, transition=None):
    """Pure decision logic of the signing check, over captured apksigner output.

    full       `apksigner verify -v --print-certs <apk>`
    old_range  same with --max-sdk-version 27 (what Android 7-8 read); None when minSdk >= 28
    new_range  same with --min-sdk-version 28 (what Android 9+ read)
    lineage    `apksigner lineage --in <apk> --print-certs` ('' when the APK has none)
    Returns [(level, text)].
    """
    transition = TRANSITION_FROM_DEBUG_KEY if transition is None else transition
    out = []
    every = digests_for_range(full, 0, 1 << 31)
    newd = digests_for_range(new_range, ROTATION_MIN_SDK, 1 << 31)
    oldd = digests_for_range(old_range, 0, ROTATION_MIN_SDK - 1) if old_range is not None else []
    if not every:
        return [("FAIL", "apksigner printed no SHA-256 certificate digest")]

    if not allowed:
        for d in every:
            tag = " (the PUBLIC React Native debug key)" if d == PUBLIC_DEBUG_KEY else ""
            out.append(("WARN" if tag else "INFO",
                        f"signed by {d}{tag}; ALLOWED_CERT_SHA256 is not set, so any key is accepted"))
        if set(every) == {PUBLIC_DEBUG_KEY}:
            out.append(("WARN", "debug-signed build: the release-key rotation did not run (no ANDROID_KEYSTORE_* "
                                "secrets), so this APK has the same public key as v0.31.0 and earlier"))
        return out

    if not transition or old_range is None:
        # Only the v3 (or, with minSdk >= 28, every) signer matters: all must be allowed keys.
        pool = newd if old_range is None and transition else every
        bad = [d for d in pool if d not in allowed or d == PUBLIC_DEBUG_KEY]
        if not pool or bad:
            out.append(("FAIL", "signed by " + ", ".join(_name(d, allowed) for d in (bad or pool))
                        + "; every signer must be in ALLOWED_CERT_SHA256"))
        else:
            out.append(("PASS", "signed by allowed key(s) " + ", ".join(pool)))
        return out

    # Transition: v1/v2 = debug key (Android 7-8), v3 = allowed key + lineage from the debug key.
    old_s, new_s = parse_schemes(old_range), parse_schemes(new_range)
    ok = True
    if not (old_s.get("v2") or old_s.get("v1")):
        out.append(("FAIL", f"no v1/v2 signature verifies for API {min_sdk}-{ROTATION_MIN_SDK - 1}: "
                            "Android 7-8 phones could not install it"))
        ok = False
    if oldd != [PUBLIC_DEBUG_KEY]:
        why = ("Android 7-8 phones (they read only v1/v2) would see a different key from the debug key every "
               "installed copy has, and refuse the update (INSTALL_FAILED_UPDATE_INCOMPATIBLE)")
        if oldd and all(d in allowed for d in oldd):
            why = "the APK is signed with the NEW key only: " + why
        out.append(("FAIL", f"API {min_sdk}-{ROTATION_MIN_SDK - 1} signer(s) "
                            + (", ".join(_name(d, allowed) for d in oldd) or "none") + "; " + why))
        ok = False
    if not new_s.get("v3"):
        out.append(("FAIL", f"no v3 signature verifies for API {ROTATION_MIN_SDK}+: the key-rotation step did not "
                            "run (are the ANDROID_KEYSTORE_* secrets set?)"))
        ok = False
    if newd == [PUBLIC_DEBUG_KEY]:
        out.append(("FAIL", f"API {ROTATION_MIN_SDK}+ phones see the PUBLIC debug key only: the key-rotation step did "
                            "not run (are the ANDROID_KEYSTORE_* secrets set?)"))
        ok = False
    elif not newd or any(d not in allowed or d == PUBLIC_DEBUG_KEY for d in newd):
        out.append(("FAIL", f"API {ROTATION_MIN_SDK}+ signer(s) "
                            + (", ".join(_name(d, allowed) for d in newd) or "none")
                            + "; it must be exactly one allowed release key"))
        ok = False
    chain = [d for _l, d, _a, _b in parse_signers(lineage or "")]
    if len(chain) < 2 or chain[0] != PUBLIC_DEBUG_KEY or chain[-1] not in allowed or (newd and chain[-1] != newd[-1]):
        out.append(("FAIL", "the proof-of-rotation lineage does not run from the debug key to the allowed release key "
                            f"(lineage: {' -> '.join(chain) or 'none'}): Android 9+ phones would refuse the update"))
        ok = False
    if ok:
        out.append(("PASS", f"Android 7-8 (API {min_sdk}-{ROTATION_MIN_SDK - 1}) see the debug key every installed copy "
                            f"has: {PUBLIC_DEBUG_KEY}"))
        out.append(("PASS", f"Android 9+ (API {ROTATION_MIN_SDK}+) see the allowed release key {newd[0]}"))
        out.append(("PASS", "lineage " + " -> ".join(chain) + " proves the debug key handed over to the release key"))
    return out


def check_signing(apk, min_sdk):
    tool = build_tool("apksigner")
    code, full = run([tool, "verify", "-v", "--print-certs", apk])
    if code != 0:
        report("signing", "FAIL", "apksigner could not verify the APK:\n" + full[-1500:])
        return
    old_range = None
    if min_sdk < ROTATION_MIN_SDK:
        code, old_range = run([tool, "verify", "-v", "--print-certs", "--max-sdk-version", str(ROTATION_MIN_SDK - 1), apk])
        if code != 0:
            report("signing", "FAIL", f"apksigner could not verify the APK for API {min_sdk}-{ROTATION_MIN_SDK - 1}:\n"
                   + old_range[-1500:])
            return
    code, new_range = run([tool, "verify", "-v", "--print-certs", "--min-sdk-version", str(max(min_sdk, ROTATION_MIN_SDK)), apk])
    if code != 0:
        report("signing", "FAIL", f"apksigner could not verify the APK for API {ROTATION_MIN_SDK}+:\n" + new_range[-1500:])
        return
    code, lineage = run([tool, "lineage", "--in", apk, "--print-certs"])
    if code != 0:
        print("apksigner lineage: none in this APK (" + lineage.strip()[-300:] + ")", flush=True)
        lineage = ""
    allowed = {norm_digest(a) for a in os.environ.get("ALLOWED_CERT_SHA256", "").split(",") if a.strip()}
    for level, text in evaluate_signing(full, old_range, new_range, lineage, allowed, min_sdk):
        report("signing", level, text)


def previous_release(current_tag):
    """The highest-semver published (not draft, not prerelease) release other than this tag."""
    best = None
    for page in (1, 2, 3):
        rels = api(f"/repos/{REPO}/releases?per_page=100&page={page}")
        for r in rels:
            if r.get("draft") or r.get("prerelease") or r.get("tag_name") == current_tag:
                continue
            v = semver(r.get("tag_name"))
            if v and (best is None or v > best[0]):
                best = (v, r)
        if len(rels) < 100:
            break
    return best[1] if best else None


def download(url, dest):
    # browser_download_url of a public repo: no token. (A token would be carried onto the storage
    # redirect, which then refuses the request.)
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)


def check_version_code_scheme(me):
    """QA-26: the versionCode must be the one derived from the versionName, never a run number."""
    try:
        want = version_code_for(me["versionName"])
    except ValueError as e:
        report("version", "FAIL", f"{e}: the versionCode cannot be derived from it (audit QA-26)")
        return
    if me["versionCode"] != want:
        report("version", "FAIL", f"versionCode {me['versionCode']} is not {want} = MAJOR*1_000_000 + MINOR*1_000 + PATCH "
                                  f"of {me['versionName']} (audit QA-26)")
    else:
        report("version", "PASS", f"versionCode {want} is derived from {me['versionName']} "
                                  f"(above every run-number code up to {LEGACY_MAX_VERSION_CODE})")


def check_version_and_size(apk, me):
    tag = os.environ.get("GITHUB_REF_NAME", "")
    check_version_code_scheme(me)
    try:
        prev = previous_release(tag)
    except Exception as e:  # noqa: BLE001 - any API failure must stop the release, loudly
        report("version", "FAIL", f"could not list the published releases: {e}")
        return
    if not prev:
        report("version", "INFO", "no earlier published release found; nothing to compare")
        return
    ptag = prev["tag_name"]
    asset = next((a for a in prev.get("assets", []) if a["name"].endswith(".apk")), None)

    mine, theirs = semver(me["versionName"]), semver(ptag)
    if mine is None:
        report("version", "INFO", f"versionName '{me['versionName']}' is not x.y.z (a manual run?); name not compared")
    elif mine <= theirs:
        report("version", "FAIL", f"versionName {me['versionName']} is not above the last release {ptag}")
    else:
        report("version", "PASS", f"versionName {me['versionName']} > {ptag}")

    if not asset:
        report("version", "FAIL", f"release {ptag} has no .apk asset, so versionCode cannot be compared")
        return
    with tempfile.TemporaryDirectory(dir=os.environ.get("RUNNER_TEMP")) as td:
        dest = os.path.join(td, "previous.apk")
        try:
            download(asset["browser_download_url"], dest)
            old = badging(dest)
        except Exception as e:  # noqa: BLE001
            report("version", "FAIL", f"could not read {asset['name']} from {ptag}: {e}")
            old = None
    if old:
        if me["versionCode"] <= old["versionCode"]:
            report("version", "FAIL", f"versionCode {me['versionCode']} is not above {ptag}'s {old['versionCode']}: phones would refuse the update")
        else:
            report("version", "PASS", f"versionCode {me['versionCode']} > {ptag}'s {old['versionCode']}")

    new_size, old_size = os.path.getsize(apk), asset.get("size") or 0
    if old_size:
        growth = (new_size - old_size) / old_size
        text = f"APK {new_size / 1e6:.1f} MB vs {ptag} {old_size / 1e6:.1f} MB ({growth:+.0%})"
        report("size", "WARN" if growth > SIZE_GROWTH_WARN else "PASS", text)


def elf_load_aligns(data):
    """Smallest PT_LOAD p_align in an ELF file, or None when it is not a readable ELF."""
    if data[:4] != b"\x7fELF":
        return None
    is64, little = data[4] == 2, data[5] == 1
    e = "<" if little else ">"
    if is64:
        phoff, = struct.unpack_from(e + "Q", data, 0x20)
        phentsize, phnum = struct.unpack_from(e + "HH", data, 0x36)
    else:
        phoff, = struct.unpack_from(e + "I", data, 0x1C)
        phentsize, phnum = struct.unpack_from(e + "HH", data, 0x2A)
    aligns = []
    for i in range(phnum):
        off = phoff + i * phentsize
        p_type, = struct.unpack_from(e + "I", data, off)
        if p_type != 1:
            continue
        p_align, = struct.unpack_from(e + "Q", data, off + 48) if is64 else struct.unpack_from(e + "I", data, off + 28)
        aligns.append(p_align)
    return min(aligns) if aligns else None


def check_16k(apk):
    code, out = run([build_tool("zipalign"), "-c", "-P", "16", "-v", "4", apk])
    if code == 0:
        report("16KB", "PASS", "zipalign -c -P 16: the APK's native libraries are 16 KB aligned in the zip")
    else:
        bad = [l.strip() for l in out.splitlines() if "BAD" in l][:10]
        report("16KB", "WARN", "zipalign -c -P 16 failed (would not install on 16 KB-page phones): " + "; ".join(bad))
    low = []
    with zipfile.ZipFile(apk) as z:
        libs = [n for n in z.namelist() if n.startswith("lib/arm64-v8a/") and n.endswith(".so")]
        for n in libs:
            a = elf_load_aligns(z.read(n))
            if a is not None and a < 16384:
                low.append(f"{os.path.basename(n)} ({a})")
    if not libs:
        report("16KB", "WARN", "no lib/arm64-v8a/*.so in the APK")
    elif low:
        report("16KB", "WARN", f"{len(low)} of {len(libs)} arm64 libraries have LOAD segments aligned below 16 KB: " + ", ".join(low))
    else:
        report("16KB", "PASS", f"all {len(libs)} arm64 libraries have 16 KB-aligned LOAD segments")


def write_summary(title):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"## {title}\n\n| Check | Result | Detail |\n|---|---|---|\n")
        for c, lvl, t in results:
            f.write(f"| {c} | {lvl} | {t.replace('|', '/').replace(chr(10), ' ')} |\n")
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("apk", nargs="?")
    ap.add_argument("--only", choices=["permissions"])
    ap.add_argument("--warn-only", action="store_true")
    ap.add_argument("--out-dir")
    ap.add_argument("--version-code", metavar="VERSION", help="print the versionCode for x.y.z and exit")
    a = ap.parse_args()

    if a.version_code:
        try:
            print(version_code_for(a.version_code))
        except ValueError as e:
            print(f"::error::{e}", file=sys.stderr)
            return 1
        return 0
    if not a.apk:
        ap.error("the APK path is required")

    if a.only == "permissions":
        check_permissions(a.apk, a.warn_only, a.out_dir)
        write_summary("Permission list (compared with scripts/ci/approved-permissions.txt)")
        return 0

    me = badging(a.apk)
    report("apk", "INFO", f"{me['package']} versionName {me['versionName']} versionCode {me['versionCode']} "
                          f"minSdk {me['minSdk']} targetSdk {me['targetSdk']}")
    check_signing(a.apk, int(me["minSdk"]) if me["minSdk"].isdigit() else 24)
    check_version_and_size(a.apk, me)
    check_permissions(a.apk, a.warn_only, a.out_dir)
    check_16k(a.apk)
    write_summary("Release checks")
    failed = [r for r in results if r[1] == "FAIL"]
    if failed and not a.warn_only:
        print(f"::error::{len(failed)} release check(s) failed; the release is not published.", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
