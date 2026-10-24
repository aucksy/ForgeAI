"""
MettleUp brand library (logo E "Forged"): mark geometry, colours, outlined type,
store-screenshot scene, and a crisp SVG -> PNG renderer.

Everything here is exact vector geometry. Type is outlined from the OFL Manrope the
app already ships (node_modules/@expo-google-fonts/manrope), with its own kerning,
so nothing depends on fonts installed on the machine that renders it.

Renderer: resvg (pip package `resvg-py`), the same engine Chrome-class tools use for
static SVG. It anti-aliases each edge once at the target size: no bitmap rescaling.
"""
import base64
import io
import math
import os
import sys

import resvg_py
from PIL import Image, ImageCms

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.dirname(HERE)                                   # branding/mettleup
ROOT = os.path.abspath(os.path.join(BRAND, '..', '..'))          # repo root

def _load_logo_generator():
    """The logo generator (branding/logo-options/_src/build.py: exact geometry + outlined
    Manrope), loaded under its own name so it never collides with another 'build' module."""
    import importlib.util
    p = os.path.abspath(os.path.join(BRAND, '..', 'logo-options', '_src', 'build.py'))
    spec = importlib.util.spec_from_file_location('mettleup_logo_build', p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


LOGO = _load_logo_generator()

# ------------------------------------------------------------------ colours
MOLTEN = '#FF8A4C'   # top faces, emphasis on dark
FORGE = '#F0662A'    # side faces, primary brand orange
SLAG = '#C9481A'     # bottom faces, orange on light backgrounds
STEEL = '#1B1F26'    # icon tile, dark surfaces
IRON = '#E8EAEE'     # wordmark letters on dark (from the chosen wordmark-dark.svg)
EMBER = '#E0581F'    # "UP" on light (from the chosen wordmark.svg)
DEEP = '#111418'     # darkest stop of store backgrounds
BODY_ON_DARK = '#B9BFC8'  # secondary text on Steel (checked >= 4.5:1 in BRAND.md)

FACETS = dict(hi=MOLTEN, mid=FORGE, lo=SLAG)

MAN_XB = LOGO.MAN_XB
MAN_SB = 'manrope/600SemiBold/Manrope_600SemiBold.ttf'
MAN_B = 'manrope/700Bold/Manrope_700Bold.ttf'


def n(v):
    return LOGO.n(v)


def poly(pts):
    return LOGO.poly(pts)


# ------------------------------------------------------------------ mark
HEX_C = (256.0, 256.0)
HEX_R = 204.0
# The M as drawn in the chosen logo: a 42-unit stroke through these points.
M_PTS = [(184, 346), (184, 188), (256, 274), (328, 188), (328, 346)]
M_W = 42
# Small-size M (<= 32 px: notification, favicon 16/32, Wear status chip), drawn on the 24 px
# status-bar grid: hex corners on a 10 px circle, M 10 px wide x 10 px tall (x 7-17, y 7-17),
# stems exactly 2 px and on whole pixels, V apex at y 12.6, so the two counters under the V
# stay open at 24 px. Picked from six variants rendered at 24 and 16 px (review, 24 Oct 2026).
_U = HEX_R / 10                          # 512-grid units per px at 24 px


def _px(v):
    return 256 + (v - 12) * _U


M_PTS_SMALL = [(_px(8), _px(17)), (_px(8), _px(7)), (256, _px(12.6)), (_px(16), _px(7)), (_px(16), _px(17))]
M_W_SMALL = 2 * _U


def hex_pts(cx=HEX_C[0], cy=HEX_C[1], R=HEX_R):
    return [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a)))
            for a in (-90, -30, 30, 90, 150, 210)]


def facet_paths():
    V = hex_pts()
    C = HEX_C
    tri = lambda i: [C, V[i], V[(i + 1) % 6]]  # noqa: E731
    return dict(hi=poly(tri(5)) + poly(tri(0)),
                mid=poly(tri(1)) + poly(tri(4)),
                lo=poly(tri(2)) + poly(tri(3)))


def m_outline(small=False):
    pts = M_PTS_SMALL if small else M_PTS
    w = M_W_SMALL if small else M_W
    return LOGO.stroke_outline(pts, w, cuts={1: pts[1][1], 3: pts[3][1]})


def hex_path():
    return poly(hex_pts())


def mark_t(cx, cy, R):
    """transform placing the 512-grid mark with its hex centre at (cx, cy), circumradius R"""
    s = R / HEX_R
    return f'matrix({n(s)} 0 0 {n(s)} {n(cx - HEX_C[0] * s)} {n(cy - HEX_C[1] * s)})'


def mark(cx, cy, R, uid, mode='colour', small=False, colour='#FFFFFF', paint_m=None,
         facets=None, with_m=True):
    """SVG for the mark.
    mode 'colour': three-tone facets, the M knocked out (transparent) unless paint_m is given.
    mode 'mono'  : one colour, M knocked out (even-odd), for themed icons / notifications."""
    t = mark_t(cx, cy, R)
    mo = poly(m_outline(small))
    if mode == 'mono':
        d = hex_path() + (mo if with_m else '')
        return f'<path transform="{t}" fill-rule="evenodd" d="{d}" fill="{colour}"/>'
    f = facets or FACETS
    fp = facet_paths()
    # A full hex in the side colour underneath: the facets' shared edges can never show the
    # background through an anti-aliasing hairline.
    body = (f'<path d="{hex_path()}" fill="{f["mid"]}"/>'
            f'<path d="{fp["hi"]}" fill="{f["hi"]}"/><path d="{fp["mid"]}" fill="{f["mid"]}"/>'
            f'<path d="{fp["lo"]}" fill="{f["lo"]}"/>')
    if not with_m:
        return f'<g transform="{t}">{body}</g>'
    if paint_m:
        return f'<g transform="{t}">{body}<path d="{mo}" fill="{paint_m}"/></g>'
    m = f'mk{uid}'
    return (f'<g transform="{t}"><mask id="{m}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">'
            f'<rect width="512" height="512" fill="#fff"/><path d="{mo}" fill="#000"/></mask>'
            f'<g mask="url(#{m})">{body}</g></g>')


def mono_points(small=True, size=24.0, R=None, cx=None, cy=None):
    """Hex + M outlines transformed to a size x size grid (for Android vector drawables)."""
    R = R if R is not None else size * 10 / 24
    cx = size / 2 if cx is None else cx
    cy = size / 2 if cy is None else cy
    s = R / HEX_R
    tf = lambda p: (cx + (p[0] - HEX_C[0]) * s, cy + (p[1] - HEX_C[1]) * s)  # noqa: E731
    return [tf(p) for p in hex_pts()], [tf(p) for p in m_outline(small)]


def facet_points(size, R, cx=None, cy=None):
    cx = size / 2 if cx is None else cx
    cy = size / 2 if cy is None else cy
    s = R / HEX_R
    tf = lambda p: (cx + (p[0] - HEX_C[0]) * s, cy + (p[1] - HEX_C[1]) * s)  # noqa: E731
    V = [tf(p) for p in hex_pts()]
    C = (cx, cy)
    tri = lambda i: [C, V[i], V[(i + 1) % 6]]  # noqa: E731
    return V, dict(hi=[tri(5), tri(0)], mid=[tri(1), tri(4)], lo=[tri(2), tri(3)])


# ------------------------------------------------------------------ type
def text_d(text, size, x=0.0, base=0.0, font=MAN_XB, track=-0.02):
    """Outlined text. size = font size in px. Returns (path d, advance end x)."""
    F = LOGO.face(font)
    cap = size * F.cap / F.upm
    runs, end = LOGO.set_text(font, text, cap, track, x0=x, base=base)
    return ''.join(d for _, d in runs), end


def text_w(text, size, font=MAN_XB, track=-0.02):
    return text_d(text, size, 0, 0, font, track)[1]


def cap_of(size, font=MAN_XB):
    F = LOGO.face(font)
    return size * F.cap / F.upm


def rich_line(line, size, x, base, colour, accent, font=MAN_XB, track=-0.02):
    """A line where *stars* mark accent words. Returns (svg, end x)."""
    parts = line.split('*')
    out, cx = '', x
    for i, p in enumerate(parts):
        if not p:
            continue
        d, cx = text_d(p, size, cx, base, font, track)
        out += f'<path d="{d}" fill="{accent if i % 2 else colour}"/>'
    return out, cx


def rich_w(line, size, font=MAN_XB, track=-0.02):
    return text_w(line.replace('*', ''), size, font, track)


WORD_TRACK = 0.06  # the chosen wordmark: Manrope ExtraBold caps, +0.06 em


def wordmark_text(x, base, cap, scheme='dark'):
    """'METTLEUP' alone, outlined exactly as the chosen lockup sets it. Returns (svg, end x)."""
    runs, end = LOGO.set_text(MAN_XB, 'METTLEUP', cap, WORD_TRACK, x0=x, base=base)
    word, up = (IRON, MOLTEN) if scheme == 'dark' else (STEEL, EMBER)
    a = ''.join(d for i, d in runs if i < 6)
    b = ''.join(d for i, d in runs if i >= 6)
    return f'<path d="{a}" fill="{word}"/><path d="{b}" fill="{up}"/>', end


def wordmark_w(cap):
    return LOGO.set_text(MAN_XB, 'METTLEUP', cap, WORD_TRACK)[1]


def lockup(scheme, uid=''):
    """The chosen horizontal lockup (mark + METTLEUP) at cap 100. Returns (viewBox, body)."""
    c = next(c for c in LOGO.CONCEPTS if c['key'] == 'E')
    return LOGO.lockup(c, scheme, cap=100, uid=uid)


# ------------------------------------------------------------------ svg + render
def svg(w, h, body, vb=None, title=None):
    vb = vb or f'0 0 {n(w)} {n(h)}'
    t = f'<title>{title}</title>' if title else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'width="{n(w)}" height="{n(h)}" viewBox="{vb}">{t}{body}</svg>')


SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()


def raster(svg_text, w, h):
    png = resvg_py.svg_to_bytes(svg_string=svg_text, width=w, height=h)
    im = Image.open(io.BytesIO(bytes(png)))
    im.load()
    if im.size != (w, h):
        raise SystemExit(f'renderer gave {im.size}, wanted {(w, h)}')
    return im.convert('RGBA')


def save(im, path, mode='RGBA', bg=STEEL, srgb=True):
    """mode RGBA keeps alpha; RGB flattens onto bg (Play forbids alpha on graphics)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if mode == 'RGB':
        base = Image.new('RGBA', im.size, bg)
        base.alpha_composite(im.convert('RGBA'))
        im = base.convert('RGB')
    kw = dict(optimize=True)
    if srgb:
        kw['icc_profile'] = SRGB
    im.save(path, **kw)
    return path


def render(svg_text, path, w, h, mode='RGBA', bg=STEEL):
    return save(raster(svg_text, w, h), path, mode, bg)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)


def data_uri(path_or_im):
    if isinstance(path_or_im, Image.Image):
        b = io.BytesIO()
        path_or_im.save(b, 'PNG')
        raw = b.getvalue()
    else:
        with open(path_or_im, 'rb') as fh:
            raw = fh.read()
    return 'data:image/png;base64,' + base64.b64encode(raw).decode('ascii')


# ------------------------------------------------------------------ contrast
def _lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(hexc):
    h = hexc.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# ------------------------------------------------------------------ store scene
SHOT_W, SHOT_H = 1080, 1920
MARGIN = 88
HEAD_SIZE = 94            # headline font size
HEAD_MIN = 74
HEAD_LEAD = 1.04
SUB_SIZE = 40
HEAD_CAP_TOP = 148        # y of the first line's cap top
PHONE_W = 800
PHONE_Y = 520
BEZEL = 18
SCREEN_ASPECT = 2400 / 1080   # 20:9, the shape of a modern Android screenshot
PHONE_R = 76
SCREEN_R = 58


def phone_geom(cx):
    x = cx - PHONE_W / 2
    sw = PHONE_W - 2 * BEZEL
    sh = round(sw * SCREEN_ASPECT)
    return dict(x=x, y=PHONE_Y, w=PHONE_W, h=sh + 2 * BEZEL,
                sx=x + BEZEL, sy=PHONE_Y + BEZEL, sw=sw, sh=sh)


def hex_lattice(w, h, R=64, stroke=1.6, colour='#FFFFFF', opacity=0.045):
    """Pointy-top hex outlines tiling the canvas (one path)."""
    dx = math.sqrt(3) * R
    dy = 1.5 * R
    d = []
    row = 0
    y = -R
    while y < h + R:
        off = (dx / 2) if row % 2 else 0
        x = -dx + off
        while x < w + dx:
            d.append(poly(hex_pts(x, y, R)))
            x += dx
        y += dy
        row += 1
    return f'<path d="{"".join(d)}" fill="none" stroke="{colour}" stroke-width="{stroke}" opacity="{opacity}"/>'


def background(w, h, uid, glows, lattice_mask=True):
    """Brand background: steel gradient, molten glow(s), faint forged hex lattice, grain.
    glows: list of (cx, cy, r, opacity)."""
    defs = (f'<linearGradient id="bg{uid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#232933"/><stop offset="0.45" stop-color="{STEEL}"/>'
            f'<stop offset="1" stop-color="{DEEP}"/></linearGradient>')
    body = f'<rect width="{w}" height="{h}" fill="url(#bg{uid})"/>'
    for i, (cx, cy, r, op) in enumerate(glows):
        defs += (f'<radialGradient id="gl{uid}{i}" gradientUnits="userSpaceOnUse" cx="{n(cx)}" cy="{n(cy)}" r="{n(r)}">'
                 f'<stop offset="0" stop-color="{FORGE}" stop-opacity="{op}"/>'
                 f'<stop offset="0.45" stop-color="{SLAG}" stop-opacity="{op * 0.45}"/>'
                 f'<stop offset="1" stop-color="{SLAG}" stop-opacity="0"/></radialGradient>')
        body += f'<rect width="{w}" height="{h}" fill="url(#gl{uid}{i})"/>'
    lat = hex_lattice(w, h)
    if lattice_mask:
        defs += (f'<linearGradient id="lm{uid}" x1="0" y1="0" x2="0" y2="1">'
                 f'<stop offset="0" stop-color="#fff" stop-opacity="0.15"/>'
                 f'<stop offset="0.35" stop-color="#fff" stop-opacity="1"/>'
                 f'<stop offset="1" stop-color="#fff" stop-opacity="0.6"/></linearGradient>'
                 f'<mask id="lmk{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}">'
                 f'<rect width="{w}" height="{h}" fill="url(#lm{uid})"/></mask>')
        lat = f'<g mask="url(#lmk{uid})">{lat}</g>'
    body += lat
    body += grain(w, h, uid)
    return defs, body


def grain(w, h, uid, opacity=0.06):
    return (f'<filter id="gr{uid}" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/>'
            f'<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.55"/></filter>'
            f'<rect width="{w}" height="{h}" filter="url(#gr{uid})" opacity="{opacity}"/>')


def placeholder_screen(g, label, hint):
    """A visibly-unfinished slot: hatch + the words APP SCREEN n. Never mistakable for the app."""
    x, y, w, h = g['sx'], g['sy'], g['sw'], g['sh']
    hatch = ''.join(f'M{n(x + i)} {n(y)}l{n(-h * 0.5)} {n(h)}' for i in range(0, int(w + h * 0.5), 46))
    vis_mid = y + min(h, SHOT_H - y) * 0.42
    l1, w1 = text_d(label, 46, 0, 0, MAN_XB, 0.04)
    l2, w2 = text_d(hint, 28, 0, 0, MAN_SB, 0)
    t1 = f'<path transform="translate({n(x + (w - w1) / 2)} {n(vis_mid)})" d="{l1}" fill="#8C939E"/>'
    t2 = f'<path transform="translate({n(x + (w - w2) / 2)} {n(vis_mid + 54)})" d="{l2}" fill="#6E7682"/>'
    return (f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}" fill="#20252D"/>'
            f'<path d="{hatch}" stroke="#FFFFFF" stroke-opacity="0.035" stroke-width="14"/>' + t1 + t2)


def phone(g, uid, screen_svg):
    """Pixel-style frame. screen_svg is drawn clipped to the screen."""
    x, y, w, h = g['x'], g['y'], g['w'], g['h']
    sx, sy, sw, sh = g['sx'], g['sy'], g['sw'], g['sh']
    cxp = x + w / 2
    defs = (f'<filter id="sh{uid}" x="-30%" y="-20%" width="160%" height="150%">'
            f'<feGaussianBlur stdDeviation="42"/></filter>'
            f'<filter id="cs{uid}" x="-10%" y="-10%" width="120%" height="120%">'
            f'<feGaussianBlur stdDeviation="9"/></filter>'
            f'<linearGradient id="bd{uid}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="#3B424D"/><stop offset="0.5" stop-color="#1E2228"/>'
            f'<stop offset="1" stop-color="#2A2F37"/></linearGradient>'
            f'<linearGradient id="rim{uid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.30"/>'
            f'<stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.06"/>'
            f'<stop offset="1" stop-color="{MOLTEN}" stop-opacity="0.55"/></linearGradient>'
            f'<clipPath id="sc{uid}"><rect x="{n(sx)}" y="{n(sy)}" width="{n(sw)}" height="{n(sh)}" rx="{SCREEN_R}"/></clipPath>')
    body = (
        # long soft shadow, tinted toward the slag of the glow, then a tight contact shadow
        f'<rect x="{n(x + 20)}" y="{n(y + 60)}" width="{n(w - 40)}" height="{n(h)}" rx="{PHONE_R}" '
        f'fill="#05060A" opacity="0.75" filter="url(#sh{uid})"/>'
        f'<rect x="{n(x + 6)}" y="{n(y + 14)}" width="{n(w - 12)}" height="{n(h)}" rx="{PHONE_R}" '
        f'fill="#05060A" opacity="0.7" filter="url(#cs{uid})"/>'
        # side buttons
        f'<rect x="{n(x + w - 2)}" y="{n(y + 250)}" width="7" height="118" rx="3" fill="#2C3139"/>'
        f'<rect x="{n(x + w - 2)}" y="{n(y + 420)}" width="7" height="190" rx="3" fill="#2C3139"/>'
        # body, rim light, glass bezel
        f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}" rx="{PHONE_R}" fill="url(#bd{uid})"/>'
        f'<rect x="{n(x + 1.5)}" y="{n(y + 1.5)}" width="{n(w - 3)}" height="{n(h - 3)}" rx="{PHONE_R - 1.5}" '
        f'fill="none" stroke="url(#rim{uid})" stroke-width="3"/>'
        f'<rect x="{n(x + 7)}" y="{n(y + 7)}" width="{n(w - 14)}" height="{n(h - 14)}" rx="{PHONE_R - 7}" fill="#050608"/>'
        f'<g clip-path="url(#sc{uid})">{screen_svg}</g>'
        # punch-hole camera
        f'<circle cx="{n(cxp)}" cy="{n(sy + 34)}" r="13" fill="#050608"/>'
        f'<circle cx="{n(cxp)}" cy="{n(sy + 34)}" r="13" fill="none" stroke="#2A2F37" stroke-width="2"/>'
    )
    return defs, body


def screenshot_svg(g, img_path_or_im):
    """A real app screenshot, scaled to cover the screen width and anchored to the top."""
    uri = data_uri(img_path_or_im)
    return (f'<image x="{n(g["sx"])}" y="{n(g["sy"])}" width="{n(g["sw"])}" height="{n(g["sh"])}" '
            f'preserveAspectRatio="xMidYMin slice" href="{uri}" xlink:href="{uri}"/>')


def headline(caption, x0, uid):
    """Headline (1-2 lines, '\n' breaks, *accent*) + optional sub. Auto-fits the width."""
    lines = caption['headline'].split('\n')
    maxw = SHOT_W - 2 * MARGIN
    size = HEAD_SIZE
    while size > HEAD_MIN and max(rich_w(l, size) for l in lines) > maxw:
        size -= 2
    if max(rich_w(l, size) for l in lines) > maxw:
        raise SystemExit(f'headline too long even at {HEAD_MIN}px: {caption["headline"]!r}')
    cap = cap_of(size)
    base = HEAD_CAP_TOP + cap
    out = ''
    for l in lines:
        s, _ = rich_line(l, size, x0 + MARGIN, base, '#F4F5F7', MOLTEN)
        out += s
        base += size * HEAD_LEAD
    last = base - size * HEAD_LEAD
    sub = caption.get('sub')
    if sub:
        if text_w(sub, SUB_SIZE, MAN_SB, 0) > maxw:
            raise SystemExit(f'sub too long: {sub!r}')
        d, _ = text_d(sub, SUB_SIZE, x0 + MARGIN, last + 76, MAN_SB, 0)
        out += f'<path d="{d}" fill="{BODY_ON_DARK}"/>'
    return out


def dumbbell(x0, x1, cy, R, uid):
    """The panorama prop: a long bar with two faceted hex heads (the mark's own facets, no M).
    Bar runs between the heads' inner faces; heads centred on x0 and x1."""
    hw = R * math.sqrt(3) / 2
    bx0, bx1 = x0 + hw - 8, x1 - hw + 8
    th = 74
    defs = (f'<linearGradient id="bar{uid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#4A515C"/><stop offset="0.22" stop-color="#D4D8DE"/>'
            f'<stop offset="0.42" stop-color="#8C939D"/><stop offset="0.78" stop-color="#3A4049"/>'
            f'<stop offset="1" stop-color="{SLAG}"/></linearGradient>'
            f'<linearGradient id="col{uid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#5A616C"/><stop offset="0.25" stop-color="#E2E5EA"/>'
            f'<stop offset="0.5" stop-color="#7C838E"/><stop offset="1" stop-color="#262A31"/></linearGradient>'
            f'<filter id="dbs{uid}" x="-5%" y="-50%" width="110%" height="250%"><feGaussianBlur stdDeviation="16"/></filter>'
            f'<pattern id="kn{uid}" patternUnits="userSpaceOnUse" width="12" height="12">'
            f'<path d="M0 12L12 0M-3 3L3 -3M9 15L15 9M0 0L12 12M-3 9L3 15M9 -3L15 3" stroke="#11141A" stroke-width="1.6" opacity="0.55"/></pattern>')
    body = ''
    # shadow of the whole prop on what is behind it
    body += (f'<rect x="{n(bx0)}" y="{n(cy - th / 2 + 26)}" width="{n(bx1 - bx0)}" height="{th}" rx="{th / 2}" '
             f'fill="#05060A" opacity="0.65" filter="url(#dbs{uid})"/>')
    for hx in (x0, x1):
        body += (f'<path d="{poly(hex_pts(hx, cy + 30, R))}" fill="#05060A" opacity="0.6" filter="url(#dbs{uid})"/>')
    # bar + knurl band in the middle third (this is what crosses the seam)
    body += f'<rect x="{n(bx0)}" y="{n(cy - th / 2)}" width="{n(bx1 - bx0)}" height="{th}" fill="url(#bar{uid})"/>'
    mid = (bx0 + bx1) / 2
    kw = (bx1 - bx0) * 0.30
    body += (f'<rect x="{n(mid - kw / 2)}" y="{n(cy - th / 2)}" width="{n(kw)}" height="{th}" fill="url(#kn{uid})"/>')
    # collars
    for cx, sgn in ((bx0, 1), (bx1, -1)):
        cw = 44
        cxl = cx if sgn > 0 else cx - cw
        body += (f'<rect x="{n(cxl)}" y="{n(cy - 70)}" width="{cw}" height="140" rx="10" fill="url(#col{uid})"/>')
    # heads: the mark's facets, no M
    for i, hx in enumerate((x0, x1)):
        body += mark(hx, cy, R, f'{uid}h{i}', with_m=False)
    return defs, body


def store_scene(shots, captions, screens, uid='s'):
    """Render one store canvas. shots: list of shot indexes laid side by side (1 or 2 for the
    panorama). screens: {index: image path | PIL image | None}. Returns svg text, width."""
    W = SHOT_W * len(shots)
    pano = len(shots) == 2
    if pano:
        glows = [(W / 2, 1640, 1180, 0.34), (W / 2, 2050, 700, 0.30)]
    else:
        glows = [(SHOT_W / 2, 1880, 980, 0.30)]
    # (Review, 24 Oct 2026: a dumbbell head peeking from a corner of shots 3-8 was tried and
    # removed: at 140 px beside the phone it read as an accidental orange sliver.)
    defs, body = background(W, SHOT_H, uid, glows)
    for k, idx in enumerate(shots):
        x0 = k * SHOT_W
        g = phone_geom(x0 + SHOT_W / 2)
        scr = screens.get(idx)
        inner = screenshot_svg(g, scr) if scr is not None else placeholder_screen(
            g, f'APP SCREEN {idx}', f'store/raw/{idx:02d}.png goes here')
        # the named slot, so a later script (or a person in a vector editor) can find it
        inner += (f'<rect id="screen-slot-{idx}" x="{n(g["sx"])}" y="{n(g["sy"])}" width="{n(g["sw"])}" '
                  f'height="{n(g["sh"])}" rx="{SCREEN_R}" fill="none"/>')
        d2, b2 = phone(g, f'{uid}{idx}', inner)
        defs += d2
        body += b2
        body += headline(captions[idx], x0, f'{uid}{idx}')
    if pano:
        R = 250
        d3, b3 = dumbbell(118, W - 118, 1712, R, uid + 'db')
        defs += d3
        body += b3
    return svg(W, SHOT_H, f'<defs>{defs}</defs>{body}'), W


def slot_rect(idx):
    """The screen slot of shot idx in its own 1080x1920 image (part may run off the bottom)."""
    g = phone_geom(SHOT_W / 2)
    return dict(x=g['sx'], y=g['sy'], w=g['sw'], h=g['sh'], r=SCREEN_R,
                visible_h=min(g['sh'], SHOT_H - g['sy']))
