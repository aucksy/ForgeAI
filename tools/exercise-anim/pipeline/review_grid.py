"""Contact grid of a closeups.py pack: one row per view, one column per frame (labelled).
python review_grid.py <pack_dir> <out.png> [views=camL,camR] [--vs=<other_pack_dir>]   (--vs: pairs v7|v8 per cell)"""
import sys, os, glob, re
from PIL import Image, ImageDraw
d = sys.argv[1]; outp = sys.argv[2]
views = next((x.split("=", 1)[1] for x in sys.argv[3:] if x.startswith("views=")), "camL,camR,pitL,pitR,hands,clip").split(",")
vs = next((x.split("=", 1)[1] for x in sys.argv[3:] if x.startswith("--vs=")), None)
size = int(next((x.split("=", 1)[1] for x in sys.argv[3:] if x.startswith("size=")), 260))
frames = sorted({int(re.search(r"_(\d+)\.png$", p).group(1)) for p in glob.glob(os.path.join(d, "*_*.png"))})
packs = [d] + ([vs] if vs else [])
cw = size * len(packs) + 6
G = Image.new("RGB", (cw * len(frames), (size + 18) * len(views)), "white"); dr = ImageDraw.Draw(G)
for r, v in enumerate(views):
    for c, f in enumerate(frames):
        for k, pk in enumerate(packs):
            p = os.path.join(pk, f"{v}_{f:03d}.png")
            if os.path.exists(p):
                G.paste(Image.open(p).convert("RGB").resize((size, size)), (c * cw + k * size, r * (size + 18) + 18))
        lab = f"{v} f{f}" + ("  left=" + os.path.basename(d) + " right=" + os.path.basename(vs) if vs else "")
        dr.text((c * cw + 4, r * (size + 18) + 3), lab, fill="black")
G.save(outp); print(outp, G.size)
