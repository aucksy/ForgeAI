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
        b = ob.modifiers.new("Bevel", "BEVEL"); b.width = bevel; b.segments = 1 if look.DRAWN else 3; b.limit_method = "ANGLE"
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
        # drawn look: one chamfer step, so every edge is a crease and gets an outline like the main set's machines
        b = ob.modifiers.new("Bevel", "BEVEL"); b.width = bevel; b.segments = 1 if look.DRAWN else segs; b.limit_method = "NONE"
        ob.modifiers.new("WN", "WEIGHTED_NORMAL").keep_sharp = False
    if mat:
        me.materials.append(mat)
    return _link(ob, parent)


def _feet(name, w, d, cy, M, parent):
    """Drawn look (R-490, look test r2): an open rectangle of floor rails instead of a solid floor plate (the main set's
    machines stand on tube feet; a flat plate seen from above reads as a different artist)."""
    t, h = 0.06, 0.05
    for s in (1, -1):
        _box(name + f"_Rail{s}", (t, d, h), loc=(s * (w - t) / 2, cy, h / 2), mat=M["frame"], bevel=0.008, parent=parent)
        _box(name + f"_Cross{s}", (w, t, h), loc=(0, cy + s * (d - t) / 2, h / 2), mat=M["frame"], bevel=0.008, parent=parent)


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


def incline_bench(incline_deg=35.0, name="FA_Bench", style="bench", seat_h=0.44, back_len=0.82, seat_len=0.34):
    """Adjustable bench. Origin on the floor under the seat/back hinge. Returns dict(root, seat_top, back_axis).
    style "machine" (13 Nov 2026): the same seat and back pad on a centre post and a base plate (a machine seat),
    without the bench's long floor rail; back_len 0 = a seat with no back pad."""
    M = _mats()
    root = _empty(name)
    pad_t = 0.075
    # seat: in front of the hinge (toward -Y), slightly tilted up at the front
    seat = _box(name + "_Seat", (0.30, seat_len, pad_t), loc=(0, -seat_len / 2 - 0.01, seat_h - pad_t / 2), mat=M["pad"], bevel=0.022, parent=root)
    # back pad: hinged at (y=0, z=seat_h), rising toward +Y
    a = math.radians(incline_deg)
    hinge = Vector((0, 0.01, seat_h - pad_t / 2))
    rot = Matrix.Rotation(a, 4, "X")
    if style == "machine":
        if look.DRAWN:
            _feet(name + "_Base", 0.46, 0.62, -0.05, M, root)
        else:
            _box(name + "_Base", (0.46, 0.62, 0.04), loc=(0, -0.05, 0.02), mat=M["frame"], bevel=0.006, parent=root)
        _box(name + "_Post", (0.08, 0.08, seat_h - 0.1), loc=(0, -seat_len / 2, 0.04 + (seat_h - 0.1) / 2), mat=M["frame"], bevel=0.006, parent=root)
        _box(name + "_SeatPlate", (0.18, seat_len * 0.8, 0.02), loc=(0, -seat_len / 2, seat_h - pad_t - 0.012), mat=M["frame"], bevel=0.004, parent=root)
        if back_len > 0:
            back = _box(name + "_Back", (0.29, back_len, pad_t), loc=(0, 0, 0), mat=M["pad"], bevel=0.022, parent=root)
            back.matrix_basis = Matrix.Translation(hinge) @ rot @ Matrix.Translation((0, back_len / 2 + 0.02, 0))
            _box(name + "_BackPlate", (0.16, back_len * 0.8, 0.02), mat=M["frame"], bevel=0.004, parent=back, loc=(0, 0, -pad_t / 2 - 0.012))
            top = hinge + rot @ Vector((0, back_len * 0.7, -pad_t / 2 - 0.03))
            base = Vector((0, max(0.12, top.y), 0.04))
            d = top - base
            sp = _box(name + "_BackPost", (0.07, d.length, 0.07), mat=M["frame"], bevel=0.006, parent=root)
            sp.matrix_basis = Matrix.Translation((base + top) / 2) @ d.to_track_quat("Y", "Z").to_matrix().to_4x4()
            _box(name + "_BackFoot", (0.40, 0.08, 0.04), loc=(0, base.y, 0.02), mat=M["frame"], bevel=0.006, parent=root)
        return {"root": root, "seat_h": seat_h, "hinge": hinge, "incline": a, "back_len": back_len, "pad_t": pad_t}
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
    athlete). grab = [z0, z1] adds an upright hand grip on the post's front face, for a
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
    if not look.DRAWN:   # the drawn tower stands on its own rails (below)
        _box(name + "_Base", (0.46, 0.34, 0.04), loc=(0, 0.07, 0.02), mat=M["frame"], bevel=0.008, parent=root)
    _box(name + "_Post", (0.11, 0.11, height), loc=(0, 0, height / 2), mat=M["pad"], bevel=0.01, parent=root)
    _box(name + "_Cap", (0.16, 0.16, 0.04), loc=(0, 0, height + 0.02), mat=M["frame"], bevel=0.006, parent=root)
    # adjustable carriage on the front of the post, with the pulley wheel sticking out toward the athlete
    _box(name + "_Carriage", (0.15, 0.06, 0.20), loc=(0, -0.08, pulley_h), mat=M["frame"], bevel=0.008, parent=root)
    _cyl(name + "_Pin", 0.012, 0.11, axis="X", mat=M["chrome"], loc=(0, -0.155, pulley_h), parent=root)
    _box(name + "_ForkL", (0.012, 0.09, 0.10), loc=(0.035, -0.14, pulley_h), mat=M["frame"], bevel=0.003, parent=root)
    _box(name + "_ForkR", (0.012, 0.09, 0.10), loc=(-0.035, -0.14, pulley_h), mat=M["frame"], bevel=0.003, parent=root)
    _cyl(name + "_Wheel", 0.045, 0.025, axis="X", mat=M["iron"], bevel=0.004, loc=(0, -0.155, pulley_h), parent=root)
    if look.DRAWN:
        # R-490: the main set's cable machines are a full tower: a weight stack in its frame behind the post, a top
        # beam with pulleys and the cable down to the stack. Behind the post (local +Y, away from the athlete), so
        # the pulley, handle and cable the recipes place are unchanged.
        st = weight_stack(name + "_Stack", h=height - 0.12, plates=14)
        st.parent = root; st.location = (0, 0.30, 0)
        _box(name + "_Beam", (0.10, 0.42, 0.07), loc=(0, 0.20, height - 0.04), mat=M["frame"], bevel=0.006, parent=root)
        _feet(name + "_Foot", 0.60, 0.80, 0.22, M, root)
        for yy in (0.0, 0.30):
            _cyl(name + f"_TopWheel{yy}", 0.05, 0.03, axis="X", mat=M["iron"], bevel=0.004, loc=(0, yy, height - 0.13), parent=root)
        _seg(name + "_StackCable", (0, 0.30, height - 0.18), (0, 0.30, 0.09 + 14 * 0.038 + 0.05), 0.004, M["chrome"], parent=root)
    c, s = math.cos(rz), math.sin(rz)
    lx, ly = 0.0, -0.155
    pulley = Vector((lx * c - ly * s, lx * s + ly * c, pulley_h))   # world offset from the root (before root.location)
    out = {"root": root, "pulley_local": pulley}
    if grab:
        # upright grip on the post's FRONT face (the athlete's side), so a support hand never reaches round the post
        z0, z1 = grab[0], grab[1]
        gy = -0.115
        _cyl(name + "_Grab", 0.016, z1 - z0, verts=24, axis="Z", mat=M["rubber"], loc=(0, gy, (z0 + z1) / 2), parent=root)
        for z in (z0 - 0.01, z1 + 0.01):
            _seg(name + f"_GrabArm{z:.2f}", (0, -0.05, z), (0, gy, z), 0.011, M["chrome"], parent=root)
        out["grab_local"] = Vector((-gy * s, gy * c, (z0 + z1) / 2))
    return out


def _seg(name, a, b, r, mat, parent=None, verts=16):
    """A thin cylinder from point a to point b (in the parent's space)."""
    a = Vector(a); b = Vector(b); d = b - a
    ob = _cyl(name, r, max(d.length, 1e-4), verts=verts, axis="Z", mat=mat, parent=parent)
    ob.matrix_basis = Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    return ob


def _rod(name, a, b, r, mat, parent, verts=32):
    """Cylinder from point a to point b (local coordinates of the parent)."""
    a = Vector(a); b = Vector(b); d = b - a
    ob = _cyl(name, r, d.length, verts=verts, axis="Z", mat=mat, parent=parent)
    ob.matrix_basis = Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    return ob


def cable_line(name="FA_CableLine", r=0.0075):
    """Steel cable: unit-length cylinder from z=0 to z=1 (stretched every frame by place_cables). Light grey so it
    reads on the dark app card; thicker than real (16 mm) so it still shows at phone size."""
    M = _mats()
    root = _empty(name)
    if look.DRAWN:
        r = r * 0.6   # the main set draws the cable as a thin line
    ob = _cyl(name + "_Wire", r, 1.0, verts=12, axis="Z", mat=M["rubber"] if look.DRAWN else M["chrome"], loc=(0, 0, 0.5), parent=root)   # drawn: a dark line
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
def _ball(name, r, loc, mat, parent):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=r)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me); me.materials.append(mat)
    return _link(ob, parent)


def _plates(name, root, M, x0, sgn, plates, plate_t):
    """Plates + clip on a sleeve along local X, starting x0 out from the centre and stacking outward (sgn +1 / -1)."""
    off = x0
    for i, r in enumerate(plates):
        _cyl(name + f"_Plate{i}", r, plate_t, verts=72, mat=M["iron"], bevel=0.008, loc=(sgn * (off + plate_t / 2), 0, 0), parent=root)
        _cyl(name + f"_Hub{i}", 0.045, plate_t + 0.006, mat=M["chrome"], bevel=0.002, loc=(sgn * (off + plate_t / 2), 0, 0), parent=root)
        off += plate_t + 0.003
    _cyl(name + "_Clip", 0.034, 0.025, mat=M["chrome"], bevel=0.003, loc=(sgn * (off + 0.0125), 0, 0), parent=root)


# EZ (cambered) curl bar, half profile (x, y) from the centre outward: a straight middle, an inner grip that angles
# forward, a short kink back, an outer grip that angles forward again, a short kink back, then straight to the collar.
EZ_C = 0.03
EZ_HALF = [(0.0, 0.0), (0.09, 0.0), (0.15, EZ_C), (0.18, 0.0), (0.24, EZ_C), (0.27, 0.0), (0.40, 0.0)]
EZ_GRIPS = {"close": 0.12, "wide": 0.21}   # x of the grip-segment centres (hands at +-x)
EZ_GRIP_DEG = math.degrees(math.atan2(EZ_C, 0.06))   # each grip segment's angle off the bar line (26.6 deg)


def ez_bar(name="FA_EZBar", plates=(0.2,), plate_t=0.035, sleeve=0.2):
    """EZ curl bar (13 Nov 2026, our own geometry). Origin = halfway between the two grip-segment centres, bar line
    along local X, the camber in the local X-Y plane (+Y = the way the grips angle out). Hands hold the angled grip
    segments (EZ_GRIPS: close +-0.12, wide +-0.21); each segment is 26.6 deg off the bar line, so the palms turn in a
    little (semi-supinated) on a curl. animate.place_bars puts the grips through both fists."""
    M = _mats()
    root = _empty(name)
    dy = -EZ_C / 2   # grip-segment centres sit on y = 0
    for sgn in (1, -1):
        pts = [Vector((sgn * x, y + dy, 0)) for x, y in EZ_HALF]
        for i in range(len(pts) - 1):
            _rod(name + f"_Seg{sgn}{i}", pts[i], pts[i + 1], 0.0145, M["chrome"], root)
            if i > 0:
                _ball(name + f"_Bend{sgn}{i}", 0.0145, pts[i], M["chrome"], root)
        x = EZ_HALF[-1][0]
        _cyl(name + f"_Collar{sgn}", 0.036, 0.025, mat=M["chrome"], bevel=0.003, loc=(sgn * (x + 0.0125), dy, 0), parent=root)
        _cyl(name + f"_Sleeve{sgn}", 0.025, sleeve, verts=32, mat=M["chrome"], bevel=0.002, loc=(sgn * (x + 0.025 + sleeve / 2), dy, 0), parent=root)
        sub = _empty(name + f"_PlateSet{sgn}", root, loc=(0, dy, 0))
        _plates(name + f"_P{sgn}", sub, M, x + 0.03, sgn, plates, plate_t)
    return root


def trap_bar(name="FA_TrapBar", handle_gap=0.63, plates=(0.225,), plate_t=0.045):
    """Trap (hex) bar (13 Nov 2026, our own geometry). Origin = halfway between the two handle centres; the handles
    run along local Y (front-back, neutral grip) at x = +-handle_gap/2; a hexagon frame around the lifter (points at
    left and right, where the sleeves come out); plates on the sleeves, centred on the handle height (low handles).
    animate.place_bars puts the handles through both fists."""
    M = _mats()
    root = _empty(name)
    Rh = 0.56   # hexagon "radius" (centre to the left/right points)
    hexp = [Vector((Rh * math.cos(math.radians(a)), Rh * math.sin(math.radians(a)), 0)) for a in range(0, 360, 60)]
    for i in range(6):
        _rod(name + f"_Hex{i}", hexp[i], hexp[(i + 1) % 6], 0.016, M["frame"], root)
        _ball(name + f"_HexBall{i}", 0.016, hexp[i], M["frame"], root)
    hx = handle_gap / 2; hy = 0.125
    for sgn in (1, -1):
        _rod(name + f"_Handle{sgn}", (sgn * hx, -hy, 0), (sgn * hx, hy, 0), 0.0165, M["chrome"], root)
        for k, yy in enumerate((-hy, hy)):
            # connector from the handle end out to the slanted side of the hexagon
            t = abs(yy) / (Rh * math.sin(math.radians(60)))
            xe = Rh - (Rh - Rh * math.cos(math.radians(60))) * t
            _rod(name + f"_Conn{sgn}{k}", (sgn * hx, yy, 0), (sgn * xe, yy, 0), 0.014, M["frame"], root)
        _cyl(name + f"_Collar{sgn}", 0.040, 0.030, mat=M["chrome"], bevel=0.003, loc=(sgn * (Rh + 0.015), 0, 0), parent=root)
        _cyl(name + f"_Sleeve{sgn}", 0.025, 0.26, verts=32, mat=M["chrome"], bevel=0.002, loc=(sgn * (Rh + 0.03 + 0.13), 0, 0), parent=root)
        sub = _empty(name + f"_PlateSet{sgn}", root)
        _plates(name + f"_P{sgn}", sub, M, Rh + 0.035, sgn, plates, plate_t)
    return root


def landmine_bar(name="FA_Landmine", grip_from_tip=0.10, plates=(0.225,), plate_t=0.045):
    """Olympic bar for a landmine (13 Nov 2026). Origin = the grip point, `grip_from_tip` m in from the free end of the
    loaded sleeve; the bar runs along local -X toward the pivot (the free end is at +X). Plates on the free sleeve
    against its collar. Returns (root, length from the grip to the far end that sits in the landmine tube)."""
    M = _mats()
    root = _empty(name)
    t = grip_from_tip
    sl = 0.42; col = 0.03; shaft = 1.31
    x_col = t - sl                     # inner end of the free sleeve
    _cyl(name + "_SleeveA", 0.025, sl, verts=32, mat=M["chrome"], bevel=0.002, loc=(t - sl / 2, 0, 0), parent=root)
    _cyl(name + "_CollarA", 0.040, col, mat=M["chrome"], bevel=0.003, loc=(x_col - col / 2, 0, 0), parent=root)
    x_sh = x_col - col
    _cyl(name + "_Shaft", 0.014, shaft, verts=32, mat=M["chrome"], loc=(x_sh - shaft / 2, 0, 0), parent=root)
    x_col2 = x_sh - shaft
    _cyl(name + "_CollarB", 0.040, col, mat=M["chrome"], bevel=0.003, loc=(x_col2 - col / 2, 0, 0), parent=root)
    x_end = x_col2 - col - sl
    _cyl(name + "_SleeveB", 0.025, sl, verts=32, mat=M["chrome"], bevel=0.002, loc=(x_end + sl / 2, 0, 0), parent=root)
    off = x_col + 0.003   # plates on the free sleeve, stacked from its collar toward the tip (local +X)
    for i, r in enumerate(plates):
        _cyl(name + f"_Plate{i}", r, plate_t, verts=72, mat=M["iron"], bevel=0.008, loc=(off + plate_t / 2, 0, 0), parent=root)
        _cyl(name + f"_Hub{i}", 0.045, plate_t + 0.006, mat=M["chrome"], bevel=0.002, loc=(off + plate_t / 2, 0, 0), parent=root)
        off += plate_t + 0.003
    _cyl(name + "_Clip", 0.034, 0.025, mat=M["chrome"], bevel=0.003, loc=(off + 0.0125, 0, 0), parent=root)
    return root, t - x_end


def landmine_base(name="FA_LandmineBase"):
    """Landmine pivot (13 Nov 2026): a floor plate with a hinge block (stays put) and a short tube the bar end sits in
    (turns each frame to point along the bar). Origin of both = the hinge. Returns (tube_root, base_root)."""
    M = _mats()
    base = _empty(name + "_Base")
    _box(name + "_Plate", (0.34, 0.34, 0.02), loc=(0, 0, -0.035), mat=M["frame"], bevel=0.004, parent=base)
    _cyl(name + "_Hinge", 0.03, 0.12, axis="Y", mat=M["frame"], bevel=0.004, loc=(0, 0, 0), parent=base)
    tube = _empty(name + "_TubeRoot")
    _cyl(name + "_Tube", 0.036, 0.30, mat=M["frame"], bevel=0.004, loc=(0.15, 0, 0), parent=tube)
    return tube, base


def preacher_bench(name="FA_Preacher", seat_h=0.60, pad_top=(-0.24, 1.03), pad_deg=45.0, pad_len=0.40, pad_w=0.56):
    """Preacher curl bench (13 Nov 2026, our own geometry). Origin = floor under the seat centre; the athlete sits
    facing -Y (as in the rest pose) with the arm pad in front: its top edge at (y, z) = pad_top (about armpit height),
    the pad sloping down and away at pad_deg from the floor. The upper arms lie on its face, which points up and away
    from the athlete. Returns dict(root, face point at the top edge, face normal, down-the-pad direction, sizes)."""
    M = _mats()
    root = _empty(name)
    pt = 0.07
    _box(name + "_Seat", (0.34, 0.30, pt), loc=(0, 0.02, seat_h - pt / 2), mat=M["pad"], bevel=0.022, parent=root)
    a = math.radians(pad_deg)
    d = Vector((0, -math.cos(a), -math.sin(a)))   # down the pad, away from the athlete
    n = Vector((0, -math.sin(a), math.cos(a)))    # the face: up and away from the athlete
    top = Vector((0, pad_top[0], pad_top[1]))
    centre = top + d * (pad_len / 2) - n * (pt / 2)
    pad = _box(name + "_Pad", (pad_w, pad_len, pt), mat=M["pad"], bevel=0.025, parent=root)
    y_ax = -d; z_ax = n; x_ax = y_ax.cross(z_ax)
    Mx = Matrix((x_ax, y_ax, z_ax)).transposed().to_4x4(); Mx.translation = centre
    pad.matrix_basis = Mx
    _box(name + "_Base", (0.08, 0.95, 0.05), loc=(0, -0.22, 0.025), mat=M["frame"], bevel=0.006, parent=root)
    _box(name + "_BaseX", (0.55, 0.06, 0.05), loc=(0, 0.20, 0.025), mat=M["frame"], bevel=0.006, parent=root)
    _box(name + "_BaseX2", (0.55, 0.06, 0.05), loc=(0, -0.66, 0.025), mat=M["frame"], bevel=0.006, parent=root)
    _box(name + "_SeatPost", (0.06, 0.06, seat_h - pt - 0.05), loc=(0, 0.02, 0.05 + (seat_h - pt - 0.05) / 2), mat=M["frame"], bevel=0.005, parent=root)
    back = centre - n * (pt / 2 + 0.01)
    _rod(name + "_PadPost", (0, back.y + 0.04, 0.05), back, 0.03, M["frame"], root)
    return {"root": root, "top": top, "normal": n, "down": d, "pad_len": pad_len, "pad_w": pad_w, "seat_h": seat_h, "pad_t": pt}


# ---------------- machines (13 Nov 2026, exercise pictures) ----------------
# A machine is built from plain parts (our own geometry): a seat and back pad (incline_bench(style="machine")), handles
# that follow the hands, levers/rods between two points, pads that follow a bone, and a weight stack. Where each part
# goes is written in the recipe ("machine" in animate.py), mostly relative to where the body really is.

def handle(name="FA_Handle", length=0.13, r=0.016):
    """Machine handle: chrome bar with a rubber grip. Origin = grip centre, bar along local X (like a dumbbell handle)."""
    M = _mats()
    root = _empty(name)
    _cyl(name + "_Bar", r, length + 0.06, verts=32, mat=M["chrome"], parent=root)
    _cyl(name + "_Grip", r + 0.005, length, verts=32, mat=M["rubber"], bevel=0.003, parent=root)
    for s in (1, -1):
        _cyl(name + f"_Cap{s}", r + 0.009, 0.012, mat=M["frame"], bevel=0.003, loc=(s * (length / 2 + 0.03), 0, 0), parent=root)
    return root


def part(name, shape, size, mat="frame", bevel=None, parent=None):
    """One plain part centred on its origin. box: size (x, y, z). cyl: size (radius, length) along local Y.
    rod: a cylinder of radius size[0] and length 1 along local Y (stretched between two points by scale)."""
    M = _mats()
    m = M.get(mat, M["frame"])
    if shape == "box":
        return _box(name, tuple(size), mat=m, bevel=0.01 if bevel is None else bevel, parent=parent)
    if shape == "cyl":
        return _cyl(name, size[0], size[1], axis="Y", mat=m, bevel=0.004 if bevel is None else bevel, parent=parent)
    if shape == "rod":
        return _cyl(name, size[0], 1.0, verts=24, axis="Y", mat=m, parent=parent)
    raise ValueError("unknown part shape " + shape)


def weight_stack(name="FA_Stack", h=1.55, plates=12):
    """Selectorised weight stack in its frame. Origin = floor point under its centre; plates face +-Y."""
    M = _mats()
    root = _empty(name)
    w, d = 0.36, 0.20
    _box(name + "_Base", (w + 0.16, d + 0.16, 0.05), loc=(0, 0, 0.025), mat=M["frame"], bevel=0.006, parent=root)
    for s in (1, -1):
        _box(name + f"_Post{s}", (0.06, 0.06, h), loc=(s * (w / 2 + 0.05), 0, h / 2), mat=M["frame"], bevel=0.006, parent=root)
        _cyl(name + f"_Guide{s}", 0.011, h - 0.12, axis="Z", mat=M["chrome"], loc=(s * 0.11, 0, h / 2), parent=root)
    _box(name + "_Top", (w + 0.16, 0.08, 0.06), loc=(0, 0, h + 0.03), mat=M["frame"], bevel=0.006, parent=root)
    for i in range(plates):
        _box(name + f"_Plate{i}", (w - 0.04, d - 0.06, 0.034), loc=(0, 0, 0.09 + i * 0.038), mat=M["iron"], bevel=0.004, parent=root)
    _box(name + "_TopPlate", (w - 0.08, d - 0.08, 0.05), loc=(0, 0, 0.09 + plates * 0.038 + 0.02), mat=M["chrome"], bevel=0.004, parent=root)
    _cyl(name + "_Pin", 0.008, d + 0.04, axis="Y", mat=M["chrome"], loc=(0, 0, 0.09 + 5 * 0.038), parent=root)
    return root
