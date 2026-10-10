#!/usr/bin/env python3
"""Checks on the BUILT release APK, before it is published (audit H1: QA-01, QA-05, QA-26).

Usage:
  release_checks.py <apk>                       all checks (release-apk.yml)
  release_checks.py <apk> --only permissions --warn-only
                                                just the permission list, never fails
                                                (qa-device.yml: shows the real list early)

Checks (FAIL blocks the release, WARN is reported only):
  a. signing   FAIL if apksigner cannot verify the APK.
               FAIL if ALLOWED_CERT_SHA256 (comma-separated SHA-256 fingerprints) is set and the
               signer is not in it. When it is unset the fingerprint is printed and allowed (today
               the public React Native debug key signs; that is called out as a WARN).
  b. version   FAIL if versionCode is not above the last published release's, or versionName
               (semver) is not above it.
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


def check_signing(apk):
    code, out = run([build_tool("apksigner"), "verify", "--print-certs", apk])
    if code != 0:
        report("signing", "FAIL", "apksigner could not verify the APK:\n" + out[-1500:])
        return
    digests = [d.lower().replace(":", "") for d in re.findall(r"certificate SHA-256 digest: ([0-9a-fA-F:]+)", out)]
    if not digests:
        report("signing", "FAIL", "apksigner printed no SHA-256 certificate digest")
        return
    allowed = {a.strip().lower().replace(":", "") for a in os.environ.get("ALLOWED_CERT_SHA256", "").split(",") if a.strip()}
    for d in digests:
        tag = " (the PUBLIC React Native debug key)" if d == PUBLIC_DEBUG_KEY else ""
        if allowed:
            if d in allowed:
                report("signing", "PASS", f"signed by an allowed key {d}{tag}")
            else:
                report("signing", "FAIL", f"signed by {d}{tag}, which is not in ALLOWED_CERT_SHA256")
        else:
            lvl = "WARN" if tag else "INFO"
            report("signing", lvl, f"signed by {d}{tag}; ALLOWED_CERT_SHA256 is not set, so any key is accepted")


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


def check_version_and_size(apk, me):
    tag = os.environ.get("GITHUB_REF_NAME", "")
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
    ap.add_argument("apk")
    ap.add_argument("--only", choices=["permissions"])
    ap.add_argument("--warn-only", action="store_true")
    ap.add_argument("--out-dir")
    a = ap.parse_args()

    if a.only == "permissions":
        check_permissions(a.apk, a.warn_only, a.out_dir)
        write_summary("Permission list (compared with scripts/ci/approved-permissions.txt)")
        return 0

    me = badging(a.apk)
    report("apk", "INFO", f"{me['package']} versionName {me['versionName']} versionCode {me['versionCode']} "
                          f"minSdk {me['minSdk']} targetSdk {me['targetSdk']}")
    check_signing(a.apk)
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
