#!/usr/bin/env python3
"""Proof, before a release is published, that phones with the PREVIOUS release take the new APK as
an in-place update and keep their data (release-apk.yml job `update-proof`; docs/RELEASE-SIGNING.md).

Subcommands:
  fetch  --dest PATH            download the previous published release's APK (the same release the
                                release checks compare against); writes found/tag to $GITHUB_OUTPUT
  static --old OLD --new NEW    read both APKs' signing blocks: Android 7-8 (v2) must see the SAME
                                key in both; reports what Android 9+ (v3) see
  device --old OLD --new NEW --out DIR
                                on a running emulator (adb on PATH): install OLD, launch it, write a
                                marker into its data, `adb install -r` NEW, then require: install
                                succeeded, same firstInstallTime, the new versionName, the marker
                                survived, and the package's signature moved to the new key with the
                                old key in its past signatures (dumpsys).

Exit 0 = proven, 1 = not. No secrets are used or needed: everything here is public.
"""
import argparse
import os
import re
import struct
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import release_checks as rc  # noqa: E402

PKG = "com.forgeai.app"
APK_SIG_BLOCK_MAGIC = b"APK Sig Block 42"
V2_ID, V3_ID, V31_ID = 0x7109871A, 0xF05368C0, 0x1B93AD61

results = []


def report(check, level, text):
    results.append((check, level, text))
    prefix = {"FAIL": "::error::", "WARN": "::warning::"}.get(level, "")
    print(f"{prefix}[{check}] {level}: {text}", flush=True)


# ---------------------------------------------------------------- APK signing block (pure)

def _u32(b, o):
    return struct.unpack_from("<I", b, o)[0]


def _lp(b, o):
    n = _u32(b, o)
    if o + 4 + n > len(b):
        raise ValueError("length-prefixed field runs past its parent")
    return b[o + 4:o + 4 + n], o + 4 + n


def _lp_seq(b):
    items, o = [], 0
    while o < len(b):
        item, o = _lp(b, o)
        items.append(item)
    return items


def signing_block_pairs(data):
    """{block id: value bytes} of the APK Signing Block (empty when the APK has none)."""
    eocd = data.rfind(b"PK\x05\x06", max(0, len(data) - 65557))
    if eocd < 0:
        raise ValueError("not a zip: no end-of-central-directory record")
    cd = _u32(data, eocd + 16)
    if cd < 32 or data[cd - 16:cd] != APK_SIG_BLOCK_MAGIC:
        return {}
    size = struct.unpack_from("<Q", data, cd - 24)[0]
    start = cd - size - 8
    if start < 0 or struct.unpack_from("<Q", data, start)[0] != size:
        raise ValueError("APK Signing Block sizes disagree")
    pairs, o, end = {}, start + 8, cd - 24
    while o < end:
        n = struct.unpack_from("<Q", data, o)[0]
        pid = _u32(data, o + 8)
        pairs[pid] = data[o + 12:o + 8 + n]
        o += 8 + n
    return pairs


def signers(data):
    """[(scheme, min_sdk, max_sdk, first certificate DER)] for the v2, v3 and v3.1 blocks."""
    out = []
    pairs = signing_block_pairs(data)
    for pid, scheme in ((V2_ID, "v2"), (V3_ID, "v3"), (V31_ID, "v3.1")):
        if pid not in pairs:
            continue
        seq, _ = _lp(pairs[pid], 0)
        for signer in _lp_seq(seq):
            signed, o = _lp(signer, 0)
            lo, hi = (_u32(signer, o), _u32(signer, o + 4)) if scheme != "v2" else (0, 0x7FFFFFFF)
            _digests, so = _lp(signed, 0)
            certs, _ = _lp(signed, so)
            out.append((scheme, lo, hi, _lp_seq(certs)[0]))
    return out


def cert_for(data, sdk):
    """The certificate a phone running API `sdk` checks: v3.1 (API 33+), then v3 (API 28+) for that
    API, then v2 (API 24-27 read only v1/v2)."""
    sig = signers(data)
    for scheme, first_api in (("v3.1", 33), ("v3", 28)):
        if sdk < first_api:
            continue
        for s, lo, hi, cert in sig:
            if s == scheme and lo <= sdk <= hi:
                return scheme, cert
    for s, _lo, _hi, cert in sig:
        if s == "v2":
            return "v2", cert
    return None, None


def java_hash_hex(der):
    """android.content.pm.Signature.hashCode() (= Arrays.hashCode(cert DER)) as dumpsys prints it."""
    h = 1
    for b in der:
        h = (31 * h + (b - 256 if b > 127 else b)) & 0xFFFFFFFF
    return format(h, "x")


def sha256_hex(der):
    import hashlib
    return hashlib.sha256(der).hexdigest()


# ---------------------------------------------------------------- dumpsys (pure)

def parse_dumpsys(text):
    """Fields of `dumpsys package <pkg>` that the proof compares."""
    vn = re.search(r"\bversionName=(\S+)", text)
    vc = re.search(r"\bversionCode=(\d+)", text)
    sig = re.search(r"signatures=PackageSignatures\{\S+ version:(\d+), signatures:\[([^\]]*)\], past signatures:\[([^\]]*)\]", text)
    past = []
    if sig and sig.group(3).strip():
        past = [p.strip().split(" ")[0] for p in sig.group(3).split(",") if p.strip()]
    return {
        "versionName": vn.group(1) if vn else None,
        "versionCode": int(vc.group(1)) if vc else None,
        "firstInstallTime": re.findall(r"\bfirstInstallTime=([^\n\r]+?)\s*$", text, re.M),
        "sigVersion": int(sig.group(1)) if sig else None,
        "signatures": [x.strip() for x in sig.group(2).split(",") if x.strip()] if sig else [],
        "pastSignatures": past,
    }


# ---------------------------------------------------------------- subcommands

def cmd_fetch(a):
    tag = os.environ.get("GITHUB_REF_NAME", "")
    prev = rc.previous_release(tag)
    found, ptag = "false", ""
    if not prev:
        print("::notice::No earlier published release: nothing to update from, so there is nothing to prove.")
    else:
        ptag = prev["tag_name"]
        asset = next((x for x in prev.get("assets", []) if x["name"].endswith(".apk")), None)
        if not asset:
            print(f"::error::Release {ptag} has no .apk asset to update from.")
            return 1
        rc.download(asset["browser_download_url"], a.dest)
        print(f"Previous release {ptag}: {asset['name']} ({os.path.getsize(a.dest) / 1e6:.1f} MB) -> {a.dest}")
        found = "true"
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"found={found}\ntag={ptag}\n")
    return 0


def cmd_static(a):
    old, new = open(a.old, "rb").read(), open(a.new, "rb").read()
    for name, data in (("previous", old), ("new", new)):
        for s, lo, hi, cert in signers(data):
            print(f"{name} APK {s} signer (API {lo}..{hi}): SHA-256 {sha256_hex(cert)}")
    _, old_v2 = cert_for(old, 27)
    _, new_v2 = cert_for(new, 27)
    if old_v2 is None or new_v2 is None:
        report("android-7-8", "FAIL", "an APK has no v2/v3 signer readable by Android 7-8")
    elif old_v2 == new_v2:
        report("android-7-8", "PASS", f"Android 7-8 see the same key in both APKs ({sha256_hex(new_v2)}): a normal update")
    else:
        report("android-7-8", "FAIL", f"Android 7-8 see {sha256_hex(old_v2)} installed but {sha256_hex(new_v2)} in the "
                                      "new APK: they would refuse the update")
    scheme, new_v3 = cert_for(new, 34)
    _, old_v3 = cert_for(old, 34)
    if new_v3 is not None and old_v3 is not None:
        same = "the same key as before" if new_v3 == old_v3 else "a NEW key (needs the lineage; the emulator proves it)"
        report("android-9+", "INFO", f"Android 9+ read the {scheme} signer {sha256_hex(new_v3)}: {same}")
    rc.results[:] = results
    rc.write_summary("Update proof: signatures (static)")
    return 1 if any(r[1] == "FAIL" for r in results) else 0


def adb(*args, timeout=600, check=False):
    p = subprocess.run(["adb", *args], capture_output=True, text=True, timeout=timeout)
    out = (p.stdout or "") + (p.stderr or "")
    if check and p.returncode != 0:
        raise RuntimeError(f"adb {' '.join(args)} failed: {out.strip()[-800:]}")
    return p.returncode, out


def dumpsys():
    return adb("shell", "dumpsys", "package", PKG)[1]


def launch(out_dir, label):
    adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")
    time.sleep(25)
    code, pid = adb("shell", "pidof", PKG)
    running = code == 0 and pid.strip() != ""
    adb("shell", "screencap", "-p", f"/sdcard/{label}.png")
    adb("pull", f"/sdcard/{label}.png", os.path.join(out_dir, f"{label}.png"))
    return running


def cmd_device(a):
    os.makedirs(a.out, exist_ok=True)
    old_bytes, new_bytes = open(a.old, "rb").read(), open(a.new, "rb").read()
    new_info = rc.badging(a.new)
    sdk = int(adb("shell", "getprop", "ro.build.version.sdk")[1].strip() or 0)
    abis = adb("shell", "getprop", "ro.product.cpu.abilist")[1].strip()
    print(f"Emulator API {sdk}, ABIs {abis}")
    _, old_cert = cert_for(old_bytes, sdk)
    _, new_cert = cert_for(new_bytes, sdk)
    old_hash = java_hash_hex(old_cert) if old_cert else None
    new_hash = java_hash_hex(new_cert) if new_cert else None

    adb("uninstall", PKG)
    code, out = adb("install", a.old)
    if "Success" not in out:
        report("install-old", "FAIL", f"the previous release would not install on this emulator: {out.strip()[-500:]}"
                                      + (" (no ABI the APK ships: the emulator needs ARM translation)" if "ABI" in out else ""))
        return finish(a.out)
    before = parse_dumpsys(dumpsys())
    report("install-old", "PASS", f"previous release installed: versionName {before['versionName']} "
                                  f"versionCode {before['versionCode']}, firstInstallTime {before['firstInstallTime']}")
    ran = launch(a.out, "1-previous-release")
    report("launch-old", "PASS" if ran else "WARN", "previous release " + ("is running after launch" if ran else
                                                                          "was not running 25 s after launch"))

    # A marker in the app's private data (google_apis images allow adb root; release builds forbid run-as).
    token = f"forgeai-update-proof-{int(time.time())}"
    marker = f"/data/data/{PKG}/files/update-proof-marker"
    have_marker = False
    if adb("root")[0] == 0:
        adb("wait-for-device", timeout=120)
        time.sleep(3)
        adb("shell", f"mkdir -p /data/data/{PKG}/files && echo {token} > {marker}")
        have_marker = adb("shell", "cat", marker)[1].strip() == token
    if have_marker:
        report("data", "INFO", f"wrote a marker into the app's private data ({marker})")
    else:
        report("data", "WARN", "could not write a marker into the app's data (no adb root); firstInstallTime is the proof")
    data_before = adb("shell", f"ls -R /data/data/{PKG}")[1]
    adb("shell", "am", "force-stop", PKG)

    if old_hash and before["signatures"]:
        if before["signatures"] == [old_hash]:
            report("signature", "INFO", f"installed signature {old_hash} = the previous APK's certificate (hash method confirmed)")
        else:
            report("signature", "WARN", f"installed signature {before['signatures']} != computed {old_hash}: "
                                        "the hash comparison below is unconfirmed")

    code, out = adb("install", "-r", a.new)
    with open(os.path.join(a.out, "install-r.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    if "Success" not in out:
        why = " - the signing keys do not match: every installed copy would refuse this release" \
            if "UPDATE_INCOMPATIBLE" in out else ""
        report("update", "FAIL", f"adb install -r of the new APK failed: {out.strip()[-500:]}{why}")
        return finish(a.out)
    report("update", "PASS", "adb install -r of the new APK succeeded (an in-place update)")

    after_text = dumpsys()
    with open(os.path.join(a.out, "dumpsys-after.txt"), "w", encoding="utf-8") as f:
        f.write(after_text)
    after = parse_dumpsys(after_text)
    if after["firstInstallTime"] and after["firstInstallTime"] == before["firstInstallTime"]:
        report("same-install", "PASS", f"firstInstallTime unchanged ({after['firstInstallTime'][0]}): updated, not reinstalled")
    else:
        report("same-install", "FAIL", f"firstInstallTime changed: {before['firstInstallTime']} -> {after['firstInstallTime']}")
    if after["versionName"] == new_info["versionName"] and after["versionCode"] == new_info["versionCode"]:
        report("version", "PASS", f"now versionName {after['versionName']} versionCode {after['versionCode']}")
    else:
        report("version", "FAIL", f"installed versionName {after['versionName']} versionCode {after['versionCode']}, "
                                  f"expected {new_info['versionName']} {new_info['versionCode']}")
    if have_marker:
        kept = adb("shell", "cat", marker)[1].strip() == token
        report("data", "PASS" if kept else "FAIL", "the marker in the app's data " + ("survived the update" if kept else "is GONE"))
    data_after = adb("shell", f"ls -R /data/data/{PKG}")[1]
    with open(os.path.join(a.out, "data-files.txt"), "w", encoding="utf-8") as f:
        f.write("BEFORE\n" + data_before + "\n\nAFTER\n" + data_after)

    rotated = old_cert is not None and new_cert is not None and old_cert != new_cert
    if rotated:
        sig_ok = after["signatures"] == [new_hash] and old_hash in after["pastSignatures"]
        detail = (f"signature version {after['sigVersion']}, signatures {after['signatures']} (new key {new_hash}), "
                  f"past signatures {after['pastSignatures']} (old key {old_hash})")
        if sig_ok:
            report("new-key", "PASS", "the phone now holds the app under the NEW key, with the old key in its history: " + detail)
        elif after["signatures"] and after["signatures"] != before["signatures"] and after["pastSignatures"]:
            report("new-key", "WARN", "the signature moved and has a history, but the hashes do not match the computed ones: " + detail)
        else:
            report("new-key", "FAIL", "the phone did not move the app to the new key: " + detail)
    else:
        report("new-key", "INFO", f"no key change for API {sdk} in this build (debug-signed): signatures {after['signatures']}")

    ran = launch(a.out, "2-new-release")
    report("launch-new", "PASS" if ran else "WARN", "updated app " + ("is running after launch" if ran else
                                                                     "was not running 25 s after launch (see logcat)"))
    return finish(a.out)


def finish(out_dir):
    code, log = adb("logcat", "-d", timeout=120)
    with open(os.path.join(out_dir, "logcat.txt"), "w", encoding="utf-8") as f:
        f.write(log)
    rc.results[:] = results
    rc.write_summary("Update proof: previous release -> this build on an emulator")
    failed = [r for r in results if r[1] == "FAIL"]
    if failed:
        print(f"::error::{len(failed)} update-proof check(s) failed; the release is not published.", flush=True)
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--dest", required=True)
    s = sub.add_parser("static")
    s.add_argument("--old", required=True)
    s.add_argument("--new", required=True)
    d = sub.add_parser("device")
    d.add_argument("--old", required=True)
    d.add_argument("--new", required=True)
    d.add_argument("--out", required=True)
    a = ap.parse_args()
    return {"fetch": cmd_fetch, "static": cmd_static, "device": cmd_device}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
