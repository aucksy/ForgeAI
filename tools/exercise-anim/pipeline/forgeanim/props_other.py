"""13 Nov 2026: the "other" props for the exercise pictures (our own geometry, no third-party licence):
decline bench, 45-degree back-extension bench, bars that stand on the floor (pull-up bar, low bar), parallettes, a post,
weight plate, stability ball, push sled, kettlebell, strap.

Props placed by the hands that hold them (pull-up bar, low bar, parallettes) stand on the floor: their legs are built
1 m tall hanging DOWN from the grip (local z 0 .. -1) and tagged "fa_drop"; animate.place_fixtures stretches them every
frame to the grip's height, so the frame always reaches z = 0 whatever the pose.
"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from . import look
from .props import _box, _cyl, _empty, _link, _mats


def _drop(ob, kind="scale"):
    ob["fa_drop"] = kind      # "scale": z-scale = grip height; "floor": z-location = -grip height
    return ob


def decline_bench(deg=20.0, top=0.80, length=1.15, legs=None, name="FA_DeclineBench"):
    """Decline (sit-up) bench. Origin = floor point under the HIGH end of the pad (the hip end); the pad runs down
    toward +Y (the head end) at `deg`. `top` = height of the pad's top surface at the high end. Leg hook in front of the
    high end (toward -Y), placed by the recipe in bench-local (y, z) metres:
      legs = {"knee": [y, z]  (padded roll under the knee crease),
              "rollers": [[y, z], ...]  (foam rollers the ankles hook under)}
    Each roll is 0.46 m wide (x +-0.23), outside the legs; side posts at x +-0.25 carry them to the floor.
    Returns dict(root, deg, top, length, pad_t, t, n, p0): pad top surface point s m from the high end = p0 + t * s."""
    M = _mats()
    root = _empty(name)
    a = math.radians(deg); pad_t = 0.07
    t = Vector((0, math.cos(a), -math.sin(a))); n = Vector((0, math.sin(a), math.cos(a)))
    p0 = Vector((0, 0, top))
    pad = _box(name + "_Pad", (0.29, length, pad_t), mat=M["pad"], bevel=0.022, parent=root)
    pad.matrix_basis = Matrix.Translation(p0 + t * (length / 2) - n * (pad_t / 2)) @ Matrix.Rotation(-a, 4, "X")
    beam = _box(name + "_Beam", (0.07, length * 0.95, 0.06), mat=M["frame"], bevel=0.008, parent=root)
    beam.matrix_basis = Matrix.Translation(p0 + t * (length / 2) - n * (pad_t + 0.035)) @ Matrix.Rotation(-a, 4, "X")
    hi = p0 + t * 0.06 - n * (pad_t + 0.06)            # under the high end
    lo = p0 + t * (length - 0.08) - n * (pad_t + 0.06)  # under the head end
    for nm, p in (("LegHi", hi), ("LegLo", lo)):
        _box(name + "_" + nm, (0.06, 0.06, p.z), loc=(0, p.y, p.z / 2), mat=M["frame"], bevel=0.006, parent=root)
        _box(name + "_Foot" + nm, (0.50, 0.07, 0.06), loc=(0, p.y, 0.03), mat=M["frame"], bevel=0.008, parent=root)
        for s in (1, -1):
            _cyl(name + f"_Cap{nm}{s}", 0.032, 0.03, mat=M["rubber"], bevel=0.004, loc=(s * 0.265, p.y, 0.03), parent=root)
    legs = legs or {}
    rolls = ([("Knee", legs["knee"], 0.05)] if legs.get("knee") else []) + \
            [(f"Roller{i}", r, 0.06) for i, r in enumerate(legs.get("rollers", []))]
    ys = []
    for nm, (y, z), r in rolls:
        _cyl(name + "_" + nm, r, 0.46, verts=40, mat=M["pad"], bevel=0.01, loc=(0, y, z), parent=root)
        for s in (1, -1):
            _box(name + f"_{nm}Post{s}", (0.035, 0.035, z), loc=(s * 0.25, y, z / 2), mat=M["frame"], bevel=0.004, parent=root)
        ys.append(y)
    if ys:   # floor rails under the leg hook, joined to the high-end leg
        y0, y1 = min(ys + [hi.y]), max(ys + [hi.y])
        for s in (1, -1):
            _box(name + f"_HookRail{s}", (0.04, y1 - y0 + 0.04, 0.04), loc=(s * 0.25, (y0 + y1) / 2, 0.02), mat=M["frame"], bevel=0.004, parent=root)
        _box(name + "_HookCross", (0.54, 0.04, 0.04), loc=(0, hi.y, 0.02), mat=M["frame"], bevel=0.004, parent=root)
    return {"root": root, "deg": deg, "top": top, "length": length, "pad_t": pad_t, "t": t, "n": n, "p0": p0}


def hyperext_bench(deg=45.0, hip_pad=(0.0, 1.0), foot=(0.6, 0.2), roller=(0.5, 0.35), name="FA_HyperBench"):
    """45-degree back-extension (hyperextension) bench from three recipe points (bench-local (y, z) metres; the athlete
    faces -Y, the legs slope down toward +Y behind him):
      hip_pad = top edge of the hip pad, middle of its face (the pad face runs down the leg slope from here and the
                front of the thighs lie on it; the face looks up and back, square to the leg slope),
      foot    = centre of the foot plate's top surface (square to the leg slope; the soles stand on it),
      roller  = centre of the ankle roller (behind the lower calves).
    A sloped rail joins them to two floor feet. Returns the root empty."""
    M = _mats()
    root = _empty(name)
    a = math.radians(deg)
    d = Vector((0, math.cos(a), -math.sin(a)))       # down the leg slope (toward the feet: +Y and down)
    nrm = Vector((0, math.sin(a), math.cos(a)))      # pad face normal, out toward the thighs (up and back, square to d)
    hp = Vector((0, hip_pad[0], hip_pad[1]))
    pad_t, pad_len = 0.08, 0.34
    pad = _box(name + "_HipPad", (0.38, pad_len, pad_t), mat=M["pad"], bevel=0.025, parent=root)
    pad.matrix_basis = Matrix.Translation(hp + d * (pad_len / 2) - nrm * (pad_t / 2)) @ Matrix.Rotation(-a, 4, "X")
    fp = Vector((0, foot[0], foot[1]))
    # foot plate square to the leg slope (its top faces up the legs), so the soles stand flat with a neutral ankle
    fpl = _box(name + "_FootPlate", (0.44, 0.30, 0.03), mat=M["frame"], bevel=0.005, parent=root)
    fpl.matrix_basis = Matrix.Translation(fp + d * 0.015) @ Matrix.Rotation(math.radians(90.0 - deg), 4, "X")
    rl = Vector((0, roller[0], roller[1]))
    _cyl(name + "_Roller", 0.055, 0.42, verts=40, mat=M["pad"], bevel=0.01, loc=tuple(rl), parent=root)
    top = hp + d * (pad_len / 2) - nrm * (pad_t + 0.035)    # behind the middle of the hip pad
    bot = Vector((0, max(fp.y, rl.y) + 0.12, 0.06))
    r = top - bot
    rail = _box(name + "_Rail", (0.07, r.length, 0.07), mat=M["frame"], bevel=0.008, parent=root)
    rail.matrix_basis = Matrix.Translation((top + bot) / 2) @ r.to_track_quat("Y", "Z").to_matrix().to_4x4()
    y0, y1 = min(top.y, bot.y, fp.y) - 0.15, max(top.y, bot.y) + 0.05
    _box(name + "_FloorRail", (0.07, y1 - y0, 0.06), loc=(0, (y0 + y1) / 2, 0.03), mat=M["frame"], bevel=0.008, parent=root)
    for y in (y0, y1):
        _box(name + f"_Foot{y:.2f}", (0.62, 0.07, 0.06), loc=(0, y, 0.03), mat=M["frame"], bevel=0.008, parent=root)
    _box(name + "_PadPost", (0.06, 0.06, top.z), loc=(0, top.y, top.z / 2), mat=M["frame"], bevel=0.006, parent=root)
    for s in (1, -1):
        _box(name + f"_RollerPost{s}", (0.03, 0.03, rl.z), loc=(s * 0.225, rl.y, rl.z / 2), mat=M["frame"], bevel=0.004, parent=root)
        _box(name + f"_PlatePost{s}", (0.035, 0.035, max(0.03, fp.z - 0.03)), loc=(s * 0.19, fp.y, (fp.z - 0.03) / 2), mat=M["frame"], bevel=0.004, parent=root)
    return root


def hand_bar(name="FA_HandBar", length=1.2, r=0.016):
    """A straight bar the hands hang from or lean on, standing on the floor (pull-up bar / low bar).
    Origin = centre of the bar, bar along local X, local Z = world up. Two uprights at the bar ends and their floor
    feet are fa_drop parts: animate.place_fixtures stretches them to the floor each frame."""
    M = _mats()
    root = _empty(name)
    _cyl(name + "_Bar", r, length + 0.08, verts=32, mat=M["chrome"], parent=root)
    x = length / 2 + 0.04
    for s in (1, -1):
        _drop(_box(name + f"_Upright{s}", (0.06, 0.06, 1.0), loc=(s * x, 0, -0.5), mat=M["frame"], bevel=0.006, parent=root))
        _drop(_box(name + f"_Foot{s}", (0.07, 0.70, 0.05), loc=(s * x, 0, 0.025), mat=M["frame"], bevel=0.006, parent=root), "floor")
    return root


def parallette(name="FA_Parallette", length=0.50, r=0.017):
    """One parallette (low parallel bar). Origin = centre of the handle (where the fist grips), handle along local X,
    local Z = up. Two legs and a floor rail are fa_drop parts (stretched to the floor each frame)."""
    M = _mats()
    root = _empty(name)
    _cyl(name + "_Handle", r, length, verts=32, mat=M["chrome"], parent=root)
    for s in (1, -1):
        _drop(_box(name + f"_Leg{s}", (0.03, 0.03, 1.0), loc=(s * (length / 2 - 0.02), 0, -0.5), mat=M["frame"], bevel=0.004, parent=root))
        _drop(_box(name + f"_Foot{s}", (0.05, 0.24, 0.03), loc=(s * (length / 2 - 0.02), 0, 0.015), mat=M["frame"], bevel=0.004, parent=root), "floor")
    return root


def post(name="FA_Post", height=2.0, r=0.022):
    """A vertical pole (rack upright) a free hand holds. Origin = floor point at its centre."""
    M = _mats()
    root = _empty(name)
    _cyl(name + "_Pole", r, height, verts=32, axis="Z", mat=M["frame"], loc=(0, 0, height / 2), parent=root)
    _cyl(name + "_Base", 0.16, 0.025, verts=48, axis="Z", mat=M["frame"], bevel=0.004, loc=(0, 0, 0.0125), parent=root)
    return root


def plate(name="FA_Plate", r=0.225, t=0.045):
    """Iron weight plate. Origin = plate centre, face normal along local Y (the plate lies in local XZ).
    Raised rim (where the fingers hook), thinner face, chrome hub."""
    M = _mats()
    root = _empty(name)
    # a thick outer ring (the lip the fingers hook over) around a thinner face: two cylinders, the face sunk 8 mm
    _cyl(name + "_Rim", r, t, verts=96, axis="Y", mat=M["iron"], bevel=0.01, parent=root)
    _cyl(name + "_Face", r - 0.035, t + 0.002, verts=96, axis="Y", mat=look.flat_material("FA_PlateFace", "#232427", roughness=0.5, spec=0.35), bevel=0.004, parent=root)
    _cyl(name + "_Hub", 0.05, t + 0.008, verts=48, axis="Y", mat=M["chrome"], bevel=0.003, parent=root)
    return root


def ball(name="FA_Ball", r=0.33):
    """Stability (gym) ball. Origin = floor contact point (bottom of the ball)."""
    root = _empty(name)
    me = bpy.data.meshes.new(name + "_Sphere")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=r)
    bmesh.ops.translate(bm, vec=Vector((0, 0, r)), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name + "_Sphere", me)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(look.flat_material("FA_BallMat", "#59606B", roughness=0.45, spec=0.4, coat=0.2))
    _link(ob, root)
    return root


def sled(name="FA_Sled", pole_gap=0.50, pole_h=1.15):
    """Push sled. Origin = floor point midway between the two upright poles; poles along local Z at x +-pole_gap/2,
    the sled body runs away from the athlete along local -Y. Two plates on the peg."""
    M = _mats()
    root = _empty(name)
    for s in (1, -1):
        _box(name + f"_Skid{s}", (0.05, 0.95, 0.05), loc=(s * 0.30, -0.40, 0.025), mat=M["frame"], bevel=0.008, parent=root)
        _cyl(name + f"_Pole{s}", 0.019, pole_h, verts=32, axis="Z", mat=M["chrome"], loc=(s * pole_gap / 2, 0, pole_h / 2 + 0.04), parent=root)
    _box(name + "_Deck", (0.66, 0.80, 0.03), loc=(0, -0.45, 0.065), mat=M["frame"], bevel=0.006, parent=root)
    _box(name + "_Cross", (pole_gap + 0.1, 0.06, 0.06), loc=(0, 0, 0.07), mat=M["frame"], bevel=0.006, parent=root)
    _cyl(name + "_Peg", 0.025, 0.40, verts=32, axis="Z", mat=M["chrome"], loc=(0, -0.45, 0.28), parent=root)
    for i in range(2):
        _cyl(name + f"_Plate{i}", 0.225, 0.045, verts=72, axis="Z", mat=M["iron"], bevel=0.008, loc=(0, -0.45, 0.105 + i * 0.05), parent=root)
    return root


def kettlebell(name="FA_Kettlebell", bell_r=0.105):
    """Kettlebell (~16 kg). Origin = centre of the handle (the grip), handle along local X; the bell hangs on local -Y
    (animate turns local +Y toward the hand's "prop_up", default the torso's up)."""
    M = _mats()
    root = _empty(name)
    hl = 0.13
    _cyl(name + "_Handle", 0.017, hl, verts=32, mat=M["iron"], parent=root)
    cy = -(0.05 + bell_r)
    me = bpy.data.meshes.new(name + "_BellMesh")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=bell_r)
    bmesh.ops.translate(bm, vec=Vector((0, cy, 0)), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    bell = bpy.data.objects.new(name + "_Bell", me)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(M["iron"]); _link(bell, root)
    for s in (1, -1):   # horns: from the handle ends down into the bell's shoulders
        a = Vector((s * hl / 2, 0, 0)); b = Vector((s * bell_r * 0.5, cy + bell_r * 0.75, 0))
        d = b - a
        h = _cyl(name + f"_Horn{s}", 0.017, d.length + 0.025, verts=24, axis="Z", mat=M["iron"], parent=root)
        h.matrix_basis = Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    return root
