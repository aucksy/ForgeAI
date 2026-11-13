"""Build one exercise clip from its spec.

blender -b --addons bl_ext.user_default.mpfb --python make_clip.py -- <spec.json> [preview|full] [--side]
  preview : the key poses only, small and fast, from the clip camera (+ a side view with --side;
            --frames=8,16,24 previews those frames instead of the key poses)
  full    : every frame at clip quality into out/<key>/frames (resumable: existing frames are skipped)
  stills  : exercise pictures: <key>__start.png / __end.png (transparent, floor shadow) + QA side views

Then run encode.py (plain Python) to make the WebP / MP4 / poster.
"""
import sys, os, json, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from forgeanim import character, look, rig as R, animate as A, render as RD, report as REP, OUT

args = sys.argv[sys.argv.index("--") + 1:]
spec_path = args[0]
mode = args[1] if len(args) > 1 else "preview"
side = "--side" in args
pick = next((a.split("=", 1)[1] for a in args if a.startswith("--frames=")), None)   # e.g. --frames=8,16,24
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
objs = [ch["body"], ch["shorts"]] + [c for p in clip.props.values() for c in p.children_recursive if c.type == "MESH"]
objs += [c for e in getattr(clip, "extras", []) for c in e.children_recursive if c.type == "MESH"]
if hasattr(clip, "bench"):
    objs += list(clip.bench["root"].children)
for bx in getattr(clip, "boxes", []):
    objs += list(bx.children)
objs += clip.cable_meshes()   # cable columns, handles and cables (13 Nov 2026): the whole column stays in the picture
objs += getattr(clip, "machine_objs", [])
for sr in getattr(clip, "scene_roots", []):   # props_other: decline bench, back-extension bench, ball (13 Nov 2026)
    objs += list(sr.children)


def contacts(ev_body):
    """How each prop meets the body (13 Nov 2026): per prop, the deepest body point inside it (negative = cut in,
    metres) and the nearest body point outside it (the gap). Signed by the nearest face's normal (props are closed)."""
    from mathutils.bvhtree import BVHTree
    dg2 = bpy.context.evaluated_depsgraph_get()
    me_b = ev_body.to_mesh(); mw = ev_body.matrix_world
    pts = [mw @ me_b.vertices[i].co for i in range(0, len(me_b.vertices), 2)]
    ev_body.to_mesh_clear()
    out = {}
    groups = {}
    for o in objs[2:]:
        if o.type != "MESH":
            continue
        root = o.parent.name if o.parent else o.name
        groups.setdefault(root, []).append(o)
    for root, obs in groups.items():
        best_in, best_gap = (0.0, None), (9.9, None)
        for o in obs:
            ev = o.evaluated_get(dg2); m = ev.to_mesh()
            bvh = BVHTree.FromPolygons([ev.matrix_world @ v.co for v in m.vertices], [list(p.vertices) for p in m.polygons])
            ev.to_mesh_clear()
            for q in pts:
                hit = bvh.find_nearest(q, 0.25)
                if hit[0] is None:
                    continue
                d = (q - hit[0]).dot(hit[1]); d = d if abs(d) > 1e-9 else hit[3]
                if d < best_in[0]:
                    best_in = (d, q)
                if 0 <= d < best_gap[0]:
                    best_gap = (d, q)
        fmt = lambda v: [round(x, 3) for x in v] if v is not None else None
        out[root] = {"deepest_in": round(best_in[0], 4), "deepest_at": fmt(best_in[1]),
                     "gap": round(best_gap[0], 4) if best_gap[1] is not None else None, "gap_at": fmt(best_gap[1])}
    return out
fps, keys, _ = clip.timeline()
key_frames = sorted({min(n - 1, int(round(k[0] * fps))) for k in keys})


def floor_mat():
    """Drawn look (R-490): floor work lies on a thin grey exercise mat, as in the main picture set. Added when the
    hips come within 0.45 m of the floor in a key pose and nothing (a bench, a box) is under them."""
    dg3 = bpy.context.evaluated_depsgraph_get()
    rig = ch["rig"]; low_pts = []; hips_low = False
    under = [o for o in objs[2:] if o.type == "MESH"]
    for f in key_frames:
        bpy.context.scene.frame_set(f); dg3.update()
        hip = rig.matrix_world @ rig.pose.bones["root"].head
        if hip.z < 0.45:
            covered = False
            for o in under:
                bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
                if (min(v.x for v in bb) < hip.x < max(v.x for v in bb) and min(v.y for v in bb) < hip.y < max(v.y for v in bb)
                        and max(v.z for v in bb) > 0.08):
                    covered = True
            hips_low = hips_low or not covered
        ev = ch["body"].evaluated_get(dg3); me = ev.to_mesh()
        low_pts += [ev.matrix_world @ v.co for v in me.vertices if (ev.matrix_world @ v.co).z < 0.12]
        ev.to_mesh_clear()
    if not hips_low or not low_pts:
        return None
    x0 = min(p.x for p in low_pts); x1 = max(p.x for p in low_pts); y0 = min(p.y for p in low_pts); y1 = max(p.y for p in low_pts)
    w = max(0.62, x1 - x0 + 0.16); l = max(0.62, y1 - y0 + 0.16)
    if (x1 - x0) > (y1 - y0):
        w, l = max(w, 1.75), max(l, 0.62)
    else:
        w, l = max(w, 0.62), max(l, 1.75)
    from forgeanim import props as PR
    root = PR._empty("FA_MatRoot")
    mo = PR._box("FA_Mat", (w, l, 0.012), loc=((x0 + x1) / 2, (y0 + y1) / 2, -0.006), mat=look.toon_material("FA_Mat", *look.TOON["mat"]),
                 bevel=0.0, parent=root)
    for p in mo.data.polygons:   # flat faces: smooth normals on a thin slab shade it in stripes
        p.use_smooth = False
    print(f"[still] floor mat {w:.2f} x {l:.2f} m under the body")
    return root


if look.DRAWN and mode == "stills":
    _m = floor_mat()
    if _m is not None:
        objs += list(_m.children)
pitch = cam_spec.get("pitch", 12)
if look.DRAWN and pitch > 12:   # the main set looks from about chest height: steep recipe cameras are eased (look tests r1-r2)
    pitch = 12 + (pitch - 12) * 0.35
lens = cam_spec.get("lens", 50)
if look.DRAWN and mode == "stills":   # the main set is drawn almost flat: a long lens, little perspective (look test r4)
    lens = max(lens, float(os.environ.get("FA_STILL_LENS", 90)))
center, d = RD.frame_camera(scene, cam, objs, cam_spec.get("yaw", -30), pitch,
                            lens, cam_spec.get("fill", 0.86), sample_frames=key_frames,
                            target_offset=cam_spec.get("offset", (0, 0, 0)))
look.setup_lights(scene, center, cam_spec.get("yaw", -30) + cam_spec.get("light_yaw", 0))

if mode == "stills":
    # Exercise pictures (11 Nov 2026): the start and end poses (one pose = a hold) as big transparent PNGs with a
    # soft floor shadow. The look (background, framing, size) is NOT baked in: export_pictures.py adds it later,
    # so a new look never needs a new render. Plus small side views and floor numbers for QA.
    look.setup_world_and_render(scene, res=cam_spec.get("still_res", 768), samples=cam_spec.get("still_samples", 32), transparent=True)
    if look.DRAWN:   # diagnostics: every mesh Freestyle sees (look test r3: equipment drew almost no lines)
        for o in scene.objects:
            if o.type == "MESH":
                print(f"[objs] {o.name} render={not o.hide_render} cam={o.visible_camera} polys={len(o.data.polygons)} "
                      f"dims={tuple(round(v, 2) for v in o.dimensions)} mods={[m.type for m in o.modifiers]} "
                      f"cols={[c.name for c in o.users_collection]}")
    if look.DRAWN and os.environ.get("FA_HULL_ON", "1") == "1":   # solid dark outlines round equipment (not cables)
        nh = 0
        for o in objs[2:]:
            if o.type == "MESH" and "CableLine" not in o.name and "StackCable" not in o.name:
                look.add_outline(o); nh += 1
        print(f"[still] outlines on {nh} equipment meshes")
    if not look.DRAWN:   # the drawn look has no lamps: export_pictures.py draws its floor ellipse instead
        bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
        floor = bpy.context.active_object; floor.name = "FA_ShadowFloor"; floor.is_shadow_catcher = True
    order = []
    for k in keys:
        if k[1] not in [p for p, _ in order]:
            order.append((k[1], min(n - 1, int(round(k[0] * fps)))))
    names = ["start", "end"] if len(order) > 1 else ["start"]
    dg = bpy.context.evaluated_depsgraph_get()
    stills = {}
    for (pose, f), tag in zip(order, names):
        scene.frame_set(f); dg.update()
        ev = ch["body"].evaluated_get(dg); me = ev.to_mesh()
        # where the lowest point is, not just how low (12 Nov 2026: two plank retries blamed the hands when the toes
        # were 5 cm in the floor): hands sit near the head end, toes at the feet end, so the xyz names the part
        lp = min((ev.matrix_world @ v.co for v in me.vertices), key=lambda q: q.z); low = lp.z
        cable_gap = clip.cable_clearance(ev, me) if getattr(clip, "cables", None) else None
        ev.to_mesh_clear()
        pl = [min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for p in clip.props.values() for o in p.children_recursive if o.type == "MESH"]
        print(f"[still] {tag} pose={pose} frame={f} lowest_body_z={low:.4f} at=({lp.x:.3f},{lp.y:.3f},{lp.z:.3f}) lowest_prop_z={(min(pl) if pl else 0):.4f}")
        if ch.get("shoes") is not None:   # drawn look: the feet are inside the trainers, so the soles are the floor contact
            evs = ch["shoes"].evaluated_get(dg); ms = evs.to_mesh()
            sz = sorted((evs.matrix_world @ v.co).z for v in ms.vertices); evs.to_mesh_clear()
            print(f"[still] {tag} shoes lowest_z={sz[0]:.4f}")
        if cable_gap is not None:
            print(f"[still] {tag} cable clearance from the skin (m, negative = through the body): {cable_gap}")
        # 13 Nov 2026: lowest point per body part, joints in the torso frame, how level each hand is, bench pad gaps
        try:
            rig = ch["rig"]; lw = REP.lows(ch["body"], rig); T = A.torso_frame(rig)
            fists = {s: (rig.matrix_world @ rig.pose.bones[f"wrist.{s}"].matrix @ clip.G[s]).translation for s in R.SIDES}
            hands = {}
            for s in R.SIDES:
                wr = R.world_head(rig, f"wrist.{s}"); hd = (R.world_head(rig, f"finger3-1.{s}") - wr).normalized()
                kn = R.world_head(rig, f"finger2-1.{s}") - R.world_head(rig, f"finger5-1.{s}")
                pm = hd.cross(kn).normalized()
                pm = pm if pm.dot(fists[s] - wr) >= 0 else -pm   # palm normal (the side the fist curls to)
                hands[s] = {"hand_from_level_deg": round(math.degrees(math.asin(max(-1, min(1, hd.z)))), 1), "palm_z": round(pm.z, 2)}
            rep = {"lows": {k: [round(v[0], 4)] + v[1] for k, v in lw.items()}, "hands": hands,
                   "joints": REP.joints(rig, T, fists)}
            hdv = (R.world_tail(rig, "head") - R.world_head(rig, "neck01")).normalized()
            rep["head_tilt_left_deg"] = round(math.degrees(math.asin(max(-1, min(1, hdv.dot(T.to_3x3().col[0]))))), 1)
            spb = rig.pose.bones   # bones a recipe turns by hand (shrug = clavicle): what they really did
            rep["bones"] = {b: {"mode": spb[b].rotation_mode, "euler": [round(math.degrees(a), 1) for a in spb[b].rotation_euler],
                                "parent": spb[b].parent.name if spb[b].parent else None,
                                "tail": [round(c, 3) for c in rig.matrix_world @ spb[b].tail]}
                            for b in ("clavicle.L", "shoulder01.L", "upperarm01.L") if b in spb}
            if hasattr(clip, "bench"):
                rep["pad_gap"] = REP.pad_gaps(ch["body"], rig, clip.bench)
            if hasattr(clip, "preacher"):
                rep["preacher_gap"] = REP.preacher_gaps(ch["body"], rig, clip.preacher)
            print(f"[report] {tag} " + json.dumps(rep))
        except Exception as ex:   # a report bug must never cost the pictures
            rep = {"error": repr(ex)}; print(f"[report] {tag} failed: {ex!r}")
        p = os.path.join(out, f"{key}__{tag}.png"); scene.render.filepath = p
        bpy.ops.render.render(write_still=True); stills[tag] = {"pose": pose, "frame": f, "lowest_body_z": round(low, 4),
                                                           "lowest_body_at": [round(lp.x, 3), round(lp.y, 3), round(lp.z, 3)], "report": rep}
        if cable_gap is not None:
            stills[tag]["cable_clearance"] = cable_gap
        # 13 Nov 2026: body vs every prop (cut-in depth / gap), the hands' fist centres and the fixtures' own numbers
        scene.frame_set(f); dg.update()
        if getattr(clip, "scene_roots", None) or any(p["type"] in A.PO_TYPES for p in spec.get("props", {}).values()):
            stills[tag]["contacts"] = contacts(ch["body"].evaluated_get(dg))   # props_other recipes only (speed)
        else:
            stills[tag]["contacts"] = {}
        stills[tag]["wrists"] = {s: [round(v, 3) for v in (ch["rig"].matrix_world @ ch["rig"].pose.bones[f"wrist.{s}"].head)] for s in ("L", "R")}
        stills[tag]["fixtures"] = [m for (fr, _), m in sorted(getattr(clip, "fix_msgs", {}).items()) if fr == f]
        print(f"[still] {tag} contacts {json.dumps(stills[tag]['contacts'])}")
        for m in stills[tag]["fixtures"]:
            print(f"[still] {tag} fixture {m}")
    scene.render.resolution_x = scene.render.resolution_y = 400; scene.cycles.samples = 12
    RD.frame_camera(scene, cam, objs, cam_spec.get("yaw", -30) + 90, 5, 50, 0.9, sample_frames=[f for _, f in order])
    for (pose, f), tag in zip(order, names):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(out, f"{key}__qa_side_{tag}.png"); bpy.ops.render.render(write_still=True)
    json.dump({"key": key, "stills": stills, "yaw": cam_spec.get("yaw", -30)}, open(os.path.join(out, f"{key}__stills.json"), "w"), indent=1)
    print(f"[clip] stills done in {time.time() - t0:.1f}s")
elif mode == "preview":
    paths = []
    views = [("cam", None)] + ([("side", 90)] if side else [])
    for tag, yaw in views:
        if yaw is not None:
            RD.frame_camera(scene, cam, objs, yaw, 5, 50, 0.9, sample_frames=key_frames)
        for f in ([int(x) for x in pick.split(",")] if pick else key_frames):
            scene.frame_set(f)
            p = os.path.join(out, f"_prev_{tag}_{f:03d}.png"); scene.render.filepath = p
            bpy.ops.render.render(write_still=True); paths.append(p)
    print("PREVIEW", ";".join(paths))
else:
    RD.render_frames(scene, os.path.join(out, "frames"), n)
    # poster = top of the rep: timing.poster (seconds) if given, else the first hold that is not the start pose
    # (keys[2] alone breaks once a recipe adds mid poses on the way up, e.g. curls)
    tp = spec["timing"].get("poster")
    if tp is None:
        holds = [k[0] for i, k in enumerate(keys[:-1]) if i > 0 and k[1] == keys[i + 1][1] and k[1] != keys[0][1]]
        tp = holds[0] if holds else (keys[2][0] if len(keys) >= 3 else 0)
    poster = min(n - 1, int(round(tp * fps)))
    json.dump({"key": key, "frames": n, "fps": fps, "res": res, "poster": poster}, open(os.path.join(out, "frames", "meta.json"), "w"))
    print(f"[clip] rendered {n} frames in {time.time() - t0:.1f}s")
