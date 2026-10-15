"""Gym equipment built in code (our own geometry, no third-party licence).

Every prop is an object with its origin at its natural grip/anchor point:
  dumbbell(): origin = centre of the handle, handle along local X.
  incline_bench(deg): origin = floor point under the seat/back hinge; bench runs along +Y (back pad rises toward +Y).
"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from . import look


def _link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def _cyl(name, r, depth, verts=48, axis="X", mat=None, bevel=0.0, loc=(0, 0, 0), parent=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r, depth=depth)
    rot = {"X": Matrix.Rotation(math.radians(90), 4, "Y"), "Y": Matrix.Rotation(math.radians(90), 4, "X"), "Z": Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ rot, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    for p in me.polygons:
        p.use_smooth = True
    if bevel > 0:
        b = ob.modifiers.new("Bevel", "BEVEL"); b.width = bevel; b.segments = 3; b.limit_method = "ANGLE"
        ob.modifiers.new("WN", "WEIGHTED_NORMAL").keep_sharp = True
    if mat:
        me.materials.append(mat)
    return _link(ob, parent)


def _box(name, size, loc=(0, 0, 0), mat=None, bevel=0.0, segs=4, parent=None, rot=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    m = Matrix.Translation(loc)
    if rot is not None:
        m = m @ rot
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    for p in me.polygons:
        p.use_smooth = True
    if bevel > 0:
        b = ob.modifiers.new("Bevel", "BEVEL"); b.width = bevel; b.segments = segs; b.limit_method = "NONE"
        ob.modifiers.new("WN", "WEIGHTED_NORMAL").keep_sharp = False
    if mat:
        me.materials.append(mat)
    return _link(ob, parent)


def _empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); e.empty_display_size = 0.05; e.location = loc
    return _link(e, parent)


def _mats():
    P = look.PALETTE
    return {
        "iron": look.flat_material("FA_Iron", P["iron"], roughness=0.42, spec=0.45, coat=0.25),
        "chrome": look.flat_material("FA_Chrome", P["chrome"], roughness=0.22, metallic=1.0, spec=0.5),
        "frame": look.flat_material("FA_Frame", P["frame"], roughness=0.35, metallic=0.15, spec=0.5, coat=0.3),
        "pad": look.flat_material("FA_Pad", P["pad"], roughness=0.5, spec=0.35, coat=0.15),
        "rubber": look.flat_material("FA_Rubber", "#2B2D31", roughness=0.75, spec=0.2),
    }


def dumbbell(name="FA_Dumbbell", plates=(0.088, 0.074), handle_len=0.14):
    """Round-plate dumbbell, ~0.36 m long. Returns the root empty (origin = grip centre)."""
    M = _mats()
    root = _empty(name)
    _cyl(name + "_Handle", 0.0165, handle_len + 0.02, mat=M["chrome"], parent=root)
    x = handle_len / 2
    for s in (1, -1):
        _cyl(name + f"_CollarIn{s}", 0.026, 0.012, mat=M["chrome"], bevel=0.002, loc=(s * (x + 0.006), 0, 0), parent=root)
        off = x + 0.012
        for i, r in enumerate(plates):
            t = 0.030 if i == 0 else 0.024
            _cyl(name + f"_Plate{s}{i}", r, t, verts=64, mat=M["iron"], bevel=0.006, loc=(s * (off + t / 2), 0, 0), parent=root)
            _cyl(name + f"_Hub{s}{i}", 0.032, t + 0.004, mat=M["chrome"], bevel=0.0015, loc=(s * (off + t / 2), 0, 0), parent=root)
            off += t + 0.002
        _cyl(name + f"_Lock{s}", 0.03, 0.022, mat=M["chrome"], bevel=0.003, loc=(s * (off + 0.011), 0, 0), parent=root)
    return root


def incline_bench(incline_deg=35.0, name="FA_Bench"):
    """Adjustable bench. Origin on the floor under the seat/back hinge. Returns dict(root, seat_top, back_axis)."""
    M = _mats()
    root = _empty(name)
    seat_h = 0.44          # top of seat pad
    pad_t = 0.075
    # seat: in front of the hinge (toward -Y), slightly tilted up at the front
    seat_len = 0.34
    seat = _box(name + "_Seat", (0.30, seat_len, pad_t), loc=(0, -seat_len / 2 - 0.01, seat_h - pad_t / 2), mat=M["pad"], bevel=0.022, parent=root)
    # back pad: hinged at (y=0, z=seat_h), rising toward +Y
    a = math.radians(incline_deg)
    back_len = 0.82
    hinge = Vector((0, 0.01, seat_h - pad_t / 2))
    rot = Matrix.Rotation(a, 4, "X")
    back = _box(name + "_Back", (0.29, back_len, pad_t), loc=(0, 0, 0), mat=M["pad"], bevel=0.022, parent=root)
    back.matrix_basis = Matrix.Translation(hinge) @ rot @ Matrix.Translation((0, back_len / 2 + 0.02, 0))
    # frame: main rail, feet, struts, seat post
    _box(name + "_Rail", (0.07, 1.25, 0.06), loc=(0, 0.12, 0.08), mat=M["frame"], bevel=0.008, parent=root)
    _box(name + "_FootF", (0.48, 0.07, 0.06), loc=(0, -0.48, 0.05), mat=M["frame"], bevel=0.008, parent=root)
    _box(name + "_FootR", (0.48, 0.07, 0.06), loc=(0, 0.72, 0.05), mat=M["frame"], bevel=0.008, parent=root)
    for s in (1, -1):
        for y in (-0.48, 0.72):
            _cyl(name + f"_Cap{s}{y}", 0.032, 0.03, axis="X", mat=M["rubber"], bevel=0.004, loc=(s * 0.255, y, 0.05), parent=root)
    _box(name + "_SeatPost", (0.06, 0.06, seat_h - 0.16), loc=(0, -0.18, 0.08 + (seat_h - 0.16) / 2), mat=M["frame"], bevel=0.006, parent=root)
    _box(name + "_SeatPlate", (0.18, 0.30, 0.02), loc=(0, -0.18, seat_h - pad_t - 0.012), mat=M["frame"], bevel=0.004, parent=root)
    # back support strut: from rail to the middle of the back pad
    mid = hinge + rot @ Vector((0, back_len * 0.55, -pad_t / 2 - 0.02))
    base = Vector((0, 0.55, 0.11))
    d = mid - base
    strut = _box(name + "_Strut", (0.055, d.length, 0.05), mat=M["frame"], bevel=0.006, parent=root)
    strut.matrix_basis = Matrix.Translation((base + mid) / 2) @ d.to_track_quat("Y", "Z").to_matrix().to_4x4()
    _box(name + "_BackPlate", (0.16, back_len * 0.8, 0.02), mat=M["frame"], bevel=0.004, parent=back,
         loc=(0, 0, -pad_t / 2 - 0.012))
    _box(name + "_Hinge", (0.2, 0.05, 0.05), loc=(0, 0.0, seat_h - pad_t - 0.02), mat=M["frame"], bevel=0.006, parent=root)
    return {"root": root, "seat_h": seat_h, "hinge": hinge, "incline": a, "back_len": back_len, "pad_t": pad_t}
