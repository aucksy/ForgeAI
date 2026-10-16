#!/usr/bin/env python3
"""Cross-role journey 6 (UAT WP6): read the gym's brand colour off the phone's screenshots.

  xj_colour.py <#RRGGBB> <forgeai-look.png> <gym-look.png>

Counts the pixels whose hue is within 12 degrees of the brand colour's hue and which are clearly
coloured (saturation >= 0.35, brightness >= 0.45): the accent, its button gradient (a little lighter
and darker than the accent, same hue) and its tints. ForgeAI's own look (ember orange, steel blue)
has none of the test colour's hue (pink, #FF5CA8, hue ~ 330). PASS when the gym-look picture has at
least 0.15 % such pixels and the ForgeAI-look picture at most a tenth of that. Prints both shares.

Pure Python (zlib only), so the runner needs no image library: 8-bit RGB / RGBA PNGs, not interlaced
(what adb screencap and Maestro write).
"""
import colorsys
import struct
import sys
import zlib

MIN_SHARE = 0.0015
HUE_TOLERANCE = 12 / 360


def read_png(path):
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path}: not a PNG")
    pos, idat, width = 8, b"", None
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        pos += 12 + n
        if kind == b"IHDR":
            width, height, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or ctype not in (2, 6) or interlace:
                raise ValueError(f"{path}: unsupported PNG (depth {depth}, colour type {ctype}, interlace {interlace})")
            bpp = 4 if ctype == 6 else 3
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
    raw = zlib.decompress(idat)
    stride = width * bpp
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(height):
        f = raw[i]
        line = bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line))
        prev = line
    return width, height, bpp, rows


def brand_share(path, hue):
    width, height, bpp, rows = read_png(path)
    hit = total = 0
    # Every second pixel of every second row: plenty for a share, four times faster.
    for y in range(0, height, 2):
        row = rows[y]
        for x in range(0, width, 2):
            r, g, b = row[x * bpp], row[x * bpp + 1], row[x * bpp + 2]
            total += 1
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s >= 0.35 and v >= 0.45 and min(abs(h - hue), 1 - abs(h - hue)) <= HUE_TOLERANCE:
                hit += 1
    return hit / max(total, 1)


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    hexc = argv[0].lstrip("#")
    r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hue = colorsys.rgb_to_hsv(r, g, b)[0]
    before = brand_share(argv[1], hue)
    after = brand_share(argv[2], hue)
    ok = after >= MIN_SHARE and before <= after / 10
    print(f"COLOUR {'OK' if ok else 'FAILED'}: #{hexc.upper()} on ForgeAI's look {before * 100:.3f} % of pixels, "
          f"on the gym's look {after * 100:.3f} % (needs >= {MIN_SHARE * 100:.2f} % and the ForgeAI look under a tenth of it)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
