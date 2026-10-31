"""
The "steel plate" wordmark (owner pick, R-259, 31 Oct 2026): METTLEUP drawn from straight strokes,
wide and heavy, one even stroke, small machined corner cuts at the hexagon's 30-degree angle, tight
spacing. Big sizes get a polished-steel fill (light top, a hard dark horizon, lighter bottom; "UP" in
orange metal); small sizes are flat Iron + Forge.

Exact polygons on a grid with cap height 100. This file is the one source: the app's lockup
(apps/mobile/src/components/brand/mettleUpMark.ts, written by `python steel_wordmark.py --ts`), the
Android splash (make_assets.py) and the brand SVGs all come from it.
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


def svg_body(x, top, cap, uid, steel=True, ink='#E8EAEE', accent='#F0662A'):
    """The wordmark at (x, top) with cap height `cap`: SVG markup (defs included). Returns (markup, width)."""
    mettle, up, w = paths()
    k = cap / H
    tf = f'translate({_n(x)} {_n(top)}) scale({k:.6g})'
    if steel:
        defs = '<defs>' + _grad(f'{uid}s', STEEL_FILL, 0, H) + _grad(f'{uid}f', FORGE_FILL, 0, H) + '</defs>'
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
            f'export const WORDMARK_BOX = {{ x: 0, y: 0, w: {_n(w)}, h: {H} }} as const;\n')


if __name__ == '__main__':
    if '--ts' in sys.argv:
        sys.stdout.write(ts_block())
    else:
        print(width())
