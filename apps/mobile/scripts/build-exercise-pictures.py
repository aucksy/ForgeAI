"""F20: start and end pictures for the exercise page, from the RepDB free edition.

Reads the hand-checked match list docs/exercise-library/repdb-match.json (our exercise key ->
RepDB id), takes each match's two flat-style pictures (start, peak) from a local copy of
https://github.com/RepDB/exercise-dataset, resizes them for a phone screen and writes:

  assets/exercise-pictures/<key>__start.webp and <key>__end.webp
  assets/exercise-pictures/<key>__thumb.webp   (R-280: the start picture cropped close to the
                                               person, for the small picture in exercise lists)
  src/tracker/catalog/pictures.ts   (GENERATED: static require()s for Metro, picturesFor())

Licence (RepDB LICENSE-DATA.md, free tier): in-app use, personal or commercial, with the visible
credit "Exercise data by RepDB (repdb.co)" on the About/Credits screen. Images may be resized,
cropped or recoloured (term 4); never fed to a generative model; never republished as a dataset.
Only matched pictures ship.

R-280 (owner, 2 Nov 2026: "the colors ... let's match them with the theme"): every picture is
recoloured to the app's dark theme by plain pixel rules, no AI: the light blue ground becomes the
card colour, the blue top becomes the accent orange, the navy shorts become charcoal.

"single": RepDB has one picture for a hold (plank): only <key>__start.webp is written and the page
shows it once.

Usage (Pillow with WebP support, numpy, scipy):
  git clone https://github.com/RepDB/exercise-dataset <dir> && git -C <dir> checkout d5e093431a9245cb469e019f2ef0305e2a5bc595
  python apps/mobile/scripts/build-exercise-pictures.py <dir>
"""
import glob
import json
import os
import sys

import numpy as np
import scipy.ndimage as ndi
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # apps/mobile
REPO = os.path.dirname(os.path.dirname(ROOT))
MATCH = os.path.join(REPO, 'docs', 'exercise-library', 'repdb-match.json')
LIBRARY = os.path.join(REPO, 'docs', 'exercise-library')
OUT = os.path.join(ROOT, 'assets', 'exercise-pictures')
TS = os.path.join(ROOT, 'src', 'tracker', 'catalog', 'pictures.ts')

# Two pictures sit side by side on the page (~170 dp each, ~510 px on a 3x phone). 384 px
# lossy WebP keeps the flat drawings sharp at a fraction of the 512 px source's weight.
SIZE = 384
QUALITY = 72

# The theme (packages/theme/src/palette.ts): surface #10131C, accent #FF7A3B (hue about 20 degrees).
SURFACE = np.array([0x10, 0x13, 0x1C]) / 255
FLOOR = np.array([0x1C, 0x21, 0x2E]) / 255
ACCENT_HUE = 20 / 360


def _hsv(a):
    mx = a.max(-1)
    d = mx - a.min(-1)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = (b - r)[gg] / d[gg] + 2
    h[bb] = (r - g)[bb] / d[bb] + 4
    return h / 6, np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0), mx


def _rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.zeros(h.shape + (3,))
    for k, (x, y, z) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel] = np.stack([x[sel], y[sel], z[sel]], -1)
    return out


def _grow(mask, px):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(px))) > 0


THUMB = 144  # the list picture is 38-56 dp: 144 px stays sharp at 2.6x


def thumb(im: Image.Image) -> Image.Image:
    """The start picture cropped to what is drawn (not the empty ground), square, for lists."""
    a = np.asarray(im.convert('RGB'), float) / 255
    drawn = np.linalg.norm(a - SURFACE, axis=-1) > 0.12
    ys, xs = np.nonzero(drawn)
    H, W = drawn.shape
    if len(xs) == 0:
        return im.resize((THUMB, THUMB), Image.LANCZOS)
    x0, x1, y0, y1 = np.percentile(xs, 1), np.percentile(xs, 99), np.percentile(ys, 1), np.percentile(ys, 99)
    side = max(x1 - x0, y1 - y0) * 1.08
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = min(side, W, H)
    left = int(round(min(max(cx - side / 2, 0), W - side)))
    top = int(round(min(max(cy - side / 2, 0), H - side)))
    return im.crop((left, top, left + int(side), top + int(side))).resize((THUMB, THUMB), Image.LANCZOS)


def recolour(im: Image.Image) -> Image.Image:
    """RepDB's light blue drawing -> the app's dark theme (R-280). Pixel rules only."""
    a = np.asarray(im.convert('RGB'), float) / 255
    h, s, v = _hsv(a)
    blue = (h > 180 / 360) & (h < 225 / 360)
    # The ground: pale blue patches that touch the border, or big ones seen through a bench or
    # machine frame. Small pale spots (eye whites, shine) are not ground.
    pale = blue & (s < 0.3) & (v > 0.8)
    lab, n = ndi.label(pale)
    edge_ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sizes = ndi.sum(np.ones_like(v), lab, index=np.arange(1, n + 1)) if n else np.array([])
    keep = [i + 1 for i in range(n) if (i + 1) in edge_ids or sizes[i] >= 250]
    ground = np.isin(lab, keep)
    # The floor shadow under the feet: a little darker pale blue next to the ground.
    shadow = blue & (s < 0.35) & (v > 0.62) & ~ground & _grow(ground, 9) & ((v <= 0.8) | pale)
    out = a.copy()
    cloth = blue & (s >= 0.45) & (v >= 0.55)  # the bright blue top
    out[cloth] = _rgb(np.full_like(h, ACCENT_HUE), np.clip(s * 1.05, 0, 1), np.clip(v * 1.08, 0, 1))[cloth]
    # The shorts, and their darkest shading (pike push-up); plain dark outlines (low colour) stay.
    navy = blue & (((s >= 0.25) & (v < 0.55) & (v >= 0.33)) | ((s >= 0.4) & (v >= 0.15) & (v < 0.33)))
    out[navy] = _rgb(h, s * 0.2, v * 0.85)[navy]
    old = np.median(a[ground], axis=0) if ground.any() else np.array([0.84, 0.94, 0.99])
    old_v = np.median(v[ground]) if ground.any() else 0.98
    darker = np.clip((old_v - v) / 0.18, 0, 1)[..., None]
    out[ground] = (SURFACE + darker * (FLOOR - SURFACE))[ground]
    out[shadow] = FLOOR
    # Outline pixels half mixed with the old ground fade into the new one (no light rim).
    ring = ~ground & _grow(ground, 7) & ~cloth
    w = np.where(ring, np.clip(1 - np.linalg.norm(a - old, axis=-1) / 0.55, 0, 1) ** 0.8, 0)[..., None]
    out = w * SURFACE + (1 - w) * out
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def main(repdb_dir: str) -> None:
    ours = set()
    for p in sorted(glob.glob(os.path.join(LIBRARY, 'part_*.json'))):
        with open(p, encoding='utf-8') as f:
            ours.update(e['key'] for e in json.load(f))
    with open(os.path.join(repdb_dir, 'exercises.json'), encoding='utf-8') as f:
        repdb = {x['id']: x for x in json.load(f)['exercises']}
    with open(MATCH, encoding='utf-8') as f:
        matches = json.load(f)['matches']

    os.makedirs(OUT, exist_ok=True)
    for old in glob.glob(os.path.join(OUT, '*.webp')):
        os.remove(old)

    total = 0
    for key, m in matches.items():
        if key not in ours:
            sys.exit(f'{key}: not an exercise in docs/exercise-library')
        x = repdb.get(m['repdb'])
        if x is None:
            sys.exit(f'{key}: RepDB has no exercise {m["repdb"]}')
        flat = x['images']['flat']
        if m.get('single'):
            pairs = [('main', 'start')]
        else:
            poses = ['peak', 'start'] if m.get('swap') else ['start', 'peak']
            pairs = list(zip(poses, ('start', 'end')))
        for pose, name in pairs:
            src = os.path.join(repdb_dir, flat[pose])
            im = recolour(Image.open(src).convert('RGB'))
            if name == 'start':
                t = os.path.join(OUT, f'{key}__thumb.webp')
                thumb(im).save(t, 'WEBP', quality=QUALITY, method=6)
                total += os.path.getsize(t)
            im.thumbnail((SIZE, SIZE), Image.LANCZOS)
            dst = os.path.join(OUT, f'{key}__{name}.webp')
            im.save(dst, 'WEBP', quality=QUALITY, method=6)
            total += os.path.getsize(dst)

    lines = [
        '/**',
        ' * GENERATED by scripts/build-exercise-pictures.py — do not edit by hand.',
        ' *',
        ' * F20: start and end pictures for the exercise page, from the RepDB free edition',
        ' * (https://github.com/RepDB/exercise-dataset). Matches are hand-checked in',
        ' * docs/exercise-library/repdb-match.json. Licence: in-app use with the visible credit',
        ' * "Exercise data by RepDB (repdb.co)" (Settings → About → Credits); resized and recoloured to',
        ' * the app theme (R-280). A hold (plank) has one picture: `end` is null.',
        ' */',
        "import type { ImageSourcePropType } from 'react-native';",
        '',
        "import { OWN_PICTURES } from './ownPictures';",
        '',
        'export interface ExercisePictures {',
        '  start: ImageSourcePropType;',
        '  /** The start picture cropped close to the person, for the small picture in lists (R-280). */',
        '  thumb: ImageSourcePropType;',
        '  /** null: a hold, drawn once. */',
        '  end: ImageSourcePropType | null;',
        '}',
        '',
        '/** Our exercise key -> RepDB id, for checks (the same list as repdb-match.json). */',
        'export const PICTURE_SOURCE_IDS: Readonly<Record<string, string>> = {',
    ]
    for key, m in matches.items():
        lines.append(f"  {key}: '{m['repdb']}',")
    lines += [
        '};',
        '',
        '/* eslint-disable @typescript-eslint/no-require-imports */',
        'export const EXERCISE_PICTURES: Readonly<Record<string, ExercisePictures>> = {',
    ]
    for key in matches:
        lines += [
            f'  {key}: {{',
            f"    start: require('../../../assets/exercise-pictures/{key}__start.webp'),",
            f"    thumb: require('../../../assets/exercise-pictures/{key}__thumb.webp'),",
            "    end: null," if matches[key].get('single') else f"    end: require('../../../assets/exercise-pictures/{key}__end.webp'),",
            '  },',
        ]
    lines += [
        '};',
        '/* eslint-enable @typescript-eslint/no-require-imports */',
        '',
        '/**',
        ' * The start and end pictures of a library exercise, or null when it has none. RepDB first; else our own',
        ' * pictures (ownPictures.ts, generated by tools/exercise-anim/export_pictures.py --index).',
        ' */',
        'export function picturesFor(key: string | null | undefined): ExercisePictures | null {',
        '  if (!key) return null;',
        '  if (Object.prototype.hasOwnProperty.call(EXERCISE_PICTURES, key)) return EXERCISE_PICTURES[key];',
        '  return Object.prototype.hasOwnProperty.call(OWN_PICTURES, key) ? OWN_PICTURES[key] : null;',
        '}',
        '',
    ]
    with open(TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print(f'{len(matches)} exercises, {total} bytes ({total / 1048576:.2f} MB)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
