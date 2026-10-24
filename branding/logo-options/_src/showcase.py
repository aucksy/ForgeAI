"""Writes branding/logo-options/index.html from the concepts in build.py."""
import math
import os

import build as B

n = B.n


def squircle(cx=54, cy=54, r=36, e=4.0, steps=72):
    pts = []
    for k in range(steps):
        t = 2 * math.pi * k / steps
        c, s = math.cos(t), math.sin(t)
        x = cx + r * math.copysign(abs(c) ** (2 / e), c)
        y = cy + r * math.copysign(abs(s) ** (2 / e), s)
        pts.append((x, y))
    return B.poly(pts)


def sprite(concepts):
    out = ['<svg class="sprite" aria-hidden="true" width="0" height="0"><defs>',
           '<clipPath id="k-circle" clipPathUnits="userSpaceOnUse"><circle cx="54" cy="54" r="36"/></clipPath>',
           f'<clipPath id="k-squircle" clipPathUnits="userSpaceOnUse"><path d="{squircle()}"/></clipPath>',
           '<clipPath id="k-rsq" clipPathUnits="userSpaceOnUse"><rect x="18" y="18" width="72" height="72" rx="16"/></clipPath>']
    for c in concepts:
        L = c['fn']()
        t = B.centred(L)
        for scheme in ('light', 'dark'):
            out.append(f'<symbol id="mk-{c["key"]}-{scheme}" viewBox="0 0 512 512"><g transform="{t}">'
                       f'{B.mark_body(L, c[scheme], c["key"] + scheme + "s")}</g></symbol>')
        ft, fb = B.adaptive_fg(c)
        fb = fb.replace(f'm{c["key"]}icon', f'm{c["key"]}icons')
        out.append(f'<symbol id="fg-{c["key"]}" viewBox="0 0 108 108"><g transform="{ft}">{fb}</g></symbol>')
    out.append('</defs></svg>')
    return ''.join(out)


def icon(c, mask='circle', px=54, label=None):
    k = c['key']
    a = f' role="img" aria-label="{label}"' if label else ' aria-hidden="true"'
    return (f'<svg class="ic" width="{px}" height="{px}" viewBox="18 18 72 72"{a}>'
            f'<g clip-path="url(#k-{mask})"><rect width="108" height="108" fill="{c["icon"]["bg"]}"/>'
            f'<use href="#fg-{k}" width="108" height="108"/></g></svg>')


def mark(c, scheme, px=None, cls='mk'):
    size = f' width="{px}" height="{px}"' if px else ''
    return (f'<svg class="{cls}"{size} viewBox="0 0 512 512" aria-hidden="true">'
            f'<use href="#mk-{c["key"]}-{scheme}"/></svg>')


def lock(c, scheme):
    vb, body = B.lockup(c, scheme, uid='p')
    return f'<svg class="lk" viewBox="{vb}" role="img" aria-label="MettleUp">{body}</svg>'


def full_layer(c):
    return (f'<svg class="layer" viewBox="0 0 108 108" aria-hidden="true">'
            f'<rect width="108" height="108" fill="{c["icon"]["bg"]}"/><use href="#fg-{c["key"]}" width="108" height="108"/>'
            f'<rect x="18" y="18" width="72" height="72" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".5"/>'
            f'<circle cx="54" cy="54" r="33" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".5" stroke-dasharray="1.5 1.5"/></svg>')


# Stand-in neighbour icons: plain shapes, no real brands.
NEIGHBOURS = [
    ('Clock', '#2F3A4A', '<circle cx="54" cy="54" r="15" fill="none" stroke="#fff" stroke-width="3"/><path d="M54 45v10l7 4" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'),
    ('Photos', '#F4F1EA', '<circle cx="47" cy="49" r="8" fill="#F2A33A"/><circle cx="61" cy="49" r="8" fill="#4C8DF0" fill-opacity=".9"/><circle cx="54" cy="61" r="8" fill="#3DBB7A" fill-opacity=".9"/>'),
    ('Messages', '#3B7BF2', '<path d="M40 44h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H52l-8 6v-6h-4a4 4 0 0 1-4-4V48a4 4 0 0 1 4-4z" fill="#fff"/>'),
    ('Maps', '#E9F1E6', '<path d="M40 42l9 4 10-4 9 4v22l-9-4-10 4-9-4z" fill="#58A06B"/><circle cx="58" cy="52" r="4" fill="#E5463B"/>'),
    ('Camera', '#26292F', '<rect x="38" y="44" width="32" height="22" rx="5" fill="#E6E7EA"/><circle cx="54" cy="55" r="7" fill="#26292F"/>'),
    ('Music', '#F05A4A', '<path d="M50 64V44l14-3v19" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/><circle cx="47" cy="64" r="4.5" fill="#fff"/><circle cx="61" cy="61" r="4.5" fill="#fff"/>'),
    ('Calendar', '#FFFFFF', '<rect x="40" y="42" width="28" height="26" rx="4" fill="none" stroke="#3B7BF2" stroke-width="3"/><path d="M40 50h28" stroke="#3B7BF2" stroke-width="3"/><text x="54" y="64" font-size="11" text-anchor="middle" fill="#3B7BF2" font-family="Manrope,sans-serif" font-weight="800">24</text>'),
]


def neighbour(i, px=54):
    name, bg, glyph = NEIGHBOURS[i % len(NEIGHBOURS)]
    return (f'<svg class="ic" width="{px}" height="{px}" viewBox="18 18 72 72" aria-hidden="true">'
            f'<g clip-path="url(#k-circle)"><rect width="108" height="108" fill="{bg}"/>{glyph}</g></svg>', name)


def phone(c):
    cells = []
    order = [0, 1, 2, 3, 4, None, 5, 6]
    for i in order:
        if i is None:
            cells.append(f'<div class="app">{icon(c, "circle", 54, "MettleUp")}<span>MettleUp</span></div>')
        else:
            svg, name = neighbour(i)
            cells.append(f'<div class="app">{svg}<span>{name}</span></div>')
    return (f'<figure class="phone"><div class="screen" style="--wall:{c["icon"]["bg"]}">'
            f'<div class="status"><span>9:41</span><span class="dots"></span></div>'
            f'<div class="when"><b>Fri 24 Oct</b><span>Leg day, 6:30 pm</span></div>'
            f'<div class="grid">{"".join(cells)}</div></div>'
            f'<figcaption>Home screen, real size (54 px icons, circle mask)</figcaption></figure>')


def store(c):
    return (f'<figure class="store"><div class="listing">'
            f'<svg class="ic" width="72" height="72" viewBox="18 18 72 72" role="img" aria-label="MettleUp icon">'
            f'<g clip-path="url(#k-rsq)"><rect width="108" height="108" fill="{c["icon"]["bg"]}"/>'
            f'<use href="#fg-{c["key"]}" width="108" height="108"/></g></svg>'
            f'<div class="meta"><h4>MettleUp — Gym workout tracker</h4><p class="dev" style="color:{c["light"]["up"]}">MettleUp</p>'
            f'<p class="cat">Health &amp; Fitness</p></div></div>'
            f'<div class="install" style="background:{c["icon"]["bg"] if c["key"] not in "C" else c["dark"]["ink"]};'
            f'color:{"#15171B" if c["key"] == "C" else "#fff"}">Install</div>'
            f'<figcaption>Store listing header</figcaption></figure>')


def small_test(c):
    sizes = [48, 32, 24]
    row = lambda bg, scheme: (
        f'<div class="sz" style="background:{bg}">'
        + ''.join(f'<div>{icon(c, "circle", s)}<i>{s}</i></div>' for s in sizes)
        + f'<div>{mark(c, scheme, 48)}<i>mark 48</i></div>'
        + f'<div>{mark(c, scheme, 16)}<i>16</i></div></div>')
    return (f'<figure class="small">{row("#FFFFFF", "light")}{row("#0A0B0E", "dark")}'
            f'<figcaption>Small-size test: icon at 48, 32 and 24 px; bare mark at 48 and 16 px</figcaption></figure>')


def swatches(c):
    return '<ul class="sw">' + ''.join(
        f'<li><span style="background:{hx}"></span>{name} <code>{hx}</code></li>' for name, hx in c['swatches']) + \
        f'<li class="bgnote">Icon background <code>{c["icon"]["bg"]}</code></li></ul>'


def concept(c):
    k = c['key']
    return f'''
<section class="concept" id="c{k}" aria-labelledby="h{k}">
  <header class="ch">
    <h2 id="h{k}"><span class="letter">{k}</span>{c["name"]}</h2>
    <p class="idea">{c["idea"]}</p>
    {swatches(c)}
    <p class="font">Wordmark: {c["font_note"]}.</p>
  </header>
  <div class="hero">
    <div class="panel light">{mark(c, "light")}</div>
    <div class="panel dark">{mark(c, "dark")}</div>
  </div>
  <div class="locks">
    <div class="panel light wide">{lock(c, "light")}</div>
    <div class="panel dark wide">{lock(c, "dark")}</div>
  </div>
  <div class="adaptive">
    <figure>{full_layer(c)}<figcaption>108 dp layer, 66 dp safe circle dashed</figcaption></figure>
    <figure>{icon(c, "circle", 112)}<figcaption>Circle mask</figcaption></figure>
    <figure>{icon(c, "squircle", 112)}<figcaption>Squircle mask</figcaption></figure>
  </div>
  <div class="context">
    {phone(c)}
    <div class="stack">{store(c)}{small_test(c)}</div>
  </div>
</section>'''


CSS = r'''
:root{
  --bg:#F6F5F2; --surface:#FFFFFF; --ink:#121317; --muted:#5B606B; --line:rgba(18,19,23,.10);
  --accent:#E8641F; --panel-light:#FFFFFF; --panel-dark:#0A0B0E;
  color-scheme:light dark;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0B0C10; --surface:#14161C; --ink:#EEF0F3; --muted:#9AA0AC; --line:rgba(255,255,255,.09);
    --accent:#FF7A3B;
  }
}
:root[data-theme="dark"]{--bg:#0B0C10; --surface:#14161C; --ink:#EEF0F3; --muted:#9AA0AC; --line:rgba(255,255,255,.09); --accent:#FF7A3B;}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 15px/1.55 Manrope,system-ui,sans-serif;}
::selection{background:var(--accent);color:#fff}
.sprite{position:absolute;width:0;height:0;overflow:hidden}
main{max-width:1180px;margin:0 auto;padding:28px 16px 80px}
h1,h2,h3,h4{font-family:Sora,Manrope,sans-serif;letter-spacing:-.02em;margin:0}
h1{font-size:clamp(28px,6vw,52px);font-weight:700;line-height:1.05;text-wrap:balance}
.intro{max-width:62ch;color:var(--muted);margin:14px 0 0}
code{font:500 12.5px/1 "Space Grotesk",ui-monospace,monospace;font-variant-numeric:tabular-nums}

.overview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:32px 0 18px}
.overview a{display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:14px;border-radius:18px;background:var(--surface);
  border:1px solid var(--line);color:inherit;text-decoration:none;transition:transform .25s cubic-bezier(.16,1,.3,1)}
.overview a:hover{transform:translateY(-2px)}
.overview a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.overview b{display:block;font:600 15px/1.2 Sora,sans-serif}
.overview small{color:var(--muted);font-size:12.5px;line-height:1.35;display:block;margin-top:3px}
.ov-ic{flex:none}
@media (min-width:760px){.overview{grid-template-columns:repeat(3,1fr)}}
@media (min-width:1100px){.overview{grid-template-columns:repeat(6,1fr)}}

.strip{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:56px}
.strip .l,.strip .d{display:flex;justify-content:space-around;align-items:center;gap:8px;padding:18px 10px;border-radius:18px;border:1px solid var(--line)}
.strip .l{background:#FFFFFF}.strip .d{background:#0A0B0E}
.strip figcaption{font-size:12.5px;color:var(--muted)}
@media (min-width:760px){.strip{grid-template-columns:1fr 1fr}}

.concept{padding:44px 0 8px;border-top:1px solid var(--line)}
.ch{margin-bottom:20px}
.ch h2{font-size:clamp(24px,4.4vw,34px);font-weight:700;display:flex;align-items:baseline;gap:12px}
.letter{font:600 14px/1 "Space Grotesk",monospace;color:var(--muted);border:1px solid var(--line);border-radius:8px;padding:6px 8px;transform:translateY(-4px)}
.idea{font-size:clamp(16px,2.4vw,19px);max-width:52ch;margin:10px 0 14px;text-wrap:pretty}
.font{font-size:12.5px;color:var(--muted);margin:10px 0 0}
.sw{list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;padding:0;margin:0;font-size:13px;color:var(--muted)}
.sw li{display:flex;align-items:center;gap:7px}
.sw span{width:18px;height:18px;border-radius:6px;border:1px solid var(--line)}
.sw code{color:var(--ink)}

.panel{border-radius:22px;display:grid;place-items:center;border:1px solid var(--line)}
.panel.light{background:var(--panel-light)}.panel.dark{background:var(--panel-dark);border-color:rgba(255,255,255,.08)}
.hero,.locks{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.hero .panel{aspect-ratio:1}
.hero .mk{width:72%;height:72%}
.locks{grid-template-columns:1fr}
.locks .panel{padding:30px 22px;min-height:132px}
.lk{width:min(100%,420px);height:auto;max-height:96px}
@media (min-width:760px){.locks{grid-template-columns:1fr 1fr}.hero{grid-template-columns:1fr 1fr}.hero .panel{aspect-ratio:auto;height:340px}.hero .mk{width:260px;height:260px}}

.adaptive{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}
.adaptive figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 6px;background:var(--surface);border:1px solid var(--line);border-radius:18px}
.layer{width:112px;height:112px;border-radius:4px}
.adaptive .ic{width:min(112px,24vw);height:min(112px,24vw)}
.layer{width:min(112px,24vw);height:min(112px,24vw)}
figcaption{font-size:12px;color:var(--muted);text-align:center;line-height:1.35}

.context{display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:860px){.context{grid-template-columns:360px 1fr}}
.phone{margin:0}
.screen{width:100%;max-width:360px;margin:0 auto;border-radius:30px;padding:14px 18px 26px;color:#fff;
  background:radial-gradient(120% 90% at 20% 0%,color-mix(in oklab,var(--wall) 55%,#6C7A92) 0%,#1B2029 60%,#0E1116 100%);
  border:6px solid #050608;box-shadow:0 18px 40px -18px rgba(0,0,0,.45)}
.status{display:flex;justify-content:space-between;font:600 12px/1 Manrope,sans-serif;opacity:.9}
.dots{width:44px;height:8px;border-radius:4px;background:rgba(255,255,255,.5)}
.when{margin:26px 4px 34px;display:flex;flex-direction:column;gap:2px}
.when b{font:600 26px/1.1 Sora,sans-serif;letter-spacing:-.02em}
.when span{font-size:13px;opacity:.8}
.grid{display:grid;grid-template-columns:repeat(4,1fr);row-gap:20px}
.app{display:flex;flex-direction:column;align-items:center;gap:6px}
.app span{font-size:12px;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.phone figcaption{margin-top:10px}
.stack{display:grid;gap:12px;align-content:start}
.store{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:18px}
.listing{display:flex;gap:16px;align-items:center}
.listing .ic{flex:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.18))}
.meta h4{font:600 18px/1.25 Sora,sans-serif;letter-spacing:-.01em}
.dev{margin:4px 0 0;font-weight:700;font-size:13.5px}
.cat{margin:0;font-size:12.5px;color:var(--muted)}
.install{margin:16px 0 10px;border-radius:999px;text-align:center;font:700 14px/1 Manrope,sans-serif;padding:13px}
.small{margin:0;display:grid;gap:10px}
.sz{display:flex;align-items:flex-end;justify-content:space-around;gap:6px;padding:16px 8px 10px;border-radius:16px;border:1px solid var(--line)}
.sz>div{display:flex;flex-direction:column;align-items:center;gap:6px}
.sz i{font:500 11px/1 "Space Grotesk",monospace;font-style:normal;color:#8A909C}
.pick{margin:52px 0 0;padding:24px;border-radius:22px;background:var(--surface);border:1px solid var(--line)}
.pick h3{font-size:22px;margin-bottom:8px}
.pick p{margin:6px 0 0;max-width:68ch}
'''


def build(concepts):
    ov = ''.join(
        f'<a href="#c{c["key"]}">{icon(c, "squircle", 64).replace("class=\"ic\"", "class=\"ic ov-ic\"")}'
        f'<span><b>{c["key"]} · {c["name"]}</b><small>{c["idea"]}</small></span></a>' for c in concepts)
    strip_l = ''.join(icon(c, 'circle', 48, f'Concept {c["key"]}') for c in concepts)
    strip_d = strip_l
    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MettleUp logo options</title>
<meta name="description" content="Six logo directions for MettleUp, the new name for ForgeAI.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Sora:wght@600;700&family=Space+Grotesk:wght@500&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body>
{sprite(concepts)}
<main>
  <h1>MettleUp logo options</h1>
  <p class="intro">Six directions for the new name. Mettle is the grit to keep going; Up is progressive overload, a little more every week. Each one is shown big, as a wordmark, as an Android icon, on a home screen, on a store listing, and at 48 px, where most logos fail.</p>
  <nav class="overview" aria-label="Concepts">{ov}</nav>
  <div class="strip">
    <figure style="margin:0"><div class="l">{strip_l}</div><figcaption>All six at 48 px on white</figcaption></figure>
    <figure style="margin:0"><div class="d">{strip_d}</div><figcaption>All six at 48 px on black</figcaption></figure>
  </div>
  {''.join(concept(c) for c in concepts)}
  {PICK}
</main>
</body>
</html>
'''
    B.write(os.path.join(B.OUT, 'index.html'), html)


PICK = """
<section class="pick" aria-labelledby="pick">
  <h3 id="pick">Recommendation: F, Hidden Up</h3>
  <p>It is the only option that says both halves of the name in one shape: the M for Mettle, and an up arrow for Up. It stays a clean, solid M at 16 px, works as a stamp on a gym wall, a T-shirt or a plate sticker, and nothing in the category looks like it.</p>
  <p>Runner-up: A, Ascent, if you want to keep the ember orange the app already uses. D is the loudest, but a U with an arrow can read as a U-turn road sign.</p>
</section>"""
