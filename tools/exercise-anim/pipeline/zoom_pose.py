"""Render one frame of a spec close-up. -- spec frame yaw pitch dist target_z out"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, look, rig as R, animate as A, OUT
a = sys.argv[sys.argv.index("--") + 1:]
spec = json.load(open(a[0])); frame = int(a[1]); yaw = float(a[2]); pitch = float(a[3]); dist = float(a[4]); tz = float(a[5]); outp = a[6]
tx = float(a[7]) if len(a) > 7 else 0.0
ch = character.build_character(); ctl = R.setup(ch["rig"])
clip = A.Clip(spec, ch, ctl); clip.build_props(); clip.highlight(); clip.bake()
scene = bpy.context.scene; look.setup_world_and_render(scene, res=520, samples=24)
scene.frame_set(frame)
cam = bpy.data.objects.new("C", bpy.data.cameras.new("C")); scene.collection.objects.link(cam); scene.camera = cam; cam.data.lens = 60
c = Vector((tx, 0, tz)); y = math.radians(yaw); p = math.radians(pitch)
cam.location = c + dist * Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
look.setup_lights(scene, c, yaw)
scene.render.filepath = outp; bpy.ops.render.render(write_still=True)
