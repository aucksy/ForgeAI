"""QA sheet: every muscle key highlighted alone (real shader), front-3/4 and back-3/4.
blender -b --addons bl_ext.user_default.mpfb --python muscle_sheet.py -- [key,key,...]
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, look, muscles, OUT

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
keys = args[0].split(",") if args else muscles.MUSCLES
close = len(args) > 1 and args[1] == "close"     # upper-body close-up for checking shoulder/chest shapes
ch = character.build_character()
scene = bpy.context.scene
look.setup_world_and_render(scene, res=420 if close else 300, samples=16 if close else 12)
cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 50
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam); scene.camera = cam
center = Vector((0, 0, 1.33)) if close else Vector((0, 0, 1.0))
d = os.path.join(OUT, "_sheet"); os.makedirs(d, exist_ok=True)
for k in keys:
    muscles.set_highlight(ch["body"], [k]); muscles.set_highlight(ch["shorts"], [k])
    for tag, yaw in (("f", -30), ("b", 150)):
        look.setup_lights(scene, center, yaw)
        a = math.radians(yaw)
        r = 1.25 if close else 3.0
        cam.location = center + Vector((math.sin(a) * r, -math.cos(a) * r, 0.15 if close else 0.4))
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(d, f"{k}_{tag}.png")
        bpy.ops.render.render(write_still=True)
print("SHEET done", len(keys))
