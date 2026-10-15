"""Time three full-quality frames of a spec: blender -b --addons bl_ext.user_default.mpfb --python bench_time.py -- <spec>"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from forgeanim import character, look, rig as R, animate as A, render as RD, OUT
spec = json.load(open(sys.argv[sys.argv.index("--") + 1]))
ch = character.build_character(); ctl = R.setup(ch["rig"])
clip = A.Clip(spec, ch, ctl); clip.build_props(); clip.highlight(); n = clip.bake()
scene = bpy.context.scene; cs = spec["camera"]
look.setup_world_and_render(scene, res=cs["res"], samples=cs["samples"])
cam = bpy.data.objects.new("C", bpy.data.cameras.new("C")); scene.collection.objects.link(cam); scene.camera = cam
objs = [ch["body"], ch["shorts"]] + [c for p in clip.props.values() for c in p.children] + (list(clip.bench["root"].children) if hasattr(clip, "bench") else [])
center, d = RD.frame_camera(scene, cam, objs, cs["yaw"], cs["pitch"], cs["lens"], cs["fill"], sample_frames=[0, 40])
look.setup_lights(scene, center, cs["yaw"])
for f in (0, 20, 40):
    t = time.time(); scene.frame_set(f); scene.render.filepath = os.path.join(OUT, f"_bt{f}.png"); bpy.ops.render.render(write_still=True)
    print("FRAME", f, round(time.time() - t, 1), "s")
