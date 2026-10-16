"""Wrist check: forearm line seen from the hand, as (back/forward, side) degrees, vs the rest pose.
Every sample must stay within ~10 deg of rest on both numbers. -- spec
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from forgeanim import character, rig as R, animate as A
a = sys.argv[sys.argv.index("--") + 1:]
spec = json.load(open(a[0])); ch = character.build_character(); ctl = R.setup(ch["rig"])
clip = A.Clip(spec, ch, ctl); clip.build_props(); n = clip.bake()
rig = ch["rig"]; fa = rig.pose.bones["lowerarm02.L"]; hb = rig.pose.bones["wrist.L"]
def ang(u, v): return math.degrees(u.angle(v))
rest = ang(fa.bone.y_axis, hb.bone.y_axis) if hasattr(fa.bone, "y_axis") else None
rest = ang((fa.bone.matrix_local.to_3x3().col[1]), (hb.bone.matrix_local.to_3x3().col[1]))
def comp():
    # forearm direction in wrist-bone space -> angles about the wrist's x and z axes
    f = (fa.matrix.to_3x3().col[1])
    d = hb.matrix.to_3x3().inverted() @ f
    return round(math.degrees(math.atan2(d.z, d.y)), 1), round(math.degrees(math.atan2(d.x, d.y)), 1)
bpy.context.scene.frame_set(0)
out = []
for f in range(0, n, 10):
    bpy.context.scene.frame_set(f)
    out.append(comp())
fr = fa.bone.matrix_local.to_3x3().col[1]; d = hb.bone.matrix_local.to_3x3().inverted() @ fr
print("WRISTBEND rest", round(math.degrees(math.atan2(d.z, d.y)),1), round(math.degrees(math.atan2(d.x, d.y)),1), "frames", out)
