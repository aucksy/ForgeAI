"""Look-dev: build the athlete and render three views side by side.
blender -b --addons bl_ext.user_default.mpfb --python look_test.py -- out.png [hl.png]
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, look, OUT

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
dst = args[0] if args else os.path.join(OUT, "look_test.png")
hl_path = args[1] if len(args) > 1 else None

ch = character.build_character()
scene = bpy.context.scene
look.setup_world_and_render(scene, res=640, samples=40)
mat = look.skin_material()
hl = mat.node_tree.nodes["HL"]
if hl_path:
    hl.image = bpy.data.images.load(hl_path); hl.image.colorspace_settings.name = "Non-Color"
else:
    img = bpy.data.images.new("hl_none", 4, 4); img.pixels = [0.0] * 64; hl.image = img

cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 50
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam); scene.camera = cam
center = Vector((0, 0, 0.98))
frames = []
for i, yaw in enumerate([-32, 90, 180]):
    look.setup_lights(scene, center, yaw)
    r = 3.0
    a = math.radians(yaw)
    # camera on a circle; yaw 0 = straight in front (MPFB faces -Y)
    cam.location = center + Vector((math.sin(a) * r, -math.cos(a) * r, 0.55))
    cam.rotation_euler = (center + Vector((0, 0, -0.02)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    p = os.path.join(OUT, f"_view{i}.png"); scene.render.filepath = p
    bpy.ops.render.render(write_still=True); frames.append(p)

# stitch with Blender's image API-free approach: write paths for the caller
print("VIEWS", ";".join(frames))
