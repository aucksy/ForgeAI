"""Rest ankle height and the lowest body point for a standing spec's first pose (feet must touch z=0)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from forgeanim import character, rig as R, animate as A
spec = json.load(open(sys.argv[sys.argv.index("--") + 1]))
ch = character.build_character(); rig = ch["rig"]
print("REST_ANKLE", [round(x, 3) for x in rig.data.bones["foot.L"].head_local])
ctl = R.setup(rig); clip = A.Clip(spec, ch, ctl); clip.build_props()
clip.foot_rest = {s: ctl[f"foot.{s}"].rotation_quaternion.copy() for s in R.SIDES}
clip.apply(clip.full_pose(spec["timing"]["keys"][0][1]))
dg = bpy.context.evaluated_depsgraph_get(); ev = ch["body"].evaluated_get(dg); me = ev.to_mesh()
print("LOWEST_BODY_Z", round(min((ev.matrix_world @ v.co).z for v in me.vertices), 4))
