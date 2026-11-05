#!/usr/bin/env python3
"""R-336 (5 Nov 2026): write whats-new.json for a release, attached to the GitHub release next to the APK.

The member app's full-screen "A new MettleUp is here" lists the newest version's What's new lines, read
from https://github.com/aucksy/ForgeAI/releases/latest/download/whats-new.json (a plain file: no API
rate limit). The lines come from apps/mobile/src/lib/whatsNew.ts, read exactly as the Play upload reads
them (play_upload.whats_new_lines). The app shows the first 3.

Usage: python3 scripts/ci/whats_new_json.py <tag like v0.73.0> <whatsNew.ts> <out.json>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from play_upload import whats_new_lines  # noqa: E402

MAX_LINES = 3


def whats_new_payload(ts_source, version):
    """{"version": ..., "lines": [...]} for `version` (first 3 lines, whitespace tidied). PURE."""
    lines = [" ".join(t.split()) for t in whats_new_lines(ts_source, version)]
    return {"version": version, "lines": [t for t in lines if t][:MAX_LINES]}


def main(argv):
    if len(argv) != 4:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    tag, src, out = argv[1], argv[2], argv[3]
    m = re.fullmatch(r"v?(\d+\.\d+\.\d+)(?:-.*)?", tag)
    if not m:
        print(f"'{tag}' is not a version like v0.73.0", file=sys.stderr)
        return 2
    with open(src, encoding="utf-8") as f:
        payload = whats_new_payload(f.read(), m.group(1))
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    if not payload["lines"]:
        print(f"::warning::No What's new lines for {m.group(1)}: the update screen will show no list.")
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
