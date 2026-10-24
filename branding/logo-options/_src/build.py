"""
MettleUp logo options: one generator for every SVG and the showcase page.

    python branding/logo-options/_src/build.py

Every mark is exact geometry on a 512 grid (no raster, no live fonts). Wordmark
letters are outlined to paths from the OFL fonts the app already ships
(Sora, Space Grotesk, Manrope in node_modules/@expo-google-fonts), with the
font's own GPOS kerning applied.
"""
import json
import math
import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(OUT, '..', '..'))
FONTS = os.path.join(ROOT, 'node_modules', '@expo-google-fonts')


def n(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def poly(pts):
    return 'M' + ' '.join(f'{n(x)} {n(y)}' for x, y in pts) + 'Z'


# ---------------------------------------------------------------- geometry
def _line_x(p, d, q, e):
    """Intersection of line p+t*d with line q+s*e."""
    den = d[0] * e[1] - d[1] * e[0]
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + t * d[0], p[1] + t * d[1])


def _at_y(p, d, y):
    t = (y - p[1]) / d[1]
    return (p[0] + t * d[0], y)


def stroke_outline(pts, w, cuts=None):
    """Polygon of a polyline drawn with width w, butt ends, mitred joins.
    cuts: {vertex_index: y} flattens that join's outer spike at height y."""
    cuts = cuts or {}
    h = w / 2
    segs = []
    for a, b in zip(pts, pts[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        d = (dx / L, dy / L)
        segs.append((a, b, d, (-d[1], d[0])))
    sides = {1: [], -1: []}
    for s in (1, -1):
        a, b, d, nn = segs[0]
        sides[s].append((a[0] + s * h * nn[0], a[1] + s * h * nn[1]))
        for j in range(1, len(pts) - 1):
            a1, _, d1, n1 = segs[j - 1]
            a2, _, d2, n2 = segs[j]
            p1 = (a1[0] + s * h * n1[0], a1[1] + s * h * n1[1])
            p2 = (a2[0] + s * h * n2[0], a2[1] + s * h * n2[1])
            z = d1[0] * d2[1] - d1[1] * d2[0]
            outer = (-1 if z > 0 else 1) == s
            if outer and j in cuts:
                sides[s] += [_at_y(p1, d1, cuts[j]), _at_y(p2, d2, cuts[j])]
            else:
                sides[s].append(_line_x(p1, d1, p2, d2))
        a, b, d, nn = segs[-1]
        sides[s].append((b[0] + s * h * nn[0], b[1] + s * h * nn[1]))
    return sides[1] + sides[-1][::-1]


def rrect(x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    return (f'M{n(x + r)} {n(y)}H{n(x + w - r)}A{n(r)} {n(r)} 0 0 1 {n(x + w)} {n(y + r)}'
            f'V{n(y + h - r)}A{n(r)} {n(r)} 0 0 1 {n(x + w - r)} {n(y + h)}H{n(x + r)}'
            f'A{n(r)} {n(r)} 0 0 1 {n(x)} {n(y + h - r)}V{n(y + r)}A{n(r)} {n(r)} 0 0 1 {n(x + r)} {n(y)}Z')


def rect_pts(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


# ------------------------------------------------------------------- fonts
class Face:
    def __init__(self, rel):
        self.f = TTFont(os.path.join(FONTS, rel))
        self.gs = self.f.getGlyphSet()
        self.cmap = self.f.getBestCmap()
        self.upm = self.f['head'].unitsPerEm
        self.cap = self.f['OS/2'].sCapHeight
        self.hmtx = self.f['hmtx']
        self._pairs = self._read_kern()

    def _read_kern(self):
        pairs = {}
        if 'GPOS' not in self.f:
            return pairs
        t = self.f['GPOS'].table
        idx = set()
        for fr in t.FeatureList.FeatureRecord:
            if fr.FeatureTag == 'kern':
                idx.update(fr.Feature.LookupListIndex)
        self._subs = []
        for i in sorted(idx):
            lk = t.LookupList.Lookup[i]
            for st in lk.SubTable:
                if lk.LookupType == 9:
                    st = st.ExtSubTable
                if getattr(st, 'LookupType', 2) == 2 or hasattr(st, 'PairSet') or hasattr(st, 'Class1Record'):
                    self._subs.append(st)
        return pairs

    def kern(self, l, r):
        for st in self._subs:
            cov = st.Coverage.glyphs
            if l not in cov:
                continue
            if st.Format == 1:
                ps = st.PairSet[cov.index(l)]
                for pv in ps.PairValueRecord:
                    if pv.SecondGlyph == r:
                        v = pv.Value1
                        return getattr(v, 'XAdvance', 0) or 0 if v else 0
            elif st.Format == 2:
                c1 = st.ClassDef1.classDefs.get(l, 0)
                c2 = st.ClassDef2.classDefs.get(r, 0)
                v = st.Class1Record[c1].Class2Record[c2].Value1
                x = (getattr(v, 'XAdvance', 0) or 0) if v else 0
                if x:
                    return x
        return 0

    def glyph(self, ch):
        return self.cmap[ord(ch)]

    def path(self, gname, x, base, s):
        pen = SVGPathPen(self.gs, ntos=n)
        self.gs[gname].draw(TransformPen(pen, (s, 0, 0, -s, x, base)))
        return pen.getCommands()

    def bounds(self, gname):
        from fontTools.pens.boundsPen import BoundsPen
        bp = BoundsPen(self.gs)
        self.gs[gname].draw(bp)
        return bp.bounds


SORA_XB = 'sora/800ExtraBold/Sora_800ExtraBold.ttf'
SORA_B = 'sora/700Bold/Sora_700Bold.ttf'
SORA_SB = 'sora/600SemiBold/Sora_600SemiBold.ttf'
SG_B = 'space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf'
MAN_XB = 'manrope/800ExtraBold/Manrope_800ExtraBold.ttf'
_faces = {}


def face(rel):
    if rel not in _faces:
        _faces[rel] = Face(rel)
    return _faces[rel]


def set_text(rel, text, cap_px, track_em=0.0, x0=0.0, base=0.0, custom=None):
    """Outline `text` so its cap height is cap_px. Returns (runs, advance_end).
    runs: list of (char_index, path_d). custom: {char_index: fn(x, base, s) -> (d, advance)}"""
    F = face(rel)
    s = cap_px / F.cap
    x = x0
    runs = []
    names = [F.glyph(c) for c in text]
    for i, g in enumerate(names):
        if custom and i in custom:
            d, adv = custom[i](x, base, s)
        else:
            d = F.path(g, x, base, s)
            adv = F.hmtx[g][0] * s
        runs.append((i, d))
        x += adv
        if i < len(names) - 1:
            x += F.kern(g, names[i + 1]) * s + track_em * F.upm * s
    return runs, x


# ------------------------------------------------------------------- marks
# Each mark: list of layers (role, d, pts) on the 512 grid. Roles map to colours.
def mark_A():
    # Ascent: an M with two sharp peaks; the second stands higher than the first.
    W, t, base = 84, 84, 424
    Lp, Rp, C = (90, 184), (422, 72), (256, 262)
    def off(p, q, k):  # line p->q shifted k to its lower side
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = math.hypot(dx, dy)
        nx, ny = -dy / L, dx / L
        if ny < 0:
            nx, ny = -nx, -ny
        return (p[0] + k * nx, p[1] + k * ny), (dx, dy)
    lp, ld = off(Lp, C, t)
    rp, rd = off(C, Rp, t)
    li = _line_x(lp, ld, (90 + W, 0), (0, 1))
    ri = _line_x(rp, rd, (422 - W, 0), (0, 1))
    vb = _line_x(lp, ld, rp, rd)
    out = [(90, base), Lp, C, Rp, (422, base), (422 - W, base), ri, vb, li, (90 + W, base)]
    return [('ink', poly(out), out)]


def mark_B():
    # Loaded: the bar is loaded light to heavy, left to right.
    layers = []
    bar = (56, 243, 400, 26)
    layers.append(('bar', rrect(*bar, 13), rect_pts(*bar)))
    pw, gap, x = 62, 22, 135
    for hgt in (148, 228, 308):
        r = (x, 256 - hgt / 2, pw, hgt)
        layers.append(('ink', rrect(*r, 16), rect_pts(*r)))
        x += pw + gap
    return layers


C_STROKE = 62
C_PATH = 'M100 380V150L181 288L262 150V280A75 75 0 0 0 412 280V119'


def mark_C():
    # Unbroken: M and U drawn as one line, from the floor to the top.
    h = C_STROKE / 2
    pts = [(100 - h, 380), (100 + h, 380), (100, 150 - h), (262, 150 - h), (412 - h, 119), (412 + h, 119)]
    for k in range(13):
        a = math.pi * k / 12
        x, y = 337 - 75 * math.cos(a), 280 + 75 * math.sin(a)
        pts += [(x - h * math.cos(a), y + h * math.sin(a))]
    return [('ink', C_PATH, pts, 'stroke')]


D_FONT = SORA_XB


def up_glyph(x, base, s, rise=0.5):
    """Sora ExtraBold 'U' with its right arm carried up past cap height into an arrow."""
    F = face(D_FONT)
    g = F.glyph('U')
    d = F.path(g, x, base, s)
    # right stem extents at cap height, read from the outline itself
    coords = F.f['glyf'][g].getCoordinates(F.f['glyf'])[0]
    top = [c[0] for c in coords if c[1] == F.cap]
    rx0, rx1 = sorted(top)[-2], sorted(top)[-1]
    capy = base - F.cap * s
    X0, X1 = x + rx0 * s, x + rx1 * s
    w = X1 - X0
    tip = capy - F.cap * s * rise
    shoulder = tip + w * 0.9
    barb = w * 0.42
    ext = [(X0, capy + 2 * s), (X0, shoulder), (X0 - barb, shoulder), ((X0 + X1) / 2, tip),
           (X1 + barb, shoulder), (X1, shoulder), (X1, capy + 2 * s)]
    return d + poly(ext), F.hmtx[g][0] * s, ext


def mark_D():
    F = face(D_FONT)
    g = F.glyph('U')
    b = F.bounds(g)
    s = 300 / F.cap  # cap height 300 on the grid
    gw = (b[2] - b[0]) * s
    x = 256 - gw / 2 - b[0] * s
    base = 256 + 300 * 1.5 / 2  # glyph + arrow centred on the grid; centred() refits it
    d, _, ext = up_glyph(x, base, s)
    pts = [(x + b[0] * s, base), (x + b[2] * s, base), (x + b[0] * s, base - 300)] + ext
    return [('ink', d, pts)]


def mark_E():
    # Forged: a hex dumbbell head, lit from above, with an M struck through it.
    cx, cy, R = 256, 256, 204
    V = [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a)))
         for a in (-90, -30, 30, 90, 150, 210)]
    C = (cx, cy)
    tri = lambda i: [C, V[i], V[(i + 1) % 6]]
    layers = [
        ('hi', poly(tri(5)) + poly(tri(0)), V),            # two top faces
        ('mid', poly(tri(1)) + poly(tri(4)), V),           # two side faces
        ('lo', poly(tri(2)) + poly(tri(3)), V),            # two bottom faces
    ]
    M = [(184, 346), (184, 188), (256, 274), (328, 188), (328, 346)]
    mo = stroke_outline(M, 42, cuts={1: 188, 3: 188})
    layers.append(('cut', poly(mo), mo))
    return layers


def mark_F():
    # Hidden Up: a block M whose lower counter is an arrow pointing up.
    x0, y0, x1, y1 = 104, 112, 408, 400
    sw = 90                      # stem width at the top
    top_apex = (256, 236)        # depth of the V
    head_tip, head_base, barb = 280, 336, 76
    shaft = 26                   # half width of the arrow's shaft
    out = [(x0, y0), (x0 + sw, y0), top_apex, (x1 - sw, y0), (x1, y0), (x1, y1),
           (256 + shaft, y1), (256 + shaft, head_base), (256 + barb, head_base), (256, head_tip),
           (256 - barb, head_base), (256 - shaft, head_base), (256 - shaft, y1), (x0, y1)]
    return [('ink', poly(out), out)]


# ---------------------------------------------------------------- concepts
CONCEPTS = [
    dict(key='A', name='Ascent', fn=mark_A,
         idea='An M whose second peak stands higher than the first: this week beats last week.',
         font=SORA_XB, font_note='Sora ExtraBold (the app display face), outlined',
         light=dict(ink='#E8641F', word='#0B0D12', up='#E8641F'),
         dark=dict(ink='#FF7A3B', word='#F4F5F7', up='#FF7A3B'),
         icon=dict(bg='#171B26', ink='#FF7A3B'),
         swatches=[('Ember', '#FF7A3B'), ('Ember deep', '#E8641F'), ('Night', '#0B0D12'), ('Icon night', '#171B26'), ('Bone', '#F4F5F7')]),
    dict(key='B', name='Loaded', fn=mark_B,
         idea='A bar loaded light to heavy, left to right: progressive overload you can see.',
         font=SG_B, font_note='Space Grotesk Bold, outlined',
         light=dict(ink='#123328', bar='#B58431', word='#123328', up='#B58431'),
         dark=dict(ink='#ECE5D3', bar='#D9A84E', word='#ECE5D3', up='#D9A84E'),
         icon=dict(bg='#123328', ink='#ECE5D3', bar='#D9A84E'),
         swatches=[('Pine', '#123328'), ('Chalk', '#ECE5D3'), ('Brass', '#D9A84E'), ('Brass deep', '#B58431')]),
    dict(key='C', name='Unbroken', fn=mark_C,
         idea='M and U in one unbroken line that starts on the floor and finishes at the top: you do not stop.',
         font=MAN_XB, font_note='Manrope ExtraBold, outlined',
         light=dict(ink='#15171B', word='#15171B', up='#15171B'),
         dark=dict(ink='#D4FF3A', word='#F2F3F0', up='#D4FF3A'),
         icon=dict(bg='#15171B', ink='#D4FF3A'),
         swatches=[('Volt', '#D4FF3A'), ('Graphite', '#15171B'), ('Fog', '#F2F3F0')]),
    dict(key='D', name='Up Arrow', fn=mark_D,
         idea='The wordmark does the work: the U of Up keeps climbing past the line.',
         font=D_FONT, font_note='Sora ExtraBold, outlined; the U is redrawn', wordmark_only=True,
         light=dict(ink='#E2312B', word='#0C0C0D', up='#E2312B'),
         dark=dict(ink='#FF4D3F', word='#F3EFE6', up='#FF4D3F'),
         icon=dict(bg='#E2312B', ink='#FFFFFF'),
         swatches=[('Signal red', '#E2312B'), ('Ink', '#0C0C0D'), ('Bone', '#F3EFE6')]),
    dict(key='E', name='Forged', fn=mark_E,
         idea='Mettle began as a spelling of metal: a hex dumbbell head with an M struck through it.',
         font=MAN_XB, font_note='Manrope ExtraBold caps, outlined',
         upper=True, track=0.06,
         light=dict(hi='#FF8A4C', mid='#F0662A', lo='#C9481A', cut='none', word='#1B1F26', up='#E0581F'),
         dark=dict(hi='#FF8A4C', mid='#F0662A', lo='#C9481A', cut='none', word='#E8EAEE', up='#FF8A4C'),
         icon=dict(bg='#1B1F26', hi='#FF8A4C', mid='#F0662A', lo='#C9481A', cut='none'),
         swatches=[('Molten', '#FF8A4C'), ('Forge', '#F0662A'), ('Slag', '#C9481A'), ('Steel', '#1B1F26')]),
    dict(key='F', name='Hidden Up', fn=mark_F,
         idea='A solid M with an up arrow cut through its base: the climb is built into the letter.',
         font=SORA_SB, font_note='Sora SemiBold, outlined',
         light=dict(ink='#2D3BFF', word='#0E1030', up='#2D3BFF'),
         dark=dict(ink='#7F89FF', word='#EEF0FF', up='#7F89FF'),
         icon=dict(bg='#2D3BFF', ink='#FFFFFF'),
         swatches=[('Cobalt', '#2D3BFF'), ('Cobalt light', '#7F89FF'), ('Midnight', '#0E1030'), ('White', '#FFFFFF')]),
]


def bbox(layers):
    xs, ys = [], []
    for L in layers:
        for x, y in L[2]:
            xs.append(x)
            ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def radius(layers, c):
    return max(math.hypot(x - c[0], y - c[1]) for L in layers for x, y in L[2])


def layer_svg(L, colours, cut_mode=None):
    role, d = L[0], L[1]
    stroke = len(L) > 3 and L[3] == 'stroke'
    col = colours.get(role, colours.get('ink'))
    if role == 'cut':
        return ''  # handled by mask
    if stroke:
        return (f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{C_STROKE}" '
                f'stroke-linejoin="round"/>')
    return f'<path d="{d}" fill="{col}"/>'


def mark_body(layers, colours, uid, paint_cut=None):
    """SVG body (no <svg>) in 512 space. A 'cut' layer knocks out everything under it,
    or, with paint_cut, is painted in that colour (Android vector drawables have no masks)."""
    cut = [L for L in layers if L[0] == 'cut']
    body = ''.join(layer_svg(L, colours) for L in layers)
    if cut and paint_cut:
        return body + f'<path d="{cut[0][1]}" fill="{paint_cut}"/>'
    if cut:
        m = f'm{uid}'
        return (f'<mask id="{m}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">'
                f'<rect width="512" height="512" fill="#fff"/><path d="{cut[0][1]}" fill="#000"/></mask>'
                f'<g mask="url(#{m})">{body}</g>')
    return body


def centred(layers, size=512, fill=0.80):
    """transform to centre the mark's bbox in the square, longest side = fill*size"""
    x0, y0, x1, y1 = bbox(layers)
    s = fill * size / max(x1 - x0, y1 - y0)
    tx = size / 2 - s * (x0 + x1) / 2
    ty = size / 2 - s * (y0 + y1) / 2
    return f'matrix({n(s)} 0 0 {n(s)} {n(tx)} {n(ty)})'


def svg_doc(vb, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')


def lockup(c, scheme, cap=100, uid=''):
    """Horizontal lockup: mark + 'MettleUp'. Returns (viewBox, body)."""
    layers = c['fn']()
    col = c[scheme]
    x0, y0, x1, y1 = bbox(layers)
    mh = cap * 1.42
    s = mh / (y1 - y0)
    mw = (x1 - x0) * s
    base = cap  # baseline; cap top at 0
    my = (base - cap / 2) - mh / 2
    mx = 0
    g = f'<g transform="matrix({n(s)} 0 0 {n(s)} {n(mx - x0 * s)} {n(my - y0 * s)})">{mark_body(layers, col, c["key"] + scheme + "w" + uid)}</g>'
    if c.get('wordmark_only'):
        g, mw, my, mh = '', -cap * 0.42, 0, cap
    text = 'METTLEUP' if c.get('upper') else 'MettleUp'
    custom = None
    if c['key'] == 'D':
        custom = {6: lambda x, b, sc: up_glyph(x, b, sc, rise=0.36)[:2]}
    runs, end = set_text(c['font'], text, cap, c.get('track', -0.01), x0=mw + cap * 0.42, base=base, custom=custom)
    mettle = ''.join(d for i, d in runs if i < 6)
    up = ''.join(d for i, d in runs if i >= 6)
    body = g + f'<path d="{mettle}" fill="{col["word"]}"/><path d="{up}" fill="{col["up"]}"/>'
    top = min(my, -cap * (0.38 if c['key'] == 'D' else 0.02))
    bottom = max(my + mh, base + cap * 0.3)
    pad = cap * 0.08
    vb = f'{n(-pad)} {n(top - pad)} {n(end + 2 * pad)} {n(bottom - top + 2 * pad)}'
    return vb, body


SAFE_R = 30.5  # dp; Android's guaranteed-visible circle is 33 dp on the 108 dp canvas


def adaptive_fg(c):
    layers = c['fn']()
    x0, y0, x1, y1 = bbox(layers)
    ctr = ((x0 + x1) / 2, (y0 + y1) / 2)
    r = radius(layers, ctr)
    s = SAFE_R / r
    tx, ty = 54 - s * ctr[0], 54 - s * ctr[1]
    t = f'matrix({n(s)} 0 0 {n(s)} {n(tx)} {n(ty)})'
    return t, mark_body(layers, c['icon'], c['key'] + 'icon', paint_cut=c['icon']['bg'])


# ------------------------------------------------------------------ write
def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)


def build_files():
    for c in CONCEPTS:
        d = os.path.join(OUT, c['key'])
        L = c['fn']()
        t = centred(L)
        for scheme, fname in (('light', 'mark.svg'), ('dark', 'mark-dark.svg')):
            write(os.path.join(d, fname), svg_doc('0 0 512 512',
                  f'<g transform="{t}">{mark_body(L, c[scheme], c["key"] + scheme)}</g>',
                  f'MettleUp mark, concept {c["key"]} {c["name"]}'))
        for scheme, fname in (('light', 'wordmark.svg'), ('dark', 'wordmark-dark.svg')):
            vb, body = lockup(c, scheme)
            write(os.path.join(d, fname), svg_doc(vb, body, 'MettleUp'))
        ft, fb = adaptive_fg(c)
        write(os.path.join(d, 'icon-adaptive-fg.svg'), svg_doc('0 0 108 108', f'<g transform="{ft}">{fb}</g>',
              'MettleUp adaptive icon foreground'))
        write(os.path.join(d, 'icon-adaptive-bg.svg'), svg_doc('0 0 108 108',
              f'<rect width="108" height="108" fill="{c["icon"]["bg"]}"/>',
              f'MettleUp adaptive icon background {c["icon"]["bg"]}'))
        write(os.path.join(d, 'concept.json'), json.dumps(dict(
            concept=c['key'], name=c['name'], idea=c['idea'], wordmark_font=c['font_note'],
            adaptive_icon_background=c['icon']['bg'],
            colours={k: v for k, v in c['swatches']}), indent=2) + '\n')


if __name__ == '__main__':
    build_files()
    import showcase
    showcase.build(CONCEPTS)
    print('built', OUT)
