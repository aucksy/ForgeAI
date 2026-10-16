"""Press checks in the torso's own frame: hand inside the elbow (front view), handle path drift along the torso
(side view, measured level with the floor) and depth (handle height above the chest skin at the bottom). -- spec"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, rig as R, animate as A, muscles as M
import numpy as np
a = sys.argv[sys.argv.index("--") + 1:]
spec = json.load(open(a[0])); ch = character.build_character(); ctl = R.setup(ch["rig"])
clip = A.Clip(spec, ch, ctl); clip.build_props(); n = clip.bake()
rig = ch["rig"]; body = ch["body"]; mw = rig.matrix_world; pb = rig.pose.bones
P = lambda b, tail=False: mw @ (pb[b].tail if tail else pb[b].head)
rows = []
for f in range(0, n, 6):
    bpy.context.scene.frame_set(f)
    up = (P("neck01") - P("spine04")).normalized()                         # along the torso, toward the head
    lat = (P("upperarm01.L") - P("upperarm01.R")).normalized()              # toward the left shoulder
    nrm = lat.cross(up).normalized()
    if nrm.dot(P("breast.L", True) - P("spine03")) < 0: nrm = -nrm        # out of the chest
    el, wr = P("lowerarm01.L"), P("wrist.L")
    g = clip.props["db_L"].matrix_world.translation
    o = P("spine03")
    d = wr - el
    inside = math.degrees(math.atan2(-(d.dot(lat)), d.dot(nrm)))        # + = hand nearer the midline than the elbow
    dg = depsgraph = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); me = ev.to_mesh()
    # chest skin height under the handle: highest skin point (along nrm) within 6 cm of the handle's torso position
    co = np.array([tuple(body.matrix_world @ v.co) for v in me.vertices])
    pec = np.zeros(len(me.vertices), np.float32); me.attributes["m_chest"].data.foreach_get("value", pec)
    TORSO = pec > 0.3   # chest skin only (the gripping hand is skin too); the evaluated mesh is subdivided
    ev.to_mesh_clear()
    G = np.array(tuple(g)); L = np.array(tuple(lat)); U = np.array(tuple(up)); N = np.array(tuple(nrm))
    rel = co - G
    near = TORSO   # the handle sits out beside the chest: compare with the chest's highest skin
    skin = (co[near] - np.array(tuple(o))) @ N
    depth = float(((G - np.array(tuple(o))) @ N) - skin.max()) if near.any() else None
    head_h = Vector((up.x, up.y, 0)).normalized()                           # toward the head, level with the floor
    rows.append({"frame": f, "inside_deg": round(inside, 1), "toward_head_m": round(g.dot(head_h), 3), "height_m": round(g.z, 3),
                 "shoulder_toward_head_m": round(P("upperarm01.L").dot(head_h), 3), "nipple_toward_head_m": round(P("breast.L", True).dot(head_h), 3),
                 "clav_toward_head_m": round(P("clavicle.L", True).dot(head_h), 3),
                 "along_torso": {k: round((v - o).dot(up), 3) for k, v in (("handle", g), ("elbow", el), ("nipple", P("breast.L", True)), ("shoulder", P("upperarm01.L")), ("clav", P("clavicle.L", True)))},
                 "depth_m": None if depth is None else round(depth, 3)})
for r in rows: print("PRESS", json.dumps(r))
al = [r["toward_head_m"] for r in rows]
print("PATH_DRIFT_TOWARD_HEAD_M", round(max(al) - min(al), 3), "(side view, against the floor)")
