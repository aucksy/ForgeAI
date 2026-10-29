"""Human-eye review pack: close-ups of BOTH shoulders, armpits and hands at 6 points of the rep, plus per-frame numbers
for both dumbbell handles and the shoulder skin. One Blender run.

blender -b --addons bl_ext.user_default.mpfb --python closeups.py -- <spec> <out_dir> [--frames=0,24,..] [--views=camL,..]
          [--no-render]
Env FA_SPEC_PATCH='{"girdle": {...}}' merges into the spec (try variants without editing the recipe).

Views (target follows the joint every frame):
  camL / camR    clip-camera side (yaw +35) and the opposite side (yaw -35), on that side's shoulder + armpit, ~1.0 m
  pitL / pitR    side-on (yaw +-80) into each armpit, ~1.0 m
  hands          from the front, both hands and handles, ~1.6 m
  clip           clip camera angle, upper body + both dumbbells, ~2.2 m
  hips           hips and knees from the clip side, ~1.4 m (not in the default set)
Numbers (printed, and written to <out_dir>/numbers.json):
  handle slope   deg, + = the inner end of the handle is higher; level = 0. Left and right must match.
  handle turn    deg, handle turned in from the shoulder line (seen from above)
  wrist side     deg off the wrist's rest angle, side-to-side (ulnar/radial), per hand
  shoulder rise  m, shoulder joint height above its frame-0 height
  gap_m          m, between the inner ends of the two dumbbells
  crushed/stretched  share of skin faces within 14 cm of each shoulder joint whose area is < 45 % / > 220 % of rest
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
from mathutils import Vector
from forgeanim import character, look, rig as R, animate as A

a = sys.argv[sys.argv.index("--") + 1:]
spec = json.load(open(a[0], encoding="utf-8")); out = a[1]; os.makedirs(out, exist_ok=True)
patch = os.environ.get("FA_SPEC_PATCH")
if patch:
    for k, v in json.loads(patch).items():
        if v is None:
            spec.pop(k, None)
        else:
            spec[k] = v
opt = {x.split("=", 1)[0]: x.split("=", 1)[1] for x in a[2:] if "=" in x}
ch = character.build_character(); rig = ch["rig"]; body = ch["body"]; ctl = R.setup(rig)
clip = A.Clip(spec, ch, ctl); clip.build_props(); clip.highlight(); n = clip.bake()
frames = [int(x) for x in opt.get("--frames", "").split(",") if x] or None
if frames is None:
    fps, keys, _ = clip.timeline()
    # bottom, 1/4 up, mid, 3/4 up, top, 1/4 down (by time inside the lift / lower segments)
    up0, up1 = keys[1][0], keys[2][0]; dn0, dn1 = keys[3][0], keys[4][0]
    t = [0.0, up0 + (up1 - up0) * .25, up0 + (up1 - up0) * .5, up0 + (up1 - up0) * .75, up1, dn0 + (dn1 - dn0) * .25]
    frames = [min(n - 1, int(round(x * fps))) for x in t]
mw = rig.matrix_world; pb = rig.pose.bones
W = lambda b, tail=False: mw @ (pb[b].tail if tail else pb[b].head)

# ---------- skin: rest face areas (armature off) ----------
def face_data():
    dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); me = ev.to_mesh()
    me.calc_loop_triangles()
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    tri = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get("vertices", tri); tri = tri.reshape(-1, 3)
    ev.to_mesh_clear()
    M = np.array(body.matrix_world)
    co = co @ M[:3, :3].T + M[:3, 3]
    p0, p1, p2 = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    return (p0 + p1 + p2) / 3, 0.5 * np.linalg.norm(np.cross(p1 - p0, p2 - p0), axis=1)
arm_mod = [m for m in body.modifiers if m.type == "ARMATURE"][0]
bpy.context.scene.frame_set(0)
arm_mod.show_viewport = False; c_rest, a_rest = face_data(); arm_mod.show_viewport = True
J_rest = {s: np.array(tuple(mw @ rig.data.bones[f"upperarm01.{s}"].head_local)) for s in R.SIDES}
near = {s: np.linalg.norm(c_rest - J_rest[s], axis=1) < 0.14 for s in R.SIDES}

def wrist_side(s):
    fa = pb[f"lowerarm02.{s}"]; hb = pb[f"wrist.{s}"]
    d = hb.matrix.to_3x3().inverted() @ fa.matrix.to_3x3().col[1]
    d0 = hb.bone.matrix_local.to_3x3().inverted() @ fa.bone.matrix_local.to_3x3().col[1]
    sd = math.degrees(math.atan2(d.x, d.y)) - math.degrees(math.atan2(d0.x, d0.y))
    bk = math.degrees(math.atan2(d.z, d.y)) - math.degrees(math.atan2(d0.z, d0.y))
    return round(sd * (1 if s == "L" else -1), 1), round(bk, 1)

rows = []; z0 = None
for f in range(n):
    bpy.context.scene.frame_set(f)
    T = A.torso_frame(rig); tx = T.to_3x3().col[0].normalized()
    r = {"frame": f}
    for s in R.SIDES:
        u = clip.props[f"db_{s}"].matrix_world.to_3x3().col[0].normalized()
        inward = -tx if s == "L" else tx
        if u.dot(inward) < 0:
            u = -u
        r[f"slope_{s}"] = round(math.degrees(math.asin(max(-1, min(1, u.z)))), 1)
        h = Vector((u.x, u.y, 0)).normalized(); hi = Vector((inward.x, inward.y, 0)).normalized()
        r[f"turn_{s}"] = round(math.degrees(h.angle(hi)), 1)
        r[f"wrist_{s}"] = wrist_side(s)
    # gap between the inner ends of the two dumbbells (each reaches 0.162 m from its grip centre)
    r["gap_m"] = round((clip.props["db_L"].matrix_world.translation - clip.props["db_R"].matrix_world.translation).length - 0.324, 3)
    j = {s: W(f"upperarm01.{s}") for s in R.SIDES}
    if z0 is None:
        z0 = {s: j[s].z for s in R.SIDES}
    for s in R.SIDES:
        r[f"rise_{s}"] = round(j[s].z - z0[s], 3)
    if f in frames:
        c, ar = face_data(); ratio = ar / np.maximum(a_rest, 1e-9)
        for s in R.SIDES:
            m = near[s]
            r[f"crushed_{s}"] = round(float((ratio[m] < 0.45).mean()), 3)
            r[f"stretched_{s}"] = round(float((ratio[m] > 2.2).mean()), 3)
    rows.append(r)
for r in rows:
    if r["frame"] in frames or r["frame"] % 6 == 0:
        print("NUM", json.dumps(r))
sl = [abs(r["slope_L"]) for r in rows]; sr = [abs(r["slope_R"]) for r in rows]; d = [abs(r["slope_L"] - r["slope_R"]) for r in rows]
summ = {"frames": frames, "slope_L_max": max(sl), "slope_R_max": max(sr), "slope_LR_diff_max": max(d),
        "turn_L_max": max(r["turn_L"] for r in rows), "turn_R_max": max(r["turn_R"] for r in rows),
        "turn_LR_diff_max": max(abs(r["turn_L"] - r["turn_R"]) for r in rows),
        "wrist_side_L_range": [min(r["wrist_L"][0] for r in rows), max(r["wrist_L"][0] for r in rows)],
        "wrist_side_R_range": [min(r["wrist_R"][0] for r in rows), max(r["wrist_R"][0] for r in rows)],
        "wrist_back_L_range": [min(r["wrist_L"][1] for r in rows), max(r["wrist_L"][1] for r in rows)],
        "wrist_back_R_range": [min(r["wrist_R"][1] for r in rows), max(r["wrist_R"][1] for r in rows)],
        "shoulder_rise_max": max(max(r["rise_L"], r["rise_R"]) for r in rows), "joint_z_f0": round(z0["L"], 3), "gap_min_m": min(r["gap_m"] for r in rows),
        "crushed": {r["frame"]: (r["crushed_L"], r["crushed_R"]) for r in rows if "crushed_L" in r},
        "stretched": {r["frame"]: (r["stretched_L"], r["stretched_R"]) for r in rows if "stretched_L" in r}}
print("SUMMARY", json.dumps(summ))
json.dump({"summary": summ, "rows": rows}, open(os.path.join(out, "numbers.json"), "w"), indent=1)

if "--no-render" in a:
    sys.exit(0)
scene = bpy.context.scene; look.setup_world_and_render(scene, res=int(opt.get("--res", 440)), samples=int(opt.get("--samples", 14)))
cam = bpy.data.objects.new("C", bpy.data.cameras.new("C")); scene.collection.objects.link(cam); scene.camera = cam; cam.data.lens = 60
VIEWS = {"camL": (35, 8, 1.0), "camR": (-35, 8, 1.0), "pitL": (80, 0, 1.0), "pitR": (-80, 0, 1.0), "hands": (0, 4, 1.7), "clip": (35, 15, 2.3), "hips": (35, 12, 1.4)}
views = opt.get("--views", "camL,camR,pitL,pitR,hands,clip").split(",")
for f in frames:
    scene.frame_set(f)
    for v in views:
        yaw, pitch, dist = VIEWS[v]
        if v in ("camL", "pitL", "camR", "pitR"):
            s = "L" if v.endswith("L") else "R"
            # the shoulder joint, a little down and toward the chest so the armpit sits in frame
            c = W(f"upperarm01.{s}") + Vector((0, 0, -0.07))
            c = c + (W("spine01", True) - c) * 0.15
        elif v == "hands":
            c = (clip.props["db_L"].matrix_world.translation + clip.props["db_R"].matrix_world.translation) / 2
            c = c + Vector((0, 0, -0.12))
        elif v == "hips":
            c = (W("upperleg01.L") + W("upperleg01.R")) / 2 + Vector((0, -0.15, 0.0))
        else:
            hs = (clip.props["db_L"].matrix_world.translation + clip.props["db_R"].matrix_world.translation) / 2
            c = (hs + W("spine02")) / 2
        y = math.radians(yaw); p = math.radians(pitch)
        cam.location = c + dist * Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        look.setup_lights(scene, c, yaw)
        scene.render.filepath = os.path.join(out, f"{v}_{f:03d}.png"); bpy.ops.render.render(write_still=True)
print("DONE", out)
