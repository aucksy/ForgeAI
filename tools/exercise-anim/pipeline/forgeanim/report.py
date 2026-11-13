"""Numbers for the stills log and the "ground" option (13 Nov 2026).

lows(): the lowest skin point of each body part (hands, forearms, feet, shins, upper arms, thighs, pelvis, trunk/head),
per side, in the CURRENT pose. Parts come from each vertex's strongest bone. The mesh is read with only the armature
on (no subdivision, no under-shorts mask), so vertex numbers match the base mesh; the smoothed render surface sits at
most a few mm higher on convex spots, never lower.
joints(): shoulder, elbow, wrist, fist centre and nipple of each side in the torso frame and the world, so a recipe's
arm maths can be checked against where the joints really landed.
"""
import numpy as np
import bpy
from mathutils import Vector

PARTS = ("trunk_head", "hands", "forearms", "feet", "shins", "upperarms", "thighs", "pelvis")


def _code(base):
    if base.startswith(("wrist", "finger", "metacarpal")):
        return 1
    if base.startswith("lowerarm"):
        return 2
    if base.startswith(("foot", "toe")):
        return 3
    if base.startswith("lowerleg"):
        return 4
    if base.startswith("upperarm"):
        return 5
    if base.startswith("upperleg"):
        return 6
    if base.startswith(("pelvis", "root")):
        return 7
    return 0


_CACHE = {}


def _labels(body, rig):
    key = body.name
    if key not in _CACHE:
        bones = {b.name for b in rig.data.bones}
        gi = {g.index: g.name for g in body.vertex_groups if g.name in bones}
        n = len(body.data.vertices)
        code = np.zeros(n, np.int8); side = np.zeros(n, np.int8)   # side 1 = L, -1 = R, 0 = middle
        for v in body.data.vertices:
            best, bw = None, 0.0
            for g in v.groups:
                nm = gi.get(g.group)
                if nm and g.weight > bw:
                    best, bw = nm, g.weight
            if best:
                code[v.index] = _code(best.split(".")[0])
                side[v.index] = 1 if best.endswith(".L") else (-1 if best.endswith(".R") else 0)
        _CACHE[key] = (code, side)
    return _CACHE[key]


def posed_positions(body):
    """World positions of the base-mesh vertices in the current pose (armature only)."""
    states = [(m, m.show_viewport) for m in body.modifiers]
    for m, _ in states:
        m.show_viewport = (m.type == "ARMATURE")
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); me = ev.to_mesh()
    co = np.zeros(len(me.vertices) * 3, np.float64); me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    for m, s in states:
        m.show_viewport = s
    bpy.context.view_layer.update()
    co = co.reshape(-1, 3)
    M = np.array(body.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


def lows(body, rig):
    """{"hands.L": (z, [x, y, z]), ...} lowest point per part and side; "all" = whole body."""
    code, side = _labels(body, rig)
    P = posed_positions(body)
    out = {}
    i = int(np.argmin(P[:, 2])); out["all"] = (float(P[i, 2]), [round(float(c), 3) for c in P[i]])
    for c, name in enumerate(PARTS):
        for s, tag in ((1, "L"), (-1, "R"), (0, "")):
            sel = np.where((code == c) & (side == s))[0]
            if len(sel) == 0:
                continue
            j = sel[int(np.argmin(P[sel, 2]))]
            out[name + ("." + tag if tag else "")] = (float(P[j, 2]), [round(float(x), 3) for x in P[j]])
    return out


def low_of(lw, parts):
    """Lowest z among the named parts ("hands" = both sides, "hands.L" = one side)."""
    zs = [v[0] for k, v in lw.items() if k in parts or (k != "all" and k.split(".")[0] in parts)]
    return min(zs) if zs else None


def pad_gaps(body, rig, bench, P=None):
    """Bench back pad: signed gap (m) of the trunk/pelvis/head skin to the pad surface, per 0.2 m band along the pad
    (negative = through the pad). Works for any bench angle, place and turn."""
    import math
    code, _ = _labels(body, rig)
    P = posed_positions(body) if P is None else P
    a = bench["incline"]
    M = bench["root"].matrix_world
    d = (M.to_3x3() @ Vector((0, math.cos(a), math.sin(a)))).normalized()
    n = (M.to_3x3() @ Vector((0, -math.sin(a), math.cos(a)))).normalized()
    x = (M.to_3x3() @ Vector((1, 0, 0))).normalized()
    surf = M @ (bench["hinge"] + Vector((0, -math.sin(a), math.cos(a))) * (bench["pad_t"] / 2))
    S = np.array(tuple(surf))
    rel = P - S
    dist = rel @ np.array(tuple(n)); along = rel @ np.array(tuple(d)); lat = rel @ np.array(tuple(x))
    sel = np.isin(code, (0, 7)) & (np.abs(lat) < 0.15)
    out = {}
    for lo in (-0.1, 0.1, 0.3, 0.5, 0.7, 0.9):
        m = sel & (along >= lo) & (along < lo + 0.2)
        if m.any():
            out[f"{lo:+.1f}..{lo + 0.2:+.1f}"] = round(float(dist[m].min()), 3)
    return out


def joints(rig, T, fists):
    mw = rig.matrix_world; pb = rig.pose.bones
    Ti = T.inverted()
    out = {}
    for s in ("L", "R"):
        pts = {"shoulder": mw @ pb[f"upperarm01.{s}"].head, "elbow": mw @ pb[f"lowerarm01.{s}"].head,
               "wrist": mw @ pb[f"wrist.{s}"].head, "nipple": mw @ pb[f"breast.{s}"].tail if f"breast.{s}" in pb else None,
               "fist": fists.get(s)}
        for k, p in pts.items():
            if p is None:
                continue
            out[f"{k}.{s}"] = {"torso": [round(c, 3) for c in (Ti @ Vector(p))], "world": [round(c, 3) for c in p]}
    return out


def preacher_gaps(body, rig, pre, P=None):
    """Preacher pad: signed gap (m) of each part's skin to the pad face, over the pad only (negative = through the
    pad). The upper arms should read ~0 (lying on it); the trunk must stay >= 0."""
    code, side = _labels(body, rig)
    P = posed_positions(body) if P is None else P
    M = pre["root"].matrix_world
    top = np.array(tuple(M @ pre["top"])); n = np.array(tuple((M.to_3x3() @ pre["normal"]).normalized()))
    d = np.array(tuple((M.to_3x3() @ pre["down"]).normalized())); x = np.cross(d, n)
    rel = P - top
    dist = rel @ n; along = rel @ d; lat = rel @ x
    over = (along > -0.02) & (along < pre["pad_len"]) & (np.abs(lat) < pre["pad_w"] / 2)
    out = {}
    for c, name in ((5, "upperarms"), (2, "forearms"), (0, "trunk_head")):
        for sd, tag in ((1, ".L"), (-1, ".R"), (0, "")):
            m = over & (code == c) & (side == sd)
            if m.any():
                out[name + tag] = round(float(dist[m].min()), 3)
    return out
