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


def box(size=(0.6, 0.4, 0.3), name="FA_Box"):
    """Plain gym box / step / wall block (11 Nov 2026, exercise pictures). Origin = floor point under its centre.
    size = (x width, y depth, z height) in metres. Returns the root empty."""
    M = _mats()
    root = _empty(name)
    w, d, h = size
    _box(name + "_Body", (w, d, h), loc=(0, 0, h / 2), mat=M["pad"], bevel=0.015, parent=root)
    return root


def barbell(name="FA_Barbell", shaft=1.31, sleeve=0.42, plates=(0.225,), plate_t=0.045, shaft_r=0.014):
    """Straight barbell (13 Nov 2026, exercise pictures). Origin = centre of the bar, bar along local X.
    Defaults = Olympic bar: 2.2 m long, 28 mm grip shaft 1.31 m between the inner collars, 50 mm sleeves 0.42 m long,
    one 45 cm plate a side. A fixed curl bar: shaft 1.0, sleeve 0.20, plates (0.15,). The bar is placed by the two
    hands that hold it (animate.place_bars), so it always runs through both fists."""
    M = _mats()
    root = _empty(name)
    _cyl(name + "_Shaft", shaft_r, shaft + 0.02, verts=32, mat=M["chrome"], parent=root)
    x = shaft / 2
    for s in (1, -1):
        _cyl(name + f"_Collar{s}", 0.040, 0.030, mat=M["chrome"], bevel=0.003, loc=(s * (x + 0.015), 0, 0), parent=root)
        _cyl(name + f"_Sleeve{s}", 0.025, sleeve, verts=32, mat=M["chrome"], bevel=0.002, loc=(s * (x + 0.03 + sleeve / 2), 0, 0), parent=root)
        off = x + 0.035
        for i, r in enumerate(plates):
            _cyl(name + f"_Plate{s}{i}", r, plate_t, verts=72, mat=M["iron"], bevel=0.008, loc=(s * (off + plate_t / 2), 0, 0), parent=root)
            _cyl(name + f"_Hub{s}{i}", 0.045, plate_t + 0.006, mat=M["chrome"], bevel=0.002, loc=(s * (off + plate_t / 2), 0, 0), parent=root)
            off += plate_t + 0.003
        _cyl(name + f"_Clip{s}", 0.034, 0.025, mat=M["chrome"], bevel=0.003, loc=(s * (off + 0.0125), 0, 0), parent=root)
    return root


# ---------------- cable column family (13 Nov 2026, exercise pictures) ----------------
# A cable column = an upright post with a pulley that can sit at any height. The athlete holds an attachment
# (D-handle, short straight bar, rope or ankle cuff) and a steel cable runs from the attachment to the pulley.
# animate.Clip.place_cables puts the attachment on the fists (or the ankle) every frame and stretches the cable,
# so the handle can never miss the hand and the cable always ends at the pulley.

def cable_column(name="FA_Cable", pulley_h=1.9, height=2.15, face=(0.0, -1.0), grab=None):
    """Origin = floor point under the post's centre. `face` (world x, y) = the way the pulley faces (toward the
    athlete). grab = [z0, z1, side] adds an upright hand grip on the post (side +1 = the post's local +X side), for a
    free hand to hold (hip abduction / adduction). Returns dict(root, pulley_local, grab_local) with world offsets
    from the root (before root.location)."""
    M = _mats()
    root = _empty(name)
    fx, fy = face
    n = math.hypot(fx, fy) or 1.0
    fx, fy = fx / n, fy / n
    # local -Y = the face direction, so rot_z turns -Y onto (fx, fy)
    rz = math.atan2(fx, -fy)
    root.rotation_euler = (0, 0, rz)
    _box(name + "_Base", (0.46, 0.34, 0.04), loc=(0, 0.07, 0.02), mat=M["frame"], bevel=0.008, parent=root)
    _box(name + "_Post", (0.11, 0.11, height), loc=(0, 0, height / 2), mat=M["pad"], bevel=0.01, parent=root)
    _box(name + "_Cap", (0.16, 0.16, 0.04), loc=(0, 0, height + 0.02), mat=M["frame"], bevel=0.006, parent=root)
    # adjustable carriage on the front of the post, with the pulley wheel sticking out toward the athlete
    _box(name + "_Carriage", (0.15, 0.06, 0.20), loc=(0, -0.08, pulley_h), mat=M["frame"], bevel=0.008, parent=root)
    _cyl(name + "_Pin", 0.012, 0.11, axis="X", mat=M["chrome"], loc=(0, -0.155, pulley_h), parent=root)
    _box(name + "_ForkL", (0.012, 0.09, 0.10), loc=(0.035, -0.14, pulley_h), mat=M["frame"], bevel=0.003, parent=root)
    _box(name + "_ForkR", (0.012, 0.09, 0.10), loc=(-0.035, -0.14, pulley_h), mat=M["frame"], bevel=0.003, parent=root)
    _cyl(name + "_Wheel", 0.045, 0.025, axis="X", mat=M["iron"], bevel=0.004, loc=(0, -0.155, pulley_h), parent=root)
    c, s = math.cos(rz), math.sin(rz)
    lx, ly = 0.0, -0.155
    pulley = Vector((lx * c - ly * s, lx * s + ly * c, pulley_h))   # world offset from the root (before root.location)
    out = {"root": root, "pulley_local": pulley}
    if grab:
        z0, z1, sd = grab
        gx = sd * 0.135
        _cyl(name + "_Grab", 0.016, z1 - z0, verts=24, axis="Z", mat=M["rubber"], loc=(gx, -0.02, (z0 + z1) / 2), parent=root)
        for z in (z0 - 0.01, z1 + 0.01):
            _seg(name + f"_GrabArm{z:.2f}", (sd * 0.055, -0.02, z), (gx, -0.02, z), 0.012, M["chrome"], parent=root)
        out["grab_local"] = Vector((gx * c + 0.02 * s, gx * s - 0.02 * c, (z0 + z1) / 2))
    return out


def _seg(name, a, b, r, mat, parent=None, verts=16):
    """A thin cylinder from point a to point b (in the parent's space)."""
    a = Vector(a); b = Vector(b); d = b - a
    ob = _cyl(name, r, max(d.length, 1e-4), verts=verts, axis="Z", mat=mat, parent=parent)
    ob.matrix_basis = Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    return ob


def cable_line(name="FA_CableLine", r=0.0075):
    """Steel cable: unit-length cylinder from z=0 to z=1 (stretched every frame by place_cables). Light grey so it
    reads on the dark app card; thicker than real (16 mm) so it still shows at phone size."""
    M = _mats()
    root = _empty(name)
    ob = _cyl(name + "_Wire", r, 1.0, verts=12, axis="Z", mat=M["chrome"], loc=(0, 0, 0.5), parent=root)
    return root


def d_handle(name="FA_DHandle"):
    """Single D-handle. Origin = grip centre, grip along local X; the D's tip (where the cable clips on) is at
    local +Y, D_TIP away. The opening is 0.15 m wide so the fist fits inside."""
    M = _mats()
    root = _empty(name)
    _cyl(name + "_Grip", 0.017, 0.125, verts=32, mat=M["rubber"], parent=root)
    w = 0.078
    for s in (1, -1):
        _seg(name + f"_Side{s}a", (s * w, 0, 0), (s * w, 0.045, 0), 0.0065, M["chrome"], parent=root)
        _seg(name + f"_Side{s}b", (s * w, 0.045, 0), (0, D_TIP - 0.012, 0), 0.0065, M["chrome"], parent=root)
        _cyl(name + f"_End{s}", 0.011, 0.02, mat=M["chrome"], loc=(s * (w - 0.004), 0, 0), parent=root)
    _cyl(name + "_Ring", 0.014, 0.012, axis="Z", mat=M["chrome"], loc=(0, D_TIP, 0), parent=root)
    return root


D_TIP = 0.14


def cable_bar(name="FA_CableBar", length=0.60):
    """Short straight cable bar with a swivel in the middle. Origin = bar centre, bar along local X; the swivel
    eye (where the cable clips on) is at local +Y, BAR_EYE away."""
    M = _mats()
    root = _empty(name)
    _cyl(name + "_Bar", 0.0145, length, verts=32, mat=M["chrome"], parent=root)
    for s in (1, -1):
        _cyl(name + f"_Cap{s}", 0.019, 0.025, mat=M["rubber"], bevel=0.003, loc=(s * (length / 2 + 0.01), 0, 0), parent=root)
    _box(name + "_Swivel", (0.04, 0.05, 0.03), loc=(0, 0.035, 0), mat=M["chrome"], bevel=0.008, parent=root)
    _cyl(name + "_Eye", 0.012, 0.012, axis="Z", mat=M["chrome"], loc=(0, BAR_EYE, 0), parent=root)
    return root


BAR_EYE = 0.075


def rope_parts(name="FA_Rope"):
    """Triceps rope: two strands, each with a stopper knob, joined at a metal eye. Built as unit pieces that
    place_cables moves every frame (strand = unit cylinder z 0..1, knob, eye). Returns the root empty."""
    M = _mats()
    root = _empty(name)
    for s in ("L", "R"):
        for part in ("", "2"):   # "": the piece inside the fist, "2": from the fist to the join
            st = _empty(name + f"_Strand{s}{part}", parent=root)
            _cyl(name + f"_Strand{s}{part}_Mesh", 0.0135, 1.0, verts=16, axis="Z", mat=M["rubber"], loc=(0, 0, 0.5), parent=st)
        kn = _empty(name + f"_Knob{s}", parent=root)
        _cyl(name + f"_Knob{s}_Mesh", 0.024, 0.045, verts=24, axis="Z", mat=M["rubber"], bevel=0.008, parent=kn)
    ey = _empty(name + "_Eye", parent=root)
    _cyl(name + "_Eye_Mesh", 0.02, 0.05, verts=24, axis="Z", mat=M["chrome"], bevel=0.006, parent=ey)
    return root


def ankle_cuff(name="FA_Cuff"):
    """Ankle cuff: a padded band (axis local Z = along the shin) with a D-ring at local +Y, CUFF_RING away."""
    M = _mats()
    root = _empty(name)
    me = bpy.data.meshes.new(name + "_Band")
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=40, radius1=0.052, radius2=0.049, depth=0.065)
    bm.to_mesh(me); bm.free()
    band = bpy.data.objects.new(name + "_Band", me)
    sol = band.modifiers.new("Solid", "SOLIDIFY"); sol.thickness = 0.012; sol.offset = 1.0
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(M["pad"])
    _link(band, root)
    _seg(name + "_RingA", (-0.02, 0.062, 0), (0, CUFF_RING, 0), 0.005, M["chrome"], parent=root)
    _seg(name + "_RingB", (0.02, 0.062, 0), (0, CUFF_RING, 0), 0.005, M["chrome"], parent=root)
    return root


CUFF_RING = 0.09
