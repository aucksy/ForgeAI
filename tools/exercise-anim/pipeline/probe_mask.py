import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, numpy as np
from forgeanim import character, muscles as M
ch = character.build_character(); body = ch["body"]; rig = ch["rig"]
pos, nrm = character.rest_positions(body, with_normals=True)
P = np.array([tuple(p) for p in pos]); N = np.array([tuple(n) for n in nrm])
G = M.group_sums(body, rig); LM = M.landmarks(rig)
print("LM clav_z", LM["chest_top"][2], "nip_z", LM["nipple"][2], "nipple", LM["nipple"])
raw = M.compute(P, N, G, LM)
for zlo, zhi in ((1.42, 1.47), (1.36, 1.42), (1.30, 1.36), (1.24, 1.30)):
    sel = (np.abs(P[:, 0] - 0.08) < 0.03) & (P[:, 1] < -0.05) & (P[:, 2] > zlo) & (P[:, 2] < zhi)
    if sel.sum():
        print(f"z {zlo}-{zhi} n={sel.sum()} chest_raw={raw['chest'][sel].mean():.2f} -ny={(-N[sel,1]).mean():.2f} torw={G['torso'][sel].mean():.2f} shw={G['shoulder'][sel].mean():.2f} armw={G['arm'][sel].mean():.2f}")
a = body.data.attributes["m_chest"]; v = np.zeros(len(P), np.float32); a.data.foreach_get("value", v)
sel = (np.abs(P[:, 0] - 0.08) < 0.03) & (P[:, 1] < -0.05) & (P[:, 2] > 1.42) & (P[:, 2] < 1.47)
print("stored (smoothed) chest at top band", v[sel].mean())
