"""Turn the cloud stills (transparent PNGs) into app pictures in one look. Plain Python (Pillow + numpy), seconds.

  python tools/exercise-anim/export_pictures.py <stills_dir> <out_dir> --look A [--theme dark] [--keys a,b]
  python tools/exercise-anim/export_pictures.py <stills_dir> <out_dir> --look A --preview   # PNG, for sample pages
  python tools/exercise-anim/export_pictures.py --index   # rewrite apps/mobile/src/tracker/catalog/ownPictures.ts

<stills_dir> holds <key>__start.png and <key>__end.png (a hold has only __start.png), as made by
`make_clip.py ... stills` in exercise-clips.yml (mode: stills) or downloaded from the "exercise-stills" release.
Writes <key>__start.webp, <key>__end.webp and <key>__thumb.webp: the same sizes as the RepDB pictures
(apps/mobile/scripts/build-exercise-pictures.py: 384 px square, 144 px thumb), so they sit in the same frames.

The render never contains the look: background, framing and size are added here. So a new look = re-run this
script, never a re-render. The approved look is the "Approved look:" line in DAILY-LOG.md (empty = do not export
into the app; sample pages only).
"""
import argparse
import glob
import os

import numpy as np
from PIL import Image, ImageFilter

SIZE = 384      # as the RepDB start/end pictures
THUMB = 144     # as the RepDB list picture
QUALITY = 80

# App planes (packages/theme/src/palette.ts): surface #10131C (the card the pictures sit on), surfaceRaised #171B27.
LOOKS = {
    # A: flat card colour, edge to edge with the picture frame, exactly like the recoloured RepDB pictures.
    "A": {"name": "Flat card", "dark": {"bg": "#10131C", "glow": None, "floor": "#1C212E"},
          "light": {"bg": "#F1F2F4", "glow": None, "floor": "#E2E4E8"}, "pad": 0.08},
    # B: the card colour with a soft light behind the athlete and a floor shadow: more depth, still dark.
    "B": {"name": "Soft spotlight", "dark": {"bg": "#10131C", "glow": "#2A3142", "floor": None},
          "light": {"bg": "#E9EBEF", "glow": "#FFFFFF", "floor": None}, "pad": 0.10, "shadow": 0.55},
    # C: a light studio tile (the Hevy / Gymvisual look): the grey body and red muscles read best on light grey.
    "C": {"name": "Studio tile", "dark": {"bg": "#D9DCE1", "glow": "#F4F5F7", "floor": None},
          "light": {"bg": "#D9DCE1", "glow": "#F4F5F7", "floor": None}, "pad": 0.10, "shadow": 0.35},
    # D (R-490, 13 Nov 2026): the main RepDB set exactly (renders made with FA_STYLE=drawn, the default): flat card
    # #10131C, a lighter flat floor ellipse #1B1F2B under whatever touches the floor, the drawing filling ~90 % of
    # the square, and the list picture cropped like build-exercise-pictures.py thumb(). Measured on 150 main-set
    # pictures (background 15,19,27; ellipse 27,31,43; content from y 20 to 365 of 384).
    "D": {"name": "Drawn (main set)", "dark": {"bg": "#10131C", "glow": None, "floor": "#1B1F2B"},
          "light": {"bg": "#10131C", "glow": None, "floor": "#1B1F2B"}, "pad": 0.05, "ellipse": True},
}


def _rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255


def background(look, theme, side):
    L = LOOKS[look][theme]
    bg = np.ones((side, side, 3)) * _rgb(L["bg"])
    if L.get("glow"):
        y, x = np.mgrid[0:side, 0:side] / side
        r = np.sqrt((x - 0.5) ** 2 + ((y - 0.45) * 1.15) ** 2)
        w = np.clip(1 - r / 0.62, 0, 1) ** 1.6
        bg = bg + (_rgb(L["glow"]) - bg) * w[..., None]
    return bg


def union_box(alphas):
    """One crop for start AND end, so the athlete does not jump between the two pictures."""
    a = np.maximum.reduce([x > 0.04 for x in alphas])
    ys, xs = np.nonzero(a)
    return xs.min(), ys.min(), xs.max(), ys.max()


def compose(rgba, box, look, theme, side=SIZE):
    """Square crop around `box` with the look's padding, the athlete laid over the look's background."""
    x0, y0, x1, y1 = box
    pad = LOOKS[look]["pad"]
    s = max(x1 - x0, y1 - y0) * (1 + 2 * pad)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    W, H = rgba.size
    big = Image.new("RGBA", (int(s) + 2, int(s) + 2), (0, 0, 0, 0))
    big.paste(rgba, (int(round(s / 2 - cx)), int(round(s / 2 - cy))))
    im = big.resize((side, side), Image.LANCZOS)
    a = np.asarray(im, float) / 255
    alpha, col = a[..., 3:4], a[..., :3]
    # Shadow-catcher pixels are black with low alpha: a soft floor shadow. Keep them weaker on dark backgrounds.
    sh = LOOKS[look].get("shadow", 0.4)
    is_shadow = (col.max(-1, keepdims=True) < 0.05) & (alpha < 0.9)
    alpha = np.where(is_shadow, alpha * sh, alpha)
    bg = background(look, theme, side)
    if LOOKS[look].get("ellipse"):
        bg = floor_ellipse(bg, alpha[..., 0], _rgb(LOOKS[look][theme]["floor"]))
    out = bg * (1 - alpha) + col * alpha
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def floor_ellipse(bg, alpha, colour):
    """The main set's floor: a flat lighter ellipse under what touches the floor (feet, bench legs, a lying body).
    Its width follows the lowest 4 % of the drawing; its height is ~13 % of its width (measured on the main set)."""
    side = bg.shape[0]
    ys, xs = np.nonzero(alpha > 0.5)
    if len(ys) == 0:
        return bg
    ymax = ys.max()
    band = ys >= ymax - 0.04 * side
    bx = xs[band]
    # look test r1: the main set's ellipse is about as wide as the whole drawing (a standing man with dumbbells, a
    # whole machine), not just the feet
    hw = max((bx.max() - bx.min()) / 2 + 0.04 * side, 0.46 * (xs.max() - xs.min()))
    hh = max(0.022 * side, 0.13 * hw)
    cx = 0.5 * (bx.max() + bx.min()) / 2 + 0.5 * (xs.max() + xs.min()) / 2
    cy = ymax - 0.2 * hh
    Y, X = np.mgrid[0:side, 0:side]
    e = np.sqrt(((X - cx) / hw) ** 2 + ((Y - cy) / hh) ** 2)
    w = np.clip((1 - e) * hh / 1.2 + 0.5, 0, 1)[..., None]
    return bg * (1 - w) + colour * w


def drawn_thumb(im):
    """The list picture as build-exercise-pictures.py thumb() makes it from a main-set picture: the start picture
    cropped to what is drawn (1st-99th percentile, x1.08), square."""
    a = np.asarray(im.convert("RGB"), float) / 255
    drawn = np.linalg.norm(a - _rgb("#10131C"), axis=-1) > 0.12
    ys, xs = np.nonzero(drawn)
    H, W = drawn.shape
    if len(xs) == 0:
        return im.resize((THUMB, THUMB), Image.LANCZOS)
    x0, x1, y0, y1 = np.percentile(xs, 1), np.percentile(xs, 99), np.percentile(ys, 1), np.percentile(ys, 99)
    side = min(max(x1 - x0, y1 - y0) * 1.08, W, H)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = int(round(min(max(cx - side / 2, 0), W - side)))
    top = int(round(min(max(cy - side / 2, 0), H - side)))
    return im.crop((left, top, left + int(side), top + int(side))).resize((THUMB, THUMB), Image.LANCZOS)


def thumb(rgba, look, theme):
    a = np.asarray(rgba, float)[..., 3] / 255
    body = a > 0.5   # the athlete and equipment, not the faint shadow
    ys, xs = np.nonzero(body)
    return compose(rgba, (xs.min(), ys.min(), xs.max(), ys.max()), look, theme, THUMB)


def export_key(stills, key, out, look, theme, preview=False):
    paths = {t: os.path.join(stills, f"{key}__{t}.png") for t in ("start", "end")}
    ims = {t: Image.open(p).convert("RGBA") for t, p in paths.items() if os.path.exists(p)}
    if "start" not in ims:
        raise SystemExit(f"{key}: no {key}__start.png in {stills}")
    box = union_box([np.asarray(i, float)[..., 3] / 255 for i in ims.values()])
    if LOOKS[look].get("ellipse"):   # room under the lowest point for the floor ellipse
        x0, y0, x1, y1 = box
        box = (x0, y0, x1, y1 + 0.03 * max(x1 - x0, y1 - y0))
    os.makedirs(out, exist_ok=True)
    ext, kw = (".png", {}) if preview else (".webp", {"quality": QUALITY, "method": 6})
    written = []
    made = {}
    for t, im in ims.items():
        p = os.path.join(out, f"{key}__{t}{ext}")
        made[t] = compose(im, box, look, theme); made[t].save(p, **kw); written.append(p)
    p = os.path.join(out, f"{key}__thumb{ext}")
    (drawn_thumb(made["start"]) if LOOKS[look].get("ellipse") else thumb(ims["start"], look, theme)).save(p, **kw); written.append(p)
    return written


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
APP_DIR = os.path.join(ROOT, "apps", "mobile", "assets", "exercise-pictures-own")
INDEX_TS = os.path.join(ROOT, "apps", "mobile", "src", "tracker", "catalog", "ownPictures.ts")


def write_index():
    """ownPictures.ts from the files on disk (never a hand list): every <key>__start.webp in the app folder;
    no __end.webp = a hold (end: null). picturesFor() in pictures.ts falls back to this list."""
    keys = sorted(os.path.basename(p)[:-len("__start.webp")] for p in glob.glob(os.path.join(APP_DIR, "*__start.webp")))
    rel = "../../../assets/exercise-pictures-own/"
    lines = [
        "/**",
        " * GENERATED by tools/exercise-anim/export_pictures.py --index - do not edit by hand.",
        " *",
        " * Our own start and end pictures (the grey 3D athlete, look A on the dark card) for library exercises",
        " * that have no RepDB picture. Made in the cloud (exercise-clips.yml, mode stills), checked by eye and by a",
        " * fresh reviewer (tools/exercise-anim/qa.json, DAILY-LOG.md). Ours: no credit needed. A hold has end: null.",
        " */",
        "import type { ExercisePictures } from './pictures';",
        "",
        "/* eslint-disable @typescript-eslint/no-require-imports */",
        "export const OWN_PICTURES: Readonly<Record<string, ExercisePictures>> = {",
    ]
    for k in keys:
        end = os.path.exists(os.path.join(APP_DIR, f"{k}__end.webp"))
        lines += [f"  {k}: {{",
                  f"    start: require('{rel}{k}__start.webp'),",
                  f"    thumb: require('{rel}{k}__thumb.webp'),",
                  f"    end: require('{rel}{k}__end.webp')," if end else "    end: null,",
                  "  },"]
    lines += ["};", "/* eslint-enable @typescript-eslint/no-require-imports */", ""]
    with open(INDEX_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"ownPictures.ts: {len(keys)} exercises")


def main():
    import sys
    if sys.argv[1:] == ["--index"]:
        return write_index()
    ap = argparse.ArgumentParser()
    ap.add_argument("stills"); ap.add_argument("out")
    ap.add_argument("--look", required=True, choices=sorted(LOOKS))
    ap.add_argument("--theme", default="dark", choices=["dark", "light"])
    ap.add_argument("--keys", default="")
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()
    keys = [k for k in a.keys.split(",") if k] or sorted({os.path.basename(p).split("__")[0] for p in glob.glob(os.path.join(a.stills, "*__start.png"))})
    for k in keys:
        print(k, len(export_key(a.stills, k, a.out, a.look, a.theme, a.preview)), "files")


if __name__ == "__main__":
    main()
