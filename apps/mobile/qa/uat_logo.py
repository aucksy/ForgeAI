#!/usr/bin/env python3
"""Release UAT, F146 (share pictures carry the gym's logo and name): give the run's FRESH test gym
("QA UAT Gym", made by uat_gym.py setup; never FORGE1 / RAMS01) a logo, the way the admin app's
Branding page does it: an upload ticket (owner_photo_ticket), the PNG into the public gym-logos
bucket under <ticket>/logo-<hex>.png, then owner_set_brand with that link (no colours: the app
keeps MettleUp's own, only the logo is new).

  logo <slot>      upload a sample 2:1 logo (a gold ring and a white bar on see-through) and set it
  square <slot>    T74 (R-356): the owner's reported case instead, a round black badge (a white ring
                   and a white square inside) on a WHITE square, 512 x 512 with no see-through

The logo is drawn here (no image library): 512 x 256, PNG with transparency, like the admin app's
shrunk logos (at most 512 px). Prints LOGO=<public link>. The owner session key stays in the
state file (xj_server.py); it is never printed.
"""
import json
import struct
import sys
import urllib.error
import urllib.request
import uuid
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import xj_server as xj  # noqa: E402


def sample_logo_png(w=512, h=256):
    """A 2:1 logo with a see-through background: a gold ring on the left, a white bar on the right."""
    rows = []
    cx, cy = h // 2, h // 2
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            r2 = (x - cx) ** 2 + (y - cy) ** 2
            if 80 ** 2 < r2 < 112 ** 2:
                row += bytes([255, 196, 0, 255])
            elif 250 < x < 488 and 104 < y < 152:
                row += bytes([255, 255, 255, 255])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def square_badge_png(n=512):
    """T74: a round black badge on a white square (the logo that showed white corners on a round icon)."""
    rows = []
    c = n / 2
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            d2 = (x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2
            black = d2 <= 230 ** 2 and not (173 ** 2 <= d2 <= 187 ** 2) and not (196 <= x < 316 and 196 <= y < 316)
            row += bytes([0, 0, 0, 255]) if black else bytes([255, 255, 255, 255])
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def upload(url, key, path, png):
    """POST the file into the bucket (anon may insert only into a live ticket folder)."""
    last = None
    for headers in ({"apikey": key}, {"apikey": key, "Authorization": f"Bearer {key}"}):
        req = urllib.request.Request(
            f"{url}/storage/v1/object/gym-logos/{path}",
            data=png,
            headers={**headers, "Content-Type": "image/png", "x-upsert": "false", "cache-control": "max-age=31536000"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status
        except urllib.error.HTTPError as e:
            last = f"{e.code}: {e.read().decode('utf-8', 'replace')[:200]}"
    raise RuntimeError(f"logo upload answered {last}")


def set_logo(slot, png=None):
    st = xj.load(slot)
    url, key = xj.config()
    ticket = str(xj.rpc("owner_photo_ticket", {"p_key": st["key"]}))
    path = f"{ticket}/logo-{uuid.uuid4().hex}.png"
    upload(url, key, path, png or sample_logo_png())
    link = f"{url}/storage/v1/object/public/gym-logos/{path}"
    g = xj.rpc("owner_set_brand", {"p_key": st["key"], "p_accent": None, "p_bg": None, "p_logo_url": link, "p_heading": "normal"}) or {}
    got = ((g.get("brand") or {}).get("logoUrl")) if isinstance(g, dict) else None
    if got != link:
        raise RuntimeError(f"owner_set_brand did not keep the logo (brand: {json.dumps((g or {}).get('brand'))[:200]})")
    print(f"logo set on '{st.get('name')}'")
    print(f"LOGO={link}")
    return 0


def main(argv):
    if len(argv) == 2 and argv[0] in ("logo", "square"):
        try:
            return set_logo(argv[1], square_badge_png() if argv[0] == "square" else None)
        except Exception as e:  # noqa: BLE001 - one line for the run's timeline
            print(f"LOGO FAILED: {e}")
            return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
