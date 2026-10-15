"""Build one exercise clip from its spec.

blender -b --addons bl_ext.user_default.mpfb --python make_clip.py -- <spec.json> [preview|full] [--side]
  preview : the key poses only, small and fast, from the clip camera (+ a side view with --side)
  full    : every frame at clip quality into out/<key>/frames (resumable: existing frames are skipped)
Then run encode.py (plain Python) to make the WebP / MP4 / poster.
"""
import sys, os, json, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, look, rig as R, animate as A, render as RD, OUT

args = sys.argv[sys.argv.index("--") + 1:]
spec_path = args[0]
mode = args[1] if len(args) > 1 else "preview"
side = "--side" in args
spec = json.load(open(spec_path, encoding="utf-8"))
key = spec["key"]
out = os.path.join(OUT, key); os.makedirs(out, exist_ok=True)

t0 = time.time()
ch = character.build_character()
ctl = R.setup(ch["rig"])
clip = A.Clip(spec, ch, ctl)
clip.build_props()
clip.highlight()
n = clip.bake()
print(f"[clip] baked {n} frames in {time.time() - t0:.1f}s")

scene = bpy.context.scene
cam_spec = spec.get("camera", {})
res = cam_spec.get("res", 640)
look.setup_world_and_render(scene, res=res if mode == "full" else 400, samples=cam_spec.get("samples", 40) if mode == "full" else 14)
cam = bpy.data.objects.new("FA_Cam", bpy.data.cameras.new("FA_Cam")); scene.collection.objects.link(cam); scene.camera = cam
objs = [ch["body"], ch["shorts"]] + [c for p in clip.props.values() for c in p.children]
if hasattr(clip, "bench"):
    objs += list(clip.bench["root"].children)
fps, keys, _ = clip.timeline()
key_frames = sorted({min(n - 1, int(round(k[0] * fps))) for k in keys})
center, d = RD.frame_camera(scene, cam, objs, cam_spec.get("yaw", -30), cam_spec.get("pitch", 12),
                            cam_spec.get("lens", 50), cam_spec.get("fill", 0.86), sample_frames=key_frames,
                            target_offset=cam_spec.get("offset", (0, 0, 0)))
look.setup_lights(scene, center, cam_spec.get("yaw", -30) + cam_spec.get("light_yaw", 0))

if mode == "preview":
    paths = []
    views = [("cam", None)] + ([("side", 90)] if side else [])
    for tag, yaw in views:
        if yaw is not None:
            RD.frame_camera(scene, cam, objs, yaw, 5, 50, 0.9, sample_frames=key_frames)
        for f in key_frames:
            scene.frame_set(f)
            p = os.path.join(out, f"_prev_{tag}_{f:03d}.png"); scene.render.filepath = p
            bpy.ops.render.render(write_still=True); paths.append(p)
    print("PREVIEW", ";".join(paths))
else:
    RD.render_frames(scene, os.path.join(out, "frames"), n)
    poster = min(n - 1, int(round(keys[2][0] * fps))) if len(keys) >= 3 else 0  # end of the lift = top of the rep
    json.dump({"key": key, "frames": n, "fps": fps, "res": res, "poster": poster}, open(os.path.join(out, "frames", "meta.json"), "w"))
    print(f"[clip] rendered {n} frames in {time.time() - t0:.1f}s")
