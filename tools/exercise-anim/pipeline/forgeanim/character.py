"""Build the ForgeAI demo athlete from CC0 MakeHuman (MPFB) parts.

build_character() -> dict(body=, rig=, shorts=, hair=, eyes=, brows=)
"""
import math
import os
import bpy, bmesh
from mathutils import Vector
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
from . import MH
from . import look
from . import muscles

# drawn look (R-490, look test r1): the main set's man is broader and heavier, with a bigger head (about 7 heads tall,
# not the "ideal" 8)
_D = look.DRAWN
MACROS = {"gender": 1.0, "age": 0.42, "muscle": 1.0, "weight": float(os.environ.get("FA_WEIGHT", 0.55 if _D else 0.40)),
          "proportions": float(os.environ.get("FA_PROPORTIONS", 0.5 if _D else 1.0)),
          "height": float(os.environ.get("FA_HEIGHT", 0.66)),   # same stature: every recipe is tuned to it
          "race": {"asian": 0.25, "caucasian": 0.5, "african": 0.25}}

# extra MPFB targets (all CC0) that push the body toward a defined athletic build
TARGETS = {
    "torso/torso-muscle-pectoral-incr": 0.7 if _D else 0.55,
    "torso/torso-muscle-dorsi-incr": 0.6,
    "torso/torso-vshape-incr": float(os.environ.get("FA_VSHAPE", 0.85)),
    "torso/measure-waist-circ-decr": float(os.environ.get("FA_WAIST", 0.45)),
    "stomach/stomach-tone-incr": 0.0,
    "arms/l-upperarm-muscle-incr": 0.85 if _D else 0.55, "arms/r-upperarm-muscle-incr": 0.85 if _D else 0.55,
    "arms/l-upperarm-shoulder-muscle-incr": 0.95 if _D else 0.65, "arms/r-upperarm-shoulder-muscle-incr": 0.95 if _D else 0.65,
    "arms/l-lowerarm-muscle-incr": 0.45, "arms/r-lowerarm-muscle-incr": 0.45,
    "arms/l-upperarm-fat-decr": 0.5, "arms/r-upperarm-fat-decr": 0.5,
    "legs/l-upperleg-muscle-incr": 0.55, "legs/r-upperleg-muscle-incr": 0.55,
    "legs/l-lowerleg-muscle-incr": 0.5, "legs/r-lowerleg-muscle-incr": 0.5,
    "legs/l-upperleg-fat-decr": 0.4, "legs/r-upperleg-fat-decr": 0.4,
    "neck/measure-neck-circ-incr": 0.35,
}

ARM_BONES = ("clavicle", "shoulder01", "upperarm", "lowerarm", "wrist", "finger", "metacarpal")


def _load_targets(body):
    tdir = LocationService.get_mpfb_data("targets")
    for rel, w in TARGETS.items():
        if w <= 0:
            continue
        path = os.path.join(tdir, rel + ".target.gz")
        if os.path.isfile(path):
            TargetService.load_target(body, path, weight=w)
        else:
            print("[forgeanim] missing target", rel)


def _dominant_bone(v, groups, bone_names):
    best, bw = None, 0.0
    for g in v.groups:
        if groups[g.group].name in bone_names and g.weight > bw:
            best, bw = groups[g.group].name, g.weight
    return best


def _write_point_attr(mesh, name, values):
    a = mesh.attributes.get(name) or mesh.attributes.new(name, "FLOAT", "POINT")
    a.data.foreach_set("value", values)


def rest_positions(body, with_normals=False):
    """World positions (and normals) of every base-mesh vertex with shape keys applied, no modifiers."""
    states = [(m, m.show_viewport) for m in body.modifiers]
    for m, _ in states:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); emesh = ev.to_mesh()
    pos = [body.matrix_world @ v.co for v in emesh.vertices]
    nrm = [(body.matrix_world.to_3x3() @ v.normal).normalized() for v in emesh.vertices]
    ev.to_mesh_clear()
    for m, s in states:
        m.show_viewport = s
    assert len(pos) == len(body.data.vertices)
    return (pos, nrm) if with_normals else pos


def _cut(bm, co, no, only=None):
    """Bisect bm with a plane and delete the half the normal points to (limited to verts passing `only`)."""
    co = Vector(co); no = Vector(no)
    geom = [e for e in bm.edges] + [f for f in bm.faces] + [v for v in bm.verts]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=False, clear_inner=False)
    kill = [v for v in bm.verts if (v.co - co).dot(no) > 1e-5 and (only is None or only(v.co))]
    bmesh.ops.delete(bm, geom=kill, context="VERTS")


def _make_shorts(body, rig):
    """Tight training shorts: a shell grown from the body's own pelvis faces (follows the rig for free)."""
    me = body.data
    groups = body.vertex_groups
    hip = rig.matrix_world @ rig.data.bones["upperleg01.L"].head_local
    hem_z = hip.z - float(os.environ.get("FA_HEM", 0.25 if look.DRAWN else 0.17))   # drawn: just above the knee
    waist_z = hip.z + 0.115
    # evaluated rest shape (with targets) for positions
    pos = rest_positions(body)
    body_vg = groups.get("body")
    bone_names = {b.name for b in rig.data.bones}
    inside = []
    for v in me.vertices:
        p = pos[v.index]
        dom = _dominant_bone(v, groups, bone_names) or ""
        in_body = body_vg is None or any(g.group == body_vg.index and g.weight > 0.5 for g in v.groups)
        is_arm = any(dom.startswith(a) for a in ARM_BONES)
        # hem rises slightly toward the outside of the thigh, like real training shorts
        inside.append(in_body and not is_arm and (hem_z - 0.04) < p.z < (waist_z + 0.04))
    faces = [f.index for f in me.polygons if any(inside[i] for i in f.vertices)]

    shorts = body.copy(); shorts.data = me.copy(); shorts.name = "FA_Shorts"; shorts.data.name = "FA_Shorts"
    bpy.context.scene.collection.objects.link(shorts)
    for m in list(shorts.modifiers):
        if m.type != "ARMATURE":
            shorts.modifiers.remove(m)
    # bake the muscled shape into the shell, then drop its shape keys
    inv = shorts.matrix_world.inverted()
    for v in shorts.data.vertices:
        v.co = inv @ pos[v.index]
    shorts.shape_key_clear()
    bm = bmesh.new(); bm.from_mesh(shorts.data)
    keep = set(faces)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    _cut(bm, (0, 0, waist_z), (0, 0, 1))                       # waistband: flat line
    for side in (1, -1):                                         # leg hems, rising to the outside
        n = Vector((side * 0.13, 0, -1)).normalized()
        _cut(bm, (side * 0.11, 0, hem_z + 0.012), n, only=lambda c, s=side: c.x * s > 0.01)
    bm.to_mesh(shorts.data); bm.free()
    shorts.data.materials.clear(); shorts.data.materials.append(look.shorts_material())
    disp = shorts.modifiers.new("Gap", "DISPLACE"); disp.strength = float(os.environ.get("FA_SHORTS_GAP", 0.003)); disp.mid_level = 0.0
    if look.DRAWN:   # loose, boxy legs like the main set's shorts: the shell stands further off the thigh toward the hem
        fl = shorts.vertex_groups.new(name="fa_flare")
        for v in shorts.data.vertices:
            zz = (shorts.matrix_world @ v.co).z
            w = min(1.0, max(0.0, (hip.z + 0.02 - zz) / max(1e-3, hip.z + 0.02 - hem_z)))
            if w > 0:
                fl.add([v.index], w ** 0.8, "REPLACE")
        fd = shorts.modifiers.new("Flare", "DISPLACE"); fd.strength = float(os.environ.get("FA_SHORTS_FLARE", 0.016))
        fd.mid_level = 0.0; fd.vertex_group = "fa_flare"
    sol = shorts.modifiers.new("Thick", "SOLIDIFY"); sol.thickness = 0.0035; sol.offset = 1.0; sol.use_rim = True
    sub = shorts.modifiers.new("Subdiv", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    for p in shorts.data.polygons:
        p.use_smooth = True

    # hide skin well inside the shorts so it can never poke through
    deep = [i for i, flag in enumerate(inside) if flag]
    vg = body.vertex_groups.new(name="fa_under_shorts")
    hem_band = 0.03
    deep_core = [i for i in deep if (hem_z + 0.03 + hem_band) < pos[i].z < (waist_z - hem_band)]
    vg.add(deep_core, 1.0, "REPLACE")
    mask = body.modifiers.new("FA_HideUnderShorts", "MASK"); mask.vertex_group = "fa_under_shorts"; mask.invert_vertex_group = True
    # keep modifier order: armature first, then masks, then subdiv
    return shorts


def _scalp_attr(body):
    me = body.data
    vals = [0.0] * len(me.vertices)
    vg = body.vertex_groups.get("scalp")
    if vg:
        for v in me.vertices:
            for g in v.groups:
                if g.group == vg.index:
                    vals[v.index] = min(1.0, g.weight * 0.92)
    _write_point_attr(me, "fa_scalp", vals)


def _flat_attr(body, rig, pos):
    """fa_flat: 1 where the skin detail should calm down (face/head, and the UV seam down the back)."""
    import numpy as np
    head_bones = {b.name for b in rig.data.bones["head"].children_recursive} | {"head", "neck03"}
    gidx = {g.index for g in body.vertex_groups if g.name in head_bones}
    n = len(body.data.vertices)
    w = np.zeros(n)
    for v in body.data.vertices:
        for g in v.groups:
            if g.group in gidx:
                w[v.index] += g.weight
    P = np.array([tuple(p) for p in pos])
    seam = (1 - np.clip(np.abs(P[:, 0]) / 0.03, 0, 1)) * (P[:, 1] > 0.02) * (P[:, 2] > 0.9) * (P[:, 2] < 1.6)
    _write_point_attr(body.data, "fa_flat", np.clip(np.maximum(w * 0.85, seam * 0.8), 0, 1).astype("float32"))


def _in_body(body):
    """Per vertex: part of the real skin (MakeHuman's "body" group), not the hidden helper geometry (tights, skirt,
    hair and joint helpers that create_human masks away)."""
    vg = body.vertex_groups.get("body")
    if vg is None:
        return [True] * len(body.data.vertices)
    out = [False] * len(body.data.vertices)
    for v in body.data.vertices:
        for g in v.groups:
            if g.group == vg.index and g.weight > 0.5:
                out[v.index] = True
    return out


def _cut_field(bm, f):
    """Cut the mesh along f(co) = 0 (a smooth edge, not the mesh's own zigzag) and delete where f < 0: every edge
    that crosses is split at the crossing (weights interpolated), the two new points of each face joined."""
    newv = set()
    for e in list(bm.edges):
        a, b = e.verts
        fa, fb = f(a.co), f(b.co)
        if (fa < 0) != (fb < 0) and abs(fa - fb) > 1e-12:
            t = fa / (fa - fb)
            if 1e-4 < t < 1 - 1e-4:
                _, nv = bmesh.utils.edge_split(e, a, t)
                newv.add(nv)
            else:
                newv.add(a if t <= 1e-4 else b)
    for face in list(bm.faces):
        vs = [v for v in face.verts if v in newv]
        if len(vs) == 2 and not any(vs[1] in (e.other_vert(vs[0]),) for e in vs[0].link_edges):
            try:
                bmesh.ops.connect_verts(bm, verts=vs)
            except Exception:
                pass
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v not in newv and f(v.co) < 0], context="VERTS")


def _shell(body, keep, name, mat, gap, thick, field=None):
    """A cloth shell grown from the body's own faces (the shorts method): the faces whose vertices are all in `keep`
    (a per-vertex bool list) and on the real skin, pushed out by `gap` along the normal and given `thick`ness; then
    cut along `field` = 0 (a function of the rest position) for clean edges. Follows the rig for free."""
    pos = rest_positions(body)
    me = body.data
    skin = _in_body(body)
    faces = {f.index for f in me.polygons if all(keep[i] and skin[i] for i in f.vertices)}
    print(f"[character] {name}: {len(faces)} faces")
    sh = body.copy(); sh.data = me.copy(); sh.name = name; sh.data.name = name
    bpy.context.scene.collection.objects.link(sh)
    for m in list(sh.modifiers):
        if m.type != "ARMATURE":
            sh.modifiers.remove(m)
    inv = sh.matrix_world.inverted()
    for v in sh.data.vertices:
        v.co = inv @ pos[v.index]
    sh.shape_key_clear()
    bm = bmesh.new(); bm.from_mesh(sh.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in faces], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    if field is not None:
        mw = sh.matrix_world
        _cut_field(bm, lambda co: field(mw @ co))
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        # drop stray islands (a scrap of cloth left on the neck or under an arm): keep pieces with >= 5 % of faces
        seen, parts = set(), []
        for f0 in bm.faces:
            if f0 in seen:
                continue
            part, stack = [], [f0]; seen.add(f0)
            while stack:
                f1 = stack.pop(); part.append(f1)
                for e in f1.edges:
                    for f2 in e.link_faces:
                        if f2 not in seen:
                            seen.add(f2); stack.append(f2)
            parts.append(part)
        total = max(1, len(bm.faces))
        small = [f for p in parts if len(p) < 0.05 * total for f in p]
        if small:
            print(f"[character] {name}: dropped {len(parts) - sum(1 for p in parts if len(p) >= 0.05 * total)} stray pieces ({len(small)} faces)")
            bmesh.ops.delete(bm, geom=small, context="FACES")
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(sh.data); bm.free()
    sh.data.materials.clear(); sh.data.materials.append(mat)
    d = sh.modifiers.new("Gap", "DISPLACE"); d.strength = gap; d.mid_level = 0.0
    s = sh.modifiers.new("Thick", "SOLIDIFY"); s.thickness = thick; s.offset = 1.0; s.use_rim = True
    sub = sh.modifiers.new("Subdiv", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    for p in sh.data.polygons:
        p.use_smooth = True
    return sh


def _erode(body, flags, rings):
    """flags shrunk by `rings` edge steps (the skin well inside a cloth shell, safe to hide)."""
    nb = [[] for _ in body.data.vertices]
    for e in body.data.edges:
        a, b = e.vertices
        nb[a].append(b); nb[b].append(a)
    f = list(flags)
    for _ in range(rings):
        f = [f[i] and all(f[j] for j in nb[i]) for i in range(len(f))]
    return f


def _make_tank(body, rig):
    """Orange tank top (drawn look, R-490): the torso from just over the shorts' waistband up to the shoulders, with
    deep armholes (the whole shoulder cap shows, as in the main picture set), ~5 cm straps and a round neck."""
    import numpy as np
    pos = rest_positions(body)
    P = np.array([tuple(p) for p in pos]); x = np.abs(P[:, 0]); y = P[:, 1]; z = P[:, 2]
    G = muscles.group_sums(body, rig); LM = muscles.landmarks(rig)
    hip = LM["hip"]; neck = LM["neck"]; nip_z = LM["nipple"][2]; sh = LM["shoulder"]
    waist_z = hip[2] + 0.115                       # the shorts' waistband (_make_shorts)
    hem_z = waist_z - float(os.environ.get("FA_TANK_HEM", 0.045))
    # faces: the torso, generously (the field below makes every edge); arms and legs only well away from it
    torso = (G["torso"] + G["shoulder"] + G["pelvis"] > 0.3) & (G["arm"] < 0.9) & (G["leg"] < 0.5)
    z_a = nip_z - 0.035; z_t = neck[2]
    x_bot = max(0.15, abs(sh[0]) - 0.01); x_top = float(os.environ.get("FA_STRAP_OUT", 0.135))
    ny = neck[1]

    def field(c):
        """>= 0 on the tank. Hem (flat), armholes (from the side seam under the armpit up to the strap), a round
        neck deeper in front than at the back, nothing above the base of the neck."""
        ax = abs(c.x)
        f_hem = c.z - hem_z
        t = min(1.0, max(0.0, (c.z - z_a) / max(1e-3, z_t - z_a)))
        f_arm = (x_bot + (x_top - x_bot) * t ** 0.7) - ax
        w = 1.0 / (1.0 + math.exp(-(c.y - ny) / 0.02))       # 0 in front of the neck, 1 behind it
        nz = (neck[2] - 0.035) * (1 - w) + (neck[2] + 0.02) * w
        nh = 0.085 * (1 - w) + 0.045 * w
        # a U, not an O: above the hole's centre its sides go straight up, so no orange is left on the neck itself
        f_neck = ((ax / 0.085) ** 2 + (min(0.0, c.z - nz) / nh) ** 2 - 1.0) * 0.06
        f_top = neck[2] + 0.06 - c.z
        return min(f_hem, f_arm, f_neck, f_top)

    keep = torso & (z > hem_z - 0.04) & (z < neck[2] + 0.09)
    inside = np.array([field(p) > 0 for p in pos])
    print(f"[character] tank: {int((keep & inside).sum())} vertices, hem z {hem_z:.3f}, shoulder x {sh[0]:.3f}, neck z {neck[2]:.3f}")
    tank = _shell(body, list(keep), "FA_Tank", look.toon_material("FA_Tank", *look.TOON["tank"]),
                  gap=float(os.environ.get("FA_TANK_GAP", 0.009)), thick=0.003, field=field)
    keep = keep & inside
    deep = _erode(body, list(keep & (z > hem_z + 0.025)), 3)
    vg = body.vertex_groups.new(name="fa_under_tank"); vg.add([i for i, f in enumerate(deep) if f], 1.0, "REPLACE")
    m = body.modifiers.new("FA_HideUnderTank", "MASK"); m.vertex_group = "fa_under_tank"; m.invert_vertex_group = True
    return tank


def _make_hair(body, rig):
    """Short dark hair as a solid cap (drawn look): a shell over the scalp, so it outlines like a drawing."""
    import numpy as np
    vg = body.vertex_groups.get("scalp")
    n = len(body.data.vertices)
    w = np.zeros(n)
    if vg:
        for v in body.data.vertices:
            for g in v.groups:
                if g.group == vg.index:
                    w[v.index] = g.weight
    keep = w > 0.45
    print(f"[character] hair: scalp group {'found' if vg else 'MISSING'}, {int(keep.sum())} vertices")
    if keep.sum() < 50:
        return None
    return _shell(body, list(keep), "FA_HairCap", look.toon_material("FA_HairCap", *look.TOON["hair"]),
                  gap=float(os.environ.get("FA_HAIR_GAP", 0.009)), thick=0.004)


def _mark_face(body, rig, pos):
    """Freestyle face marks on the face (eyes, nose, mouth): those get no inner lines, so the face stays plain like
    the main picture set; the head's outer contour still draws."""
    B = rig.data.bones
    eye = None
    for nm in ("eye.L", "eye.R"):
        if nm in B:
            p = rig.matrix_world @ B[nm].head_local
            eye = p if eye is None else (eye + p) / 2
    if eye is None:
        hd = rig.matrix_world @ B["head"].head_local
        eye = hd + Vector((0, -0.08, 0.09))
    c = eye + Vector((0, 0, -0.035))
    me = body.data
    d = [((p - c).x / 0.065) ** 2 + ((p - c).z / 0.085) ** 2 for p in pos]
    near = [d[i] < 1.0 and p.y < c.y + 0.035 for i, p in enumerate(pos)]
    # fa_face: the face is one flat colour too (no shade patches round the eyes and nose), soft at its edge
    _write_point_attr(me, "fa_face", [min(1.0, max(0.0, (1.25 - d[i]) / 0.35)) if p.y < c.y + 0.035 else 0.0
                                      for i, p in enumerate(pos)])
    k = 0
    for f in me.polygons:
        if any(near[i] for i in f.vertices):
            f.use_freestyle_mark = True; k += 1
    print(f"[character] face marks: {k} faces around {tuple(round(v, 3) for v in c)}")


def _add_asset(body, rel_mhclo, make_mat):
    path = os.path.join(MH, rel_mhclo)
    obj = HumanService.add_mhclo_asset(path, body, asset_type="Clothes", subdiv_levels=0, material_type="MAKESKIN")
    obj.data.materials.clear(); obj.data.materials.append(make_mat())
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def build_character():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    body = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True,
                                     feet_on_ground=True, scale=0.1, macro_detail_dict=dict(MACROS))
    body.name = "FA_Body"
    _load_targets(body)
    rig = HumanService.add_builtin_rig(body, "default", import_weights=True)
    rig.name = "FA_Rig"
    _scalp_attr(body)
    pos, nrm = rest_positions(body, with_normals=True)
    muscles.write_masks(body, rig, pos, nrm)
    _flat_attr(body, rig, pos)
    muscles.set_highlight(body, [])
    body.data.materials.clear(); body.data.materials.append(look.skin_material())
    for p in body.data.polygons:
        p.use_smooth = True

    shorts = _make_shorts(body, rig)
    if look.DRAWN:
        return _drawn_rest(body, rig, shorts, pos)
    hair = _add_asset(body, "hair/short02/short02.mhclo",
                      lambda: look.textured_alpha_material("FA_Hair", os.path.join(MH, "hair/short02/short02_diffuse.png"), look.PALETTE["hair"], 0.7))
    brows = _add_asset(body, "eyebrows/eyebrow001/eyebrow001.mhclo",
                       lambda: look.textured_alpha_material("FA_Brows", os.path.join(MH, "eyebrows/eyebrow001/eyebrow001.png"), look.PALETTE["hair"], 0.8))
    eyes = _add_asset(body, "eyes/high-poly/high-poly.mhclo", lambda: look.flat_material("FA_Eyes", "#3C3E42", roughness=0.25, spec=0.6))

    body.data.materials.clear(); body.data.materials.append(look.skin_material())
    shorts.data.materials.clear(); shorts.data.materials.append(look.shorts_material())
    sub = body.modifiers.new("Subdiv", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    return {"body": body, "rig": rig, "shorts": shorts, "hair": hair, "brows": brows, "eyes": eyes}


def _drawn_rest(body, rig, shorts, pos):
    """The drawn look's clothes (R-490): orange tank top, charcoal shorts, white trainers (CC0 MakeHuman shoes05),
    a solid dark hair cap, a plain face (eyeballs in skin colour fill the sockets, no lines on the face)."""
    tank = _make_tank(body, rig)
    hair = _make_hair(body, rig)
    eyes = _add_asset(body, "eyes/high-poly/high-poly.mhclo", lambda: look.toon_material("FA_EyesSkin", *look.TOON["skin"]))
    nol = bpy.data.collections.get(look.NO_LINES) or bpy.data.collections.new(look.NO_LINES)
    if nol.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(nol)
    nol.objects.link(eyes)
    shoes = None
    sp = os.path.join(MH, "clothes/shoes05/shoes05.mhclo")
    if os.path.isfile(sp):
        before = {m.name for m in body.modifiers}
        shoes = _add_asset(body, "clothes/shoes05/shoes05.mhclo", lambda: look.toon_material("FA_Shoes", *look.TOON["shoes"]))
        # MPFB hides the body up to mid-shin under the shoe (its sock); low trainers instead: trim the shoe at the
        # ankle and hide only the foot inside it (the main set shows bare ankles over white trainers)
        for m in [m for m in body.modifiers if m.type == "MASK" and m.name not in before]:
            print(f"[character] shoes: dropped MPFB mask {m.name} ({m.vertex_group})")
            body.modifiers.remove(m)
        top = float(os.environ.get("FA_SHOE_TOP", 0.115))
        if shoes.data.shape_keys is None:
            bm = bmesh.new(); bm.from_mesh(shoes.data)
            mw = shoes.matrix_world
            _cut_field(bm, lambda co: top - (mw @ co).z)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
            bm.to_mesh(shoes.data); bm.free()
        # the sole hangs ~2 cm under the foot the floor is measured from: lift the shoe so the sole sits on z = 0
        mw = shoes.matrix_world
        low = min((mw @ v.co).z for v in shoes.data.vertices)
        if low < 0:
            up = mw.inverted().to_3x3() @ Vector((0, 0, -low))
            for v in shoes.data.vertices:
                v.co += up
            print(f"[character] shoes: lifted {-low:.4f} so the sole meets the floor")
        feet = [i for i, p in enumerate(pos) if p.z < top - 0.03]
        vg = body.vertex_groups.new(name="fa_in_shoes"); vg.add(feet, 1.0, "REPLACE")
        mk = body.modifiers.new("FA_HideInShoes", "MASK"); mk.vertex_group = "fa_in_shoes"; mk.invert_vertex_group = True
    else:
        print("[character] MISSING shoes05: run setup_assets.py")
    _mark_face(body, rig, pos)
    body.data.materials.clear(); body.data.materials.append(look.skin_material())
    shorts.data.materials.clear(); shorts.data.materials.append(look.shorts_material())
    sub = body.modifiers.new("Subdiv", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    if shoes is not None:
        import numpy as np
        dg = bpy.context.evaluated_depsgraph_get()
        ev = shoes.evaluated_get(dg); m = ev.to_mesh()
        print(f"[character] shoes lowest z {min((ev.matrix_world @ v.co).z for v in m.vertices):.4f}")
        ev.to_mesh_clear()
    return {"body": body, "rig": rig, "shorts": shorts, "hair": hair, "brows": None, "eyes": eyes,
            "tank": tank, "shoes": shoes}
