"""QA: paint every muscle mask in its own colour and render 4 views (front, back, both sides).
blender -b --addons bl_ext.user_default.mpfb --python muscle_atlas.py -- out.png
"""
import sys, os, math, colorsys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, numpy as np
from mathutils import Vector
from forgeanim import character, look, muscles, OUT

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ch = character.build_character()
scene = bpy.context.scene
look.setup_world_and_render(scene, res=560, samples=16)

COLORS = {}
for i, k in enumerate(muscles.MUSCLES):
    r, g, b = colorsys.hsv_to_rgb((i * 0.618) % 1.0, 0.85, 0.95)
    COLORS[k] = (r, g, b)

def paint(obj):
    me = obj.data; n = len(me.vertices)
    col = np.zeros((n, 3)); best = np.zeros(n); buf = np.zeros(n, np.float32)
    for k in muscles.MUSCLES:
        a = me.attributes.get("m_" + k)
        if a is None: continue
        a.data.foreach_get("value", buf)
        sel = buf > best
        col[sel] = np.array(COLORS[k]); best[sel] = buf[sel]
    c = np.ones((n, 4)); c[:, :3] = col * best[:, None] + 0.82 * (1 - best[:, None])
    attr = me.color_attributes.get("fa_dbg") or me.color_attributes.new("fa_dbg", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", c.ravel())
    m = bpy.data.materials.get("FA_Dbg") or bpy.data.materials.new("FA_Dbg"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    at = nt.nodes.get("A") or nt.nodes.new("ShaderNodeAttribute"); at.name = "A"; at.attribute_name = "fa_dbg"
    nt.links.new(at.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.7
    me.materials.clear(); me.materials.append(m)

paint(ch["body"]); paint(ch["shorts"])
cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 50
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam); scene.camera = cam
center = Vector((0, 0, 1.0)); paths = []
for i, yaw in enumerate([-25, 155, 75, -100]):
    look.setup_lights(scene, center, yaw)
    a = math.radians(yaw)
    cam.location = center + Vector((math.sin(a) * 3.1, -math.cos(a) * 3.1, 0.45))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    p = os.path.join(OUT, f"_atlas{i}.png"); scene.render.filepath = p
    bpy.ops.render.render(write_still=True); paths.append(p)
import json
json.dump({k: [round(c, 3) for c in v] for k, v in COLORS.items()}, open(os.path.join(OUT, "_atlas_colors.json"), "w"))
print("ATLAS", ";".join(paths))
