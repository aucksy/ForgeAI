"""Per-frame twist (spin about the bone's own length) of every left-arm bone, vs the rest pose. Finds 'candy-wrapper' shoulders.
blender -b --addons bl_ext.user_default.mpfb --python measure_twist.py -- <spec> [step]"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, rig as R, animate as A
args = sys.argv[sys.argv.index("--") + 1:]
spec = json.load(open(args[0], encoding="utf-8")); step = int(args[1]) if len(args) > 1 else 6
ch = character.build_character(); rig = ch["rig"]; ctl = R.setup(rig)
clip = A.Clip(spec, ch, ctl); clip.build_props(); n = clip.bake()
BONES = ["clavicle.L", "shoulder01.L", "upperarm01.L", "upperarm02.L", "lowerarm01.L", "lowerarm02.L", "wrist.L"]
def twist(pb):
    # swing-twist split of the bone's pose rotation relative to its parent (local): twist about local Y
    q = pb.matrix_basis.to_quaternion() if not pb.constraints else (pb.bone.matrix_local.inverted() @ (pb.parent.matrix.inverted() @ pb.matrix if pb.parent else pb.matrix)).to_quaternion()
    q = (pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local).inverted().to_quaternion() @ q if False else q
    tw = math.degrees(2 * math.atan2(q.y, q.w))
    return round((tw + 180) % 360 - 180, 1)
def local_rot(pb):
    if pb.parent:
        rest = pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local
        cur = pb.parent.matrix.inverted() @ pb.matrix
    else:
        rest = pb.bone.matrix_local; cur = pb.matrix
    q = (rest.inverted() @ cur).to_quaternion()
    tw = math.degrees(2 * math.atan2(q.y, q.w)); tw = (tw + 180) % 360 - 180
    return round(tw, 1), round(math.degrees(q.angle), 1)
def hinge_axis(pb):
    rest = pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local
    q = (rest.inverted() @ (pb.parent.matrix.inverted() @ pb.matrix)).to_quaternion()
    return q.axis.normalized() if q.angle > 1e-3 else None
first = None; worst = 0.0
for f in range(0, n, step):
    bpy.context.scene.frame_set(f); R.update()
    ax = hinge_axis(rig.pose.bones["lowerarm01.L"])
    off = None
    if ax is not None:
        first = first or ax
        off = round(math.degrees(min(ax.angle(first), ax.angle(-first))), 1); worst = max(worst, off)
    print("TW", f, {**{b.split(".")[0]: local_rot(rig.pose.bones[b]) for b in BONES}, "elbow_axis_drift": off})
print("ELBOW_AXIS_DRIFT_MAX", round(worst, 1), "deg (a hinge should stay under ~10)")
