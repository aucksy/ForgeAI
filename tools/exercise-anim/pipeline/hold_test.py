"""Check: a hand gripping a dumbbell in front of the shoulder, 3 close-ups to out/_hold*.png."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix
from forgeanim import character, look, rig as R, props, OUT
ch = character.build_character(); rig = ch["rig"]
ctl = R.setup(rig); R.set_grip(rig, 1.0, 1.0)
G = {s: R.measure_grip(rig, s) for s in "LR"}
db = props.dumbbell("FA_DB_L")
# put the dumbbell in front of the left shoulder, handle across the body; hand reaches it
sh = R.world_head(rig, "upperarm01.L")
c = sh + Vector((0.08, -0.45, -0.15))
db.matrix_world = R.frame_from(c, (-1, 0, 0), (0, 0, 1))
R.place_hand(rig, "L", c, Vector((-1, 0, 0)), G["L"])
scene = bpy.context.scene
look.setup_world_and_render(scene, res=420, samples=16)
cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 70
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam); scene.camera = cam
for j, off in enumerate((Vector((0.3, -1.1, 0.3)), Vector((1.0, 0.1, 0.2)), Vector((-0.4, -0.6, 0.9)))):
    look.setup_lights(scene, c, -20)
    cam.location = c + off
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, f"_hold{j}.png"); bpy.ops.render.render(write_still=True)
print("ERR", (R.world_head(rig, "wrist.L") - bpy.data.objects["FA_Hand.L"].location).length)
