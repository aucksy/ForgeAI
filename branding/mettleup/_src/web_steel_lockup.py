"""
The websites' logo (1 Nov 2026): the R-259 "steel plate" lockup, exactly as the phone app draws it in
apps/mobile/src/components/brand/MettleUpLogo.tsx: the Forged hex mark, then "METTLE" (white, for the
dark pages) and "UP" (Forge orange), the name's cap height 0.44 x the mark, 0.32 x the mark apart,
the name centred on the mark.

Writes apps/dashboard/public/brand/lockup-steel.svg (used by the headers of mettleup.fit and
gyms.mettleup.fit). Never edit that file by hand: change the source and run

    python branding/mettleup/_src/web_steel_lockup.py

Sources, so it cannot drift:
  - the name's letters come from steel_wordmark.py (the one source of the letters);
  - the mark's six faces are built here the same way mettleUpMark.ts builds MARK_FACES.
Before writing, it checks both against apps/mobile/src/components/brand/mettleUpMark.ts: the wordmark
strings and box are read from the file, and MARK_FACES / MARK_BOX / METTLEUP_COLOURS are read by
running that file in node (Node 22.6+ runs .ts directly). Any difference stops the script.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
TS = os.path.join(ROOT, 'apps', 'mobile', 'src', 'components', 'brand', 'mettleUpMark.ts')
OUT = os.path.join(ROOT, 'apps', 'dashboard', 'public', 'brand', 'lockup-steel.svg')

sys.path.insert(0, HERE)
import steel_wordmark  # noqa: E402

# --- the mark, as mettleUpMark.ts ------------------------------------------------------------------
COLOURS = {'molten': '#FF8A4C', 'forge': '#F0662A', 'slag': '#C9481A'}
C = (256, 256)
TOP = (256, 52)
UR = (432.67, 154)
LR = (432.67, 358)
BOT = (256, 460)
LL = (79.33, 358)
UL = (79.33, 154)
M_CUT = [(205, 346), (205, 245.8), (256, 306.71), (307, 245.8), (307, 346), (349, 346), (349, 188),
         (300.61, 188), (256, 241.29), (211.39, 188), (163, 188), (163, 346)]
FACES = [([C, UL, TOP], 'molten'), ([C, TOP, UR], 'molten'), ([C, UR, LR], 'forge'),
         ([C, LL, UL], 'forge'), ([C, LR, BOT], 'slag'), ([C, BOT, LL], 'slag')]
MARK_BOX = {'x': 52, 'y': 52, 'size': 408}

# --- the lockup, as MettleUpLogo.tsx ---------------------------------------------------------------
CAP = 0.44   # the name's cap height / the mark
GAP = 0.32   # the gap / the mark
INK_ON_DARK = '#FFFFFF'   # "METTLE" on the dark pages
SHOW_PX = 26  # the default <img> height (the app's header logo: MettleUpLogo height={26})


def signed_area2(poly):
    s = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        s += x1 * y2 - x2 * y1
    return s


def sign(v):
    return (v > 0) - (v < 0)


def clip_to_convex(subject, clip):
    d = sign(signed_area2(clip))

    def inside(p, a, b):
        return d * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0

    def cross(p, q, a, b):
        x1, y1 = p
        x2, y2 = q
        x3, y3 = a
        x4, y4 = b
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))

    out = list(subject)
    for i in range(len(clip)):
        if not out:
            break
        a, b = clip[i], clip[(i + 1) % len(clip)]
        inp, out = out, []
        for j in range(len(inp)):
            p, q = inp[j], inp[(j + 1) % len(inp)]
            p_in, q_in = inside(p, a, b), inside(q, a, b)
            if p_in:
                out.append(p)
            if p_in != q_in:
                out.append(cross(p, q, a, b))
    return out


def js_num(v):
    """Math.round(v * 100) / 100, printed as JavaScript prints a number."""
    r = math.floor(v * 100 + 0.5) / 100
    if r == int(r):
        return str(int(r))
    return repr(r)


def ring(poly):
    return 'M' + ' L'.join(f'{js_num(x)} {js_num(y)}' for x, y in poly) + 'Z'


def face_path(tri):
    hole = clip_to_convex(M_CUT, tri)
    if len(hole) < 3 or abs(signed_area2(hole)) < 1e-6:
        return ring(tri)
    opposite = hole if sign(signed_area2(hole)) != sign(signed_area2(tri)) else hole[::-1]
    return ring(tri) + ring(opposite)


def mark_faces():
    return [{'d': face_path(tri), 'fill': COLOURS[c]} for tri, c in FACES]


# --- the check against the app ---------------------------------------------------------------------
def find_node():
    node = shutil.which('node')
    if node:
        return node
    local = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'nodejs', 'node.exe')
    return local if os.path.isfile(local) else None


def check_against_app(faces, mettle, up, width):
    src = open(TS, encoding='utf-8').read()

    def const(name):
        m = re.search(r'export const ' + name + r"\s*=\s*'([^']*)'", src)
        if not m:
            sys.exit(f'web_steel_lockup: {name} not found in {TS}')
        return m.group(1)

    if const('WORDMARK_METTLE_D') != mettle or const('WORDMARK_UP_D') != up:
        sys.exit('web_steel_lockup: the wordmark in mettleUpMark.ts differs from steel_wordmark.py. '
                 'Run `python steel_wordmark.py --ts` and update the app first.')
    box = re.search(r'WORDMARK_BOX = \{ x: 0, y: 0, w: ([\d.]+), h: (\d+) \}', src)
    if not box or float(box.group(1)) != width or int(box.group(2)) != steel_wordmark.H:
        sys.exit('web_steel_lockup: WORDMARK_BOX in mettleUpMark.ts differs from steel_wordmark.py.')

    node = find_node()
    if not node:
        sys.exit('web_steel_lockup: node not found; it is needed to check the mark against mettleUpMark.ts '
                 '(put Node 22.6+ on PATH, or in %LOCALAPPDATA%\\nodejs).')
    url = 'file:///' + TS.replace('\\', '/').lstrip('/')
    js = (f"const m = await import({json.dumps(url)});"
          "process.stdout.write(JSON.stringify({faces: m.MARK_FACES, box: m.MARK_BOX, colours: m.METTLEUP_COLOURS}));")
    res = subprocess.run([node, '--no-warnings', '--input-type=module', '-e', js], capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit('web_steel_lockup: node could not read mettleUpMark.ts:\n' + res.stderr)
    app = json.loads(res.stdout)
    if app['faces'] != faces:
        sys.exit('web_steel_lockup: MARK_FACES in mettleUpMark.ts differ from the mark built here. '
                 'Copy the change into this script first.')
    if app['box'] != MARK_BOX:
        sys.exit('web_steel_lockup: MARK_BOX in mettleUpMark.ts differs.')
    if app['colours'] != COLOURS:
        sys.exit('web_steel_lockup: METTLEUP_COLOURS in mettleUpMark.ts differ.')


# --- the SVG ---------------------------------------------------------------------------------------
def n(v):
    v = round(v, 4)
    return str(int(v)) if v == int(v) else f'{v:g}'


def lockup_svg(faces, mettle, up, width, ink):
    s = MARK_BOX['size']                      # one mark = the whole height
    cap = s * CAP
    k = cap / steel_wordmark.H
    word_x = s + s * GAP
    word_y = (s - cap) / 2                    # centred on the mark (alignItems: 'center')
    total_w = word_x + width * k
    show_w = SHOW_PX * total_w / s
    mark = ''.join(f'<path d="{f["d"]}" fill="{f["fill"]}"/>' for f in faces)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n(total_w)} {s}" '
        f'width="{n(round(show_w, 2))}" height="{SHOW_PX}">'
        '<!-- MettleUp lockup (R-259 "steel plate"), the app\'s MettleUpLogo. Generated by '
        'branding/mettleup/_src/web_steel_lockup.py; never edit by hand. -->'
        '<title>MettleUp</title>'
        f'<g transform="translate({-MARK_BOX["x"]} {-MARK_BOX["y"]})">{mark}</g>'
        f'<g transform="translate({n(word_x)} {n(word_y)}) scale({n(k)})">'
        f'<path d="{mettle}" fill="{ink}"/><path d="{up}" fill="{COLOURS["forge"]}"/></g>'
        '</svg>\n'
    )


def main():
    faces = mark_faces()
    mettle, up, width = steel_wordmark.paths()
    check_against_app(faces, mettle, up, width)
    svg = lockup_svg(faces, mettle, up, width, INK_ON_DARK)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg)
    print(f'wrote {os.path.relpath(OUT, ROOT)} (checked against mettleUpMark.ts)')


if __name__ == '__main__':
    main()
