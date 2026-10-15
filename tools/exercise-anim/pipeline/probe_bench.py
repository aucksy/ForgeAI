import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, rig as R, animate as A
spec = json.load(open(sys.argv[sys.argv.index("--") + 1]))
ch = character.build_character(); ctl = R.setup(ch["rig"])
clip = A.Clip(spec, ch, ctl); clip.build_props()
clip.foot_rest = {s: ctl[f"foot.{s}"].rotation_quaternion.copy() for s in R.SIDES}
clip.apply(clip.full_pose("bottom"))
rig = ch["rig"]; b = clip.bench
a = b["incline"]; hinge = b["hinge"]
d = Vector((0, math.cos(a), math.sin(a))); n = Vector((0, -math.sin(a), math.cos(a)))
surf = hinge + n * (b["pad_t"] / 2)
T = A.torso_frame(rig)
z = T.to_3x3() @ Vector((0, 0, 1))
print("TORSO_ANGLE_FROM_HORIZ", round(math.degrees(math.asin(z.z)), 1), "PAD", round(math.degrees(a), 1))
for bn in ["root", "spine05", "spine04", "spine03", "spine02", "spine01", "neck01", "head"]:
    p = R.world_head(rig, bn)
    print("DIST", bn, round((p - surf).dot(n), 3), "along", round((p - surf).dot(d), 3), "z", round(p.z, 3))
# body back surface: min signed distance of body verts to the pad plane, near the torso
dg = bpy.context.evaluated_depsgraph_get(); ev = ch["body"].evaluated_get(dg); me = ev.to_mesh()
ds = [((ev.matrix_world @ v.co) - surf).dot(n) for v in me.vertices]
along = [((ev.matrix_world @ v.co) - surf).dot(d) for v in me.vertices]
for lo, hi in [(-0.1, 0.1), (0.1, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.9)]:
    sel = [ds[i] for i in range(len(ds)) if lo <= along[i] < hi and abs((ev.matrix_world @ me.vertices[i].co).x) < 0.15]
    if sel: print("BACK_GAP along", lo, hi, "min dist", round(min(sel), 3))
seat_top = b["seat_h"]
zs = [(ev.matrix_world @ v.co).z for v in me.vertices if -0.35 < (ev.matrix_world @ v.co).y < 0.0 and abs((ev.matrix_world @ v.co).x) < 0.15]
print("SEAT: lowest body z over seat", round(min(zs), 3), "seat top", seat_top)
