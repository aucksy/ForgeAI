#!/usr/bin/env python3
"""Audit step 3E / E2 helper: read a few small files out of a big phone-test artifact WITHOUT downloading it.

A qa-out artifact is ~350 MB (hundreds of screenshots). The reason a flow failed is in two small files inside it
(part-<x>.log and <x>-hierarchy.json). A zip keeps its list of files at the end, so this asks GitHub's storage for
just the last bytes (the list), then for just the bytes of the wanted files. A few hundred KB per look.

Usage (from the repo root):
    python docs/system-map/_tools/e2_artifact_peek.py <run_id> list [name-filter]
    python docs/system-map/_tools/e2_artifact_peek.py <run_id> get <out-dir> <substring> [<substring> ...]

Stdlib only. Token from the git credential helper, to curl on stdin, never printed or stored.
"""
import json
import os
import struct
import subprocess
import sys
import zlib

REPO = "aucksy/ForgeAI"


def token():
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    out = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True, env=env, timeout=60).stdout
    return [l[9:] for l in out.splitlines() if l.startswith("password=")][0]


def api(url, want_redirect=False):
    hdr = "\n".join(["Authorization: Bearer " + token(), "Accept: application/vnd.github+json",
                     "User-Agent: e2-label-script", ""]).encode()
    if want_redirect:
        p = subprocess.run(["curl", "-sS", "--max-time", "60", "-H", "@-", "-o", os.devnull, "-w", "%{redirect_url}", url],
                           input=hdr, capture_output=True)
        return p.stdout.decode()
    p = subprocess.run(["curl", "-sS", "--max-time", "60", "-H", "@-", url], input=hdr, capture_output=True)
    return json.loads(p.stdout.decode("utf-8", "replace"))


def rng(url, a, b):
    p = subprocess.run(["curl", "-sS", "--max-time", "120", "-r", "%d-%d" % (a, b), url], capture_output=True)
    return p.stdout


def entries(url, size):
    tail_len = min(size, 1 << 20)
    tail = rng(url, size - tail_len, size - 1)
    i = tail.rfind(b"PK\x05\x06")
    if i < 0:
        sys.exit("no zip end record found")
    n, cd_size, cd_off = struct.unpack("<HII", tail[i + 10:i + 20])
    if cd_off == 0xFFFFFFFF or n == 0xFFFF:      # zip64
        j = tail.rfind(b"PK\x06\x06")
        cd_size, cd_off = struct.unpack("<QQ", tail[j + 40:j + 56])
    start_in_tail = cd_off - (size - tail_len)
    cd = tail[start_in_tail:start_in_tail + cd_size] if start_in_tail >= 0 else rng(url, cd_off, cd_off + cd_size - 1)
    out, p = [], 0
    while p < len(cd) and cd[p:p + 4] == b"PK\x01\x02":
        method, = struct.unpack("<H", cd[p + 10:p + 12])
        csize, usize, nlen, elen, clen = struct.unpack("<IIHHH", cd[p + 20:p + 34])
        off, = struct.unpack("<I", cd[p + 42:p + 46])
        name = cd[p + 46:p + 46 + nlen].decode("utf-8", "replace")
        extra = cd[p + 46 + nlen:p + 46 + nlen + elen]
        q = 0
        while q + 4 <= len(extra):               # zip64 extra field
            hid, hl = struct.unpack("<HH", extra[q:q + 4])
            if hid == 1:
                vals = extra[q + 4:q + 4 + hl]
                k = 0
                if usize == 0xFFFFFFFF:
                    usize, = struct.unpack("<Q", vals[k:k + 8]); k += 8
                if csize == 0xFFFFFFFF:
                    csize, = struct.unpack("<Q", vals[k:k + 8]); k += 8
                if off == 0xFFFFFFFF:
                    off, = struct.unpack("<Q", vals[k:k + 8]); k += 8
            q += 4 + hl
        out.append({"name": name, "method": method, "csize": csize, "usize": usize, "off": off})
        p += 46 + nlen + elen + clen
    return out


def read_entry(url, e):
    head = rng(url, e["off"], e["off"] + 29)
    nlen, elen = struct.unpack("<HH", head[26:30])
    a = e["off"] + 30 + nlen + elen
    data = rng(url, a, a + e["csize"] - 1) if e["csize"] else b""
    return zlib.decompress(data, -15) if e["method"] == 8 else data


def main():
    run, cmd = sys.argv[1], sys.argv[2]
    arts = api("https://api.github.com/repos/%s/actions/runs/%s/artifacts?per_page=100" % (REPO, run)).get("artifacts", [])
    arts = [a for a in arts if a["name"].startswith("qa-out") or a["name"].startswith("journeys") or "conditions" in a["name"]]
    if not arts:
        sys.exit("no qa-out artifact on run %s" % run)
    for a in arts:
        if a["expired"]:
            print("EXPIRED", a["name"])
            continue
        url = api(a["archive_download_url"], want_redirect=True)
        if not url:
            print("no download url for", a["name"])
            continue
        es = entries(url, a["size_in_bytes"])
        if cmd == "list":
            flt = sys.argv[3] if len(sys.argv) > 3 else ""
            for e in es:
                if flt in e["name"]:
                    print(a["name"], e["name"], e["usize"])
        else:
            out_dir, subs = sys.argv[3], sys.argv[4:]
            os.makedirs(out_dir, exist_ok=True)
            for e in es:
                if any(s in e["name"] for s in subs) and e["usize"] < 5_000_000 and not e["name"].endswith("/"):
                    dest = os.path.join(out_dir, "%s__%s__%s" % (run, a["name"], e["name"].replace("/", "_")))
                    with open(dest, "wb") as f:
                        f.write(read_entry(url, e))
                    print("saved", dest, e["usize"])


if __name__ == "__main__":
    main()
