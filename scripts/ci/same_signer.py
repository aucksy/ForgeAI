#!/usr/bin/env python3
"""The watch APK must be signed by the same key as the phone APK (v0.46, the Wear OS companion).

The Wear Data Layer only connects a phone app and a watch app with the same package name AND the
same signing certificate. The phone APK is signed with key rotation (v1/v2 = the old debug key,
v3 = the release key + lineage from Android 9); the watch APK gets the same arguments
(scripts/ci/sign_rotated.sh). This reads both signing blocks and requires that every Android
version a watch can run (Wear OS 3 = API 30 up to Wear OS 6 = API 36) sees the SAME certificate
in both. Public data only; no secrets.

Usage: python3 scripts/ci/same_signer.py PHONE.apk WEAR.apk
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update_proof as up  # noqa: E402

WATCH_APIS = (30, 31, 32, 33, 34, 35, 36)


def compare(phone, wear):
    """[(api, phone scheme, phone sha, wear scheme, wear sha, same)] for each watch API level."""
    rows = []
    for api in WATCH_APIS:
        ps, pc = up.cert_for(phone, api)
        ws, wc = up.cert_for(wear, api)
        rows.append((api, ps, up.sha256_hex(pc) if pc else None, ws, up.sha256_hex(wc) if wc else None, pc is not None and pc == wc))
    return rows


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    phone, wear = open(argv[1], "rb").read(), open(argv[2], "rb").read()
    ok = True
    for api, ps, pc, ws, wc, same in compare(phone, wear):
        print(f"API {api}: phone {ps} {pc} | watch {ws} {wc} -> {'same' if same else 'DIFFERENT'}")
        ok = ok and same
    if not ok:
        print("::error::The watch APK is not signed by the same key as the phone APK: the watch app would never hear from the phone.")
        return 1
    print("Watch and phone APKs are signed by the same key on every watch Android version.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
