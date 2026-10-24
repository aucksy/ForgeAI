"""Badged icons for the two staff apps (R-116, 24 Oct 2026).

The member app keeps the approved E Forged icon untouched. The admin app (app.mettleup.fit) and the
HQ panel (hq.mettleup.fit) use the same icon with a pill badge at the foot of the hexagon, so the
three can be told apart on one home screen:
    ADMIN  white pill, Steel text
    HQ     Molten pill, Steel text
Both pills carry a Steel ring so they read as a sticker on the hexagon at 48 px.

Run from the repo root:  python branding/mettleup/_src/make_app_badges.py
Writes branding/mettleup/web/<admin|hq>/ and copies into apps/dashboard/public/brand/ (admin-*)
and apps/hq/public/icons/ (hq).
"""
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / 'branding/mettleup/web'
FONT = ROOT / 'node_modules/@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf'
STEEL = (27, 31, 38, 255)
BADGES = {
    'admin': ('ADMIN', (244, 245, 248, 255)),
    'hq': ('HQ', (255, 138, 76, 255)),
}
SS = 4  # draw at 4x and scale down for smooth edges


def badge(base, text, fill, cy, h, font_px, ring):
    """Pill centred at (256, cy) on a 512 px icon; h = pill height, ring = Steel outline width."""
    big = base.resize((512 * SS, 512 * SS), Image.LANCZOS)
    d = ImageDraw.Draw(big)
    font = ImageFont.truetype(str(FONT), font_px * SS)
    track = int(font_px * SS * 0.06)
    widths = [d.textlength(ch, font=font) for ch in text]
    tw = sum(widths) + track * (len(text) - 1)
    pad = h * 0.42
    w = tw + 2 * pad * SS
    cx, cyy, hh = 256 * SS, cy * SS, h * SS
    box = (cx - w / 2, cyy - hh / 2, cx + w / 2, cyy + hh / 2)
    r = ring * SS
    d.rounded_rectangle((box[0] - r, box[1] - r, box[2] + r, box[3] + r), radius=hh / 2 + r, fill=STEEL)
    d.rounded_rectangle(box, radius=hh / 2, fill=fill)
    x = cx - tw / 2
    for ch, cw in zip(text, widths):
        d.text((x, cyy), ch, font=font, fill=STEEL, anchor='lm')
        x += cw + track
    return big.resize((512, 512), Image.LANCZOS)


def full_bleed(icon):
    """The rounded icon on a Steel square (for apple-touch-icon: iOS rounds it itself)."""
    sq = Image.new('RGBA', icon.size, STEEL)
    sq.alpha_composite(icon)
    return sq


def main():
    icon = Image.open(WEB / 'icon-512.png').convert('RGBA')
    mask = Image.open(WEB / 'icon-maskable-512.png').convert('RGBA')
    for key, (text, fill) in BADGES.items():
        out = WEB / key
        out.mkdir(exist_ok=True)
        # Rounded icon: hexagon foot at y~447; the pill sits over it.
        big = badge(icon, text, fill, cy=420, h=92, font_px=56 if len(text) > 2 else 64, ring=10)
        big.save(out / 'icon-512.png')
        big.resize((192, 192), Image.LANCZOS).save(out / 'icon-192.png')
        full_bleed(big).convert('RGB').resize((180, 180), Image.LANCZOS).save(out / 'apple-touch-icon-180.png')
        # Maskable: everything inside the 80 % safe circle (radius 205 around the centre).
        m = badge(mask, text, fill, cy=372, h=66, font_px=40 if len(text) > 2 else 46, ring=7)
        m.save(out / 'icon-maskable-512.png')

    dash = ROOT / 'apps/dashboard/public/brand'
    for name in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon-180.png'):
        shutil.copy(WEB / 'admin' / name, dash / f'admin-{name}')
    hq = ROOT / 'apps/hq/public/icons'
    for src, dst in (('icon-192.png', 'icon-192.png'), ('icon-512.png', 'icon-512.png'),
                     ('icon-maskable-512.png', 'icon-maskable-512.png'),
                     ('apple-touch-icon-180.png', 'apple-touch-icon.png')):
        shutil.copy(WEB / 'hq' / src, hq / dst)
    print('badged icons written')


if __name__ == '__main__':
    main()
