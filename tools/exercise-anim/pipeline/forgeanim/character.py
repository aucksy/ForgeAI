"""Build the ForgeAI demo athlete from CC0 MakeHuman (MPFB) parts.

build_character() -> dict(body=, rig=, shorts=, hair=, eyes=, brows=)
"""
import os
import bpy, bmesh
from mathutils import Vector
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
from . import MH
from . import look
from . import muscles

MACROS = {"gender": 1.0, "age": 0.42, "muscle": 1.0, "weight": 0.40, "proportions": 1.0, "height": 0.58,
          "race": {"asian": 0.25, "caucasian": 0.5, "african": 0.25}}

# extra MPFB targets (all CC0) that push the body toward a defined athletic build
TARGETS = {
    "torso/torso-muscle-pectoral-incr": 0.55,
    "torso/torso-muscle-dorsi-incr": 0.6,
    "torso/torso-vshape-incr": 0.45,
    "stomach/stomach-tone-incr": 0.0,
    "arms/l-upperarm-muscle-incr": 0.55, "arms/r-upperarm-muscle-incr": 0.55,
    "arms/l-upperarm-shoulder-muscle-incr": 0.65, "arms/r-upperarm-shoulder-muscle-incr": 0.65,
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
    hem_z = hip.z - 0.235
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
    disp = shorts.modifiers.new("Gap", "DISPLACE"); disp.strength = 0.0045; disp.mid_level = 0.0
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
    hair = _add_asset(body, "hair/short02/short02.mhclo",
                      lambda: look.textured_alpha_material("FA_Hair", os.path.join(MH, "hair/short02/short02_diffuse.png"), look.PALETTE["hair"], 0.7))
    brows = _add_asset(body, "eyebrows/eyebrow001/eyebrow001.mhclo",
                       lambda: look.textured_alpha_material("FA_Brows", os.path.join(MH, "eyebrows/eyebrow001/eyebrow001.png"), look.PALETTE["hair"], 0.8))
    eyes = _add_asset(body, "eyes/high-poly/high-poly.mhclo", lambda: look.flat_material("FA_Eyes", "#3C3E42", roughness=0.25, spec=0.6))

    body.data.materials.clear(); body.data.materials.append(look.skin_material())
    shorts.data.materials.clear(); shorts.data.materials.append(look.shorts_material())
    sub = body.modifiers.new("Subdiv", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    return {"body": body, "rig": rig, "shorts": shorts, "hair": hair, "brows": brows, "eyes": eyes}
