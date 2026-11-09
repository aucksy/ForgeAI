"""
The "steel plate" wordmark (owner pick, R-259, 31 Oct 2026): METTLEUP drawn from straight strokes,
wide and heavy, one even stroke, small machined corner cuts at the hexagon's 30-degree angle, tight
spacing. Every size gets the polished-steel fill (light top, a hard dark horizon, lighter bottom; "UP" in
orange metal): owner, 9 Nov 2026, never flat in the app or its share pictures. (The --android
VectorDrawable below is still flat; it is the watch app's, not part of this change.)

Exact polygons on a grid with cap height 100. This file is the one source: the app's lockup
(apps/mobile/src/components/brand/mettleUpMark.ts, written by `python steel_wordmark.py --ts`), the
Android splash (make_assets.py) and the brand SVGs all come from it.

`python steel_wordmark.py --android [CAP_DP] > mettleup_name.xml` writes the flat name as an Android
VectorDrawable (Wear OS watch app, or any Android view), cap height CAP_DP dp (default 16: about 32 px
on a watch, over BRAND.md's 20 px minimum). Below a 20 px cap height use the mark alone.
"""
import math
import sys

H, S = 100, 25          # cap height, stroke
C = 9                   # small corner cut, horizontal
D = round(C * math.tan(math.radians(30)))      # ... vertical: the hexagon's 30-degree edge
C3 = 15                 # larger cut: U bottom, P bowl
D3 = round(C3 * math.tan(math.radians(30)))
TRACK = 7
WORD = 'METTLEUP'
SPLIT = 6               # "METTLE" | "UP"

STEEL_FILL = [(0, '#FFFFFF'), (0.44, '#C6CBD3'), (0.5, '#7A818C'), (0.56, '#9BA2AD'), (1, '#D9DDE3')]
FORGE_FILL = [(0, '#FFC08F'), (0.44, '#FF8A4C'), (0.5, '#C9481A'), (0.56, '#E0581F'), (1, '#FF8A4C')]
# The same shine on LIGHT backgrounds, in gunmetal (owner, 9 Nov 2026, R-425): the bright top of
# STEEL_FILL vanishes into a white page, so the same shape (bright top, dark middle band, lighter
# bottom) is set darker so every part of every letter reads on #FFFFFF.
STEEL_ON_LIGHT = [(0, '#6E7580'), (0.44, '#454B55'), (0.5, '#16191F'), (0.56, '#2F343C'), (1, '#5F6670')]
FORGE_ON_LIGHT = [(0, '#F0662A'), (0.44, '#E0581F'), (0.5, '#9E3510'), (0.56, '#C9481A'), (1, '#E0581F')]


def letters():
    """Each letter: (advance width, outer polygon, [holes])."""
    m = 108
    M = (m, [(0, H - D), (0, D), (C, 0), (S + 9, 0), (m / 2, 52), (m - S - 9, 0), (m - C, 0), (m, D), (m, H - D),
             (m - C, H), (m - S, H), (m - S, 42), (m / 2 + 7, 90), (m / 2 - 7, 90), (S, 42), (S, H), (C, H)], [])
    e = 72
    mid = H / 2
    E = (e, [(C, 0), (e, 0), (e, S), (S, S), (S, mid - S / 2 + 1), (e - 8, mid - S / 2 + 1), (e - 8, mid + S / 2 - 1),
             (S, mid + S / 2 - 1), (S, H - S), (e, H - S), (e, H), (C, H), (0, H - D), (0, D)], [])
    t = 76
    T = (t, [(C, 0), (t - C, 0), (t, D), (t, S), (t / 2 + S / 2, S), (t / 2 + S / 2, H), (t / 2 - S / 2, H),
             (t / 2 - S / 2, S), (0, S), (0, D)], [])
    l_ = 66
    L = (l_, [(C, 0), (S, 0), (S, H - S), (l_, H - S), (l_, H), (C, H), (0, H - D), (0, D)], [])
    u = 80
    U = (u, [(0, 0), (S, 0), (S, H - S), (u - S, H - S), (u - S, 0), (u, 0), (u, H - D3), (u - C3, H), (C3, H),
             (0, H - D3)], [])
    p = 76
    pb = H * 0.6
    P = (p, [(0, H - D), (0, D), (C, 0), (p - C3, 0), (p, D3), (p, pb - D3), (p - C3, pb), (S, pb), (S, H), (C, H)],
         [[(S, S), (p - S, S), (p - S, pb - S), (S, pb - S)]])
    return dict(M=M, E=E, T=T, L=L, U=U, P=P)


def _area2(poly):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]))


def _n(v):
    v = round(v, 2)
    return str(int(v)) if v == int(v) else f'{v:g}'


def _sub(poly, wind):
    """One closed subpath, wound `wind` (+1 / -1 by signed area), so holes cut with nonzero fill."""
    if (_area2(poly) > 0) != (wind > 0):
        poly = poly[::-1]
    return 'M' + 'L'.join(f'{_n(x)} {_n(y)}' for x, y in poly) + 'Z'


def width():
    L = letters()
    return sum(L[c][0] for c in WORD) + TRACK * (len(WORD) - 1)


def paths():
    """(METTLE path, UP path, total width) on the cap-100 grid, origin at the top-left of the M."""
    L = letters()
    parts = ['', '']
    x = 0
    for i, ch in enumerate(WORD):
        lw, outer, holes = L[ch]
        d = _sub([(x + px, py) for px, py in outer], +1)
        for h in holes:
            d += _sub([(x + px, py) for px, py in h], -1)
        parts[1 if i >= SPLIT else 0] += d
        x += lw + TRACK
    return parts[0], parts[1], width()


def _grad(uid, stops, y0, y1):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return (f'<linearGradient id="{uid}" gradientUnits="userSpaceOnUse" x1="0" y1="{_n(y0)}" x2="0" '
            f'y2="{_n(y1)}">{s}</linearGradient>')


def svg_body(x, top, cap, uid, steel=True, ink='#E8EAEE', accent='#F0662A', light=False):
    """The wordmark at (x, top) with cap height `cap`: SVG markup (defs included). Returns (markup, width)."""
    mettle, up, w = paths()
    k = cap / H
    tf = f'translate({_n(x)} {_n(top)}) scale({k:.6g})'
    if steel:
        sf, ff = (STEEL_ON_LIGHT, FORGE_ON_LIGHT) if light else (STEEL_FILL, FORGE_FILL)  # light = on a light page
        defs = '<defs>' + _grad(f'{uid}s', sf, 0, H) + _grad(f'{uid}f', ff, 0, H) + '</defs>'
        f1, f2 = f'url(#{uid}s)', f'url(#{uid}f)'
    else:
        defs, f1, f2 = '', ink, accent
    body = (f'{defs}<g transform="{tf}"><path d="{mettle}" fill="{f1}"/>'
            f'<path d="{up}" fill="{f2}"/></g>')
    return body, w * k


def ts_block():
    mettle, up, w = paths()
    return ('/** "METTLE" and "UP", the "steel plate" wordmark (R-259), cap height 100 on this grid. */\n'
            f"export const WORDMARK_METTLE_D =\n  '{mettle}';\n"
            f"export const WORDMARK_UP_D =\n  '{up}';\n"
            '/** The wordmark\'s ink box: the M\'s left edge to the P\'s right edge, cap line to baseline. */\n'
            f'export const WORDMARK_BOX = {{ x: 0, y: 0, w: {_n(w)}, h: {H} }} as const;\n'
            + _ts_stops('WORDMARK_STEEL_STOPS', '"METTLE": polished steel', STEEL_FILL)
            + _ts_stops('WORDMARK_FORGE_STOPS', '"UP": orange metal', FORGE_FILL))


def _ts_stops(name, what, stops):
    """A stop list as TypeScript (offsets: cap line 0, baseline 1)."""
    rows = ''.join(f"  {{ offset: {o}, color: '{c}' }},\n" for o, c in stops)
    return (f'/** {what}, every size (owner, 9 Nov 2026: never flat). Vertical, cap line (0) to baseline (1). */\n'
            f'export const {name}: readonly WordmarkStop[] = [\n{rows}];\n')


def android_vector(cap_dp=16, ink='#E8EAEE', accent='#F0662A'):
    """The flat wordmark ("METTLE" Iron, "UP" Forge) as an Android VectorDrawable, `cap_dp` high."""
    mettle, up, w = paths()
    argb = lambda c: '#FF' + c.lstrip('#').upper()
    nl = chr(10)
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<!-- MettleUp's \"steel plate\" name (R-259), flat. Generated by "
        'branding/mettleup/_src/steel_wordmark.py (android option); do not edit by hand. -->',
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
        f'    android:width="{_n(cap_dp * w / H)}dp"',
        f'    android:height="{_n(cap_dp)}dp"',
        f'    android:viewportWidth="{_n(w)}"',
        f'    android:viewportHeight="{H}">',
        f'  <path android:fillColor="{argb(ink)}" android:pathData="{mettle}" />',
        f'  <path android:fillColor="{argb(accent)}" android:pathData="{up}" />',
        '</vector>',
    ]
    return nl.join(lines) + nl


if __name__ == '__main__':
    if '--ts' in sys.argv:
        sys.stdout.write(ts_block())
    elif '--android' in sys.argv:
        rest = sys.argv[sys.argv.index('--android') + 1:]
        sys.stdout.write(android_vector(float(rest[0]) if rest else 16))
    else:
        print(width())
