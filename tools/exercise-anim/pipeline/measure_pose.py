"""Measure the joint angles a clip actually shows, frame by frame (left arm), so motion can be checked against research.

blender -b --addons bl_ext.user_default.mpfb --python measure_pose.py -- <spec.json> [step]
Writes out/<key>/_angles.csv and prints the key frames.

Angles (degrees), torso frame = X left, Y forward (out of the chest), Z up the spine:
  elev        upper arm angle from the torso side line (0 = arm down the side, 90 = level with the shoulder /
              in a press: elbow flare, 90 = elbows straight out from the body)
  plane       direction the arm is raised toward: 0 = straight out to the side (frontal plane),
              +30 = scapular plane, +90 = straight forward; negative = behind the torso line
  elbow       elbow bend (0 = straight arm)
  fore_vert   forearm vs world vertical (0 = forearm vertical, as cued in a press)
  hand_minus_elbow_z   hand height above the elbow, metres (lateral raise: should be <= 0 at the top)
  trunk       torso lean from vertical (world)
  shrug       shoulder joint height above its rest height relative to the neck, metres
  db_gap      distance between the two handle centres, metres
"""
import sys, os, json, math, csv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, rig as R, animate as A, OUT

args = sys.argv[sys.argv.index("--") + 1:]
spec = json.load(open(args[0], encoding="utf-8"))
step = int(args[1]) if len(args) > 1 else 3
ch = character.build_character(); rig = ch["rig"]
rest_shrug = (rig.data.bones["upperarm01.L"].head_local - rig.data.bones["neck01"].head_local).z
ctl = R.setup(rig); clip = A.Clip(spec, ch, ctl); clip.build_props(); n = clip.bake()


def deg(a, b):
    return math.degrees(a.angle(b)) if a.length and b.length else 0.0


rows = []
for f in range(0, n, step):
    bpy.context.scene.frame_set(f); R.update()
    T = A.torso_frame(rig); Ti = T.to_3x3().inverted()
    sh = R.world_head(rig, "upperarm01.L"); el = R.world_head(rig, "lowerarm01.L"); wr = R.world_head(rig, "wrist.L")
    u = (Ti @ (el - sh)).normalized(); fo = el - wr
    up_arm = el - sh
    elev = math.degrees(math.acos(max(-1, min(1, -u.z))))
    plane = math.degrees(math.atan2(u.y, u.x))
    elbow = 180 - deg(sh - el, wr - el)
    fore_vert = deg(wr - el, Vector((0, 0, 1)))
    torso_z = T.to_3x3() @ Vector((0, 0, 1))
    trunk = deg(torso_z, Vector((0, 0, 1)))
    shrug = (sh - R.world_head(rig, "neck01")).z - rest_shrug if trunk < 20 else float("nan")
    dbs = [p for p in clip.props.values()]
    gap = (dbs[0].matrix_world.translation - dbs[1].matrix_world.translation).length if len(dbs) == 2 else float("nan")
    rows.append(dict(frame=f, t=round(f / clip.timeline()[0], 2), elev=round(elev, 1), plane=round(plane, 1),
                     elbow=round(elbow, 1), fore_vert=round(fore_vert, 1),
                     hand_minus_elbow_z=round((wr - el).z, 3), trunk=round(trunk, 1),
                     shrug=round(shrug, 3) if shrug == shrug else "", db_gap=round(gap, 3)))
out = os.path.join(OUT, spec["key"]); os.makedirs(out, exist_ok=True)
with open(os.path.join(out, "_angles.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
for r in rows:
    print("ANG", json.dumps(r))
