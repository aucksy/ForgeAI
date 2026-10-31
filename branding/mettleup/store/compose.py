"""
MettleUp Play screenshots: drop real app screenshots into the designed frames.

    python branding/mettleup/store/compose.py                      # raw/ + captions.json -> out/
    python branding/mettleup/store/compose.py --raw D:/shots --out D:/play --captions my.json

Input
  raw/NN.png       one portrait app screenshot per shot, NN = 01..08 (PNG or JPG; any
                   portrait size; 1080x2400 is ideal). It is scaled to the phone's screen
                   width, anchored to the top, and the bottom is cut by the canvas edge.
                   A missing one leaves the labelled "APP SCREEN n" slot in place.
  captions.json    headline (max 2 lines, "\\n" breaks, *word* = orange accent) + sub per shot,
                   which pair is the panorama, and panorama_prop (R-253: dumbbell in front,
                   bar-behind, rise or hex; the last three sit behind the phones).

Output
  out/shot-NN.png  1080x1920, 24-bit PNG, no alpha, sRGB. Shots of the panorama pair are
                   rendered as ONE 2160-wide canvas and cut exactly at x = 1080.

Needs: pip install resvg-py pillow fonttools (all already used by the logo generator).
"""
import argparse
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '_src'))
import brand as B  # noqa: E402


def load_captions(path):
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    caps = {int(s['id']): s for s in data['shots']}
    pano = tuple(data.get('panorama') or ())
    if pano and (len(pano) != 2 or pano[1] != pano[0] + 1):
        raise SystemExit('panorama must be two neighbouring shots, e.g. [1, 2]')
    return caps, pano, data.get('panorama_prop', 'dumbbell')


def find_raw(raw_dir, idx):
    for name in (f'{idx:02d}', f'{idx}'):
        for ext in ('.png', '.PNG', '.jpg', '.jpeg', '.JPG'):
            p = os.path.join(raw_dir, name + ext)
            if os.path.exists(p):
                return p
    return None


def fit_screen(path):
    """Open a raw screenshot, flatten any alpha, cover-crop (top anchored) to the slot's exact
    pixel size so the renderer draws it 1:1 with no second resample."""
    g = B.phone_geom(B.SHOT_W / 2)
    sw, sh = int(round(g['sw'])), int(round(g['sh']))
    im = Image.open(path)
    im.load()
    if im.width > im.height:
        raise SystemExit(f'{path}: landscape screenshot; the frames are portrait')
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        base = Image.new('RGBA', im.size, '#000000')
        base.alpha_composite(im)
        im = base
    im = im.convert('RGB')
    if im.width < sw:
        print(f'  note: {os.path.basename(path)} is {im.width}px wide, the screen slot is {sw}px: it will be upscaled')
    scale = sw / im.width
    nh = max(sh, round(im.height * scale))
    im = im.resize((sw, nh), Image.LANCZOS)
    return im.crop((0, 0, sw, sh))


def compose(captions_path, raw_dir, out_dir, quiet=False):
    caps, pano, prop = load_captions(captions_path)
    screens = {}
    for idx in caps:
        p = find_raw(raw_dir, idx) if raw_dir else None
        screens[idx] = fit_screen(p) if p else None
        if not quiet:
            print(f'  shot {idx:02d}: {"screenshot " + os.path.basename(p) if p else "placeholder slot (no raw file)"}')
    os.makedirs(out_dir, exist_ok=True)
    outs = []
    done = set()
    for idx in sorted(caps):
        if idx in done:
            continue
        if pano and idx == pano[0]:
            svg, W = B.store_scene(list(pano), caps, screens, uid='p', prop=prop)
            im = B.raster(svg, W, B.SHOT_H)
            for k, j in enumerate(pano):
                part = im.crop((k * B.SHOT_W, 0, (k + 1) * B.SHOT_W, B.SHOT_H))
                outs.append(B.save(part, os.path.join(out_dir, f'shot-{j:02d}.png'), 'RGB'))
                done.add(j)
            B.save(im, os.path.join(out_dir, f'panorama-{pano[0]:02d}-{pano[1]:02d}-2160.png'), 'RGB')
        else:
            svg, W = B.store_scene([idx], caps, screens, uid=f's{idx}')
            outs.append(B.render(svg, os.path.join(out_dir, f'shot-{idx:02d}.png'), W, B.SHOT_H, 'RGB'))
            done.add(idx)
    for p in outs:
        im = Image.open(p)
        assert im.size == (B.SHOT_W, B.SHOT_H) and im.mode == 'RGB', (p, im.size, im.mode)
    if not quiet:
        print(f'  wrote {len(outs)} screenshots to {out_dir}')
    return outs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', default=os.path.join(HERE, 'raw'))
    ap.add_argument('--captions', default=os.path.join(HERE, 'captions.json'))
    ap.add_argument('--out', default=os.path.join(HERE, 'out'))
    a = ap.parse_args()
    compose(a.captions, a.raw, a.out)


if __name__ == '__main__':
    main()
