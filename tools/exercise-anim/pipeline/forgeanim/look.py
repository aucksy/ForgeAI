"""The ForgeAI clip look: palette, materials, world, lights, render settings.

Every visual constant lives here so 400 clips stay identical.
"""
import os
import bpy
from mathutils import Vector
from . import MH, MAPS


def srgb(hexstr):
    """'#RRGGBB' -> linear RGBA tuple for Blender."""
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


LOOK = {  # v2 look (15 Oct 2026): matched side by side against the Gymvisual/Hevy reference
    "normal_strength": 2.0, "cav_from": 0.2, "cav_to": 0.9, "cav_amount": 0.95, "ao_floor": 0.45,
    "world": 0.16, "key": 340, "fill": 22, "rim": 190, "top": 40, "roughness": 0.58, "sheen": 0.15,
    "hl_cav": 0.8, "hl_full": 0.85,  # helper muscles (0.5) stay visibly lighter than the main muscle (1.0)
}
_ov = os.environ.get("FA_LOOK")
if _ov:
    import json as _json
    LOOK.update(_json.loads(_ov))

PALETTE = {
    "skin": os.environ.get("FA_SKIN", "#C6C9CD"),        # cool light grey anatomy
    "groove": os.environ.get("FA_GROOVE", "#43464C"),      # colour the deepest grooves fall to
    "hl_core": os.environ.get("FA_HL_CORE", "#D2321C"),     # muscle highlight, centre
    "hl_edge": os.environ.get("FA_HL_EDGE", "#F25A2C"),     # muscle highlight, edge (ForgeAI ember)
    "shorts": "#1D1F23",
    "hair": "#2A2B2E",
    "iron": "#18191B",        # dumbbell / plate rubber
    "chrome": "#C4C8CE",
    "frame": "#D9DBDF",       # bench / machine frame
    "pad": "#4A4E55",         # bench pad
    "bg": "#FFFFFF",
}


def _img(path, colorspace="Non-Color"):
    name = os.path.basename(path)
    img = bpy.data.images.get(name) or bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def skin_material(name="FA_Skin"):
    """Grey anatomy skin: CC0 Aksel normal map + derived cavity map + per-exercise highlight mask.

    The highlight comes from the point attribute fa_hl (0..1), written per exercise by muscles.set_highlight().
    """
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; N = nt.nodes; L = nt.links
    N.clear()
    out = N.new("ShaderNodeOutputMaterial"); out.location = (1400, 0)
    bsdf = N.new("ShaderNodeBsdfPrincipled"); bsdf.location = (1100, 0)
    uv = N.new("ShaderNodeUVMap"); uv.location = (-1200, 0)

    nrm = N.new("ShaderNodeTexImage"); nrm.location = (-900, -400); nrm.name = "NRM"
    nrm.image = _img(os.path.join(MAPS, os.environ.get("FA_NRM", "body_nrm.png")))  # blurred copy of the CC0 Aksel normal map
    nmap = N.new("ShaderNodeNormalMap"); nmap.location = (-600, -400); nmap.inputs["Strength"].default_value = LOOK["normal_strength"]
    L.new(uv.outputs[0], nrm.inputs[0]); L.new(nrm.outputs[0], nmap.inputs["Color"])
    flat = N.new("ShaderNodeAttribute"); flat.attribute_name = "fa_flat"; flat.location = (-600, -650); flat.name = "FLAT"
    geo = N.new("ShaderNodeNewGeometry"); geo.location = (-600, -800)
    nmix = N.new("ShaderNodeMix"); nmix.data_type = "VECTOR"; nmix.location = (-350, -500)
    L.new(flat.outputs["Fac"], nmix.inputs["Factor"]); L.new(nmap.outputs[0], nmix.inputs[4]); L.new(geo.outputs["Normal"], nmix.inputs[5])
    nnorm = N.new("ShaderNodeVectorMath"); nnorm.operation = "NORMALIZE"; nnorm.location = (-150, -500)
    L.new(nmix.outputs[1], nnorm.inputs[0])
    L.new(nnorm.outputs[0], bsdf.inputs["Normal"])

    cav = N.new("ShaderNodeTexImage"); cav.location = (-900, 200); cav.name = "CAV"
    cav.image = _img(os.path.join(MAPS, "cavity.png"))
    L.new(uv.outputs[0], cav.inputs[0])
    cr = N.new("ShaderNodeMapRange"); cr.location = (-600, 200)
    cr.inputs["From Min"].default_value = LOOK["cav_from"]; cr.inputs["From Max"].default_value = LOOK["cav_to"]
    L.new(cav.outputs[0], cr.inputs["Value"])
    cav_amt = N.new("ShaderNodeMath"); cav_amt.operation = "MULTIPLY"; cav_amt.location = (-400, 200)
    cav_amt.inputs[1].default_value = LOOK["cav_amount"]; cav_amt.name = "CAV_AMOUNT"
    flat_inv = N.new("ShaderNodeMath"); flat_inv.operation = "SUBTRACT"; flat_inv.inputs[0].default_value = 1.0; flat_inv.location = (-600, 350)
    L.new(flat.outputs["Fac"], flat_inv.inputs[1])
    cav_pre = N.new("ShaderNodeMath"); cav_pre.operation = "MULTIPLY"; cav_pre.location = (-500, 250)
    L.new(cr.outputs[0], cav_pre.inputs[0]); L.new(flat_inv.outputs[0], cav_pre.inputs[1])
    L.new(cav_pre.outputs[0], cav_amt.inputs[0])

    # local ambient occlusion deepens creases (armpit, elbow, shorts edge)
    ao = N.new("ShaderNodeAmbientOcclusion"); ao.location = (-600, 500)
    ao.only_local = True; ao.inputs["Distance"].default_value = 0.06; ao.samples = 4
    L.new(nmap.outputs[0], ao.inputs["Normal"])
    ao_r = N.new("ShaderNodeMapRange"); ao_r.location = (-400, 500)
    ao_r.inputs["From Min"].default_value = 0.0; ao_r.inputs["From Max"].default_value = 1.0
    ao_r.inputs["To Min"].default_value = LOOK["ao_floor"]; ao_r.inputs["To Max"].default_value = 1.0
    L.new(ao.outputs["AO"], ao_r.inputs["Value"])

    base = N.new("ShaderNodeRGB"); base.location = (-400, 0); base.outputs[0].default_value = srgb(PALETTE["skin"])
    groove = N.new("ShaderNodeRGB"); groove.location = (-400, -150); groove.outputs[0].default_value = srgb(PALETTE["groove"])
    mix_g = N.new("ShaderNodeMix"); mix_g.data_type = "RGBA"; mix_g.location = (-150, 100)
    L.new(cav_amt.outputs[0], mix_g.inputs["Factor"]); L.new(base.outputs[0], mix_g.inputs[6]); L.new(groove.outputs[0], mix_g.inputs[7])

    # muscle highlight
    hl = N.new("ShaderNodeAttribute"); hl.location = (-900, 800); hl.name = "HL"; hl.attribute_name = "fa_hl"
    hl_ramp = N.new("ShaderNodeValToRGB"); hl_ramp.location = (-600, 800); hl_ramp.name = "HL_RAMP"
    cr_ = hl_ramp.color_ramp; cr_.interpolation = "EASE"
    cr_.elements[0].position = 0.0; cr_.elements[0].color = srgb(PALETTE["hl_edge"])
    cr_.elements[1].position = 0.9; cr_.elements[1].color = srgb(PALETTE["hl_core"])
    L.new(hl.outputs["Fac"], hl_ramp.inputs[0])
    hl_f = N.new("ShaderNodeMapRange"); hl_f.location = (-600, 650); hl_f.name = "HL_FACTOR"
    hl_f.inputs["From Min"].default_value = 0.03; hl_f.inputs["From Max"].default_value = LOOK["hl_full"]
    hl_f.interpolation_type = "SMOOTHSTEP"
    L.new(hl.outputs["Fac"], hl_f.inputs["Value"])
    hl_dark = N.new("ShaderNodeMix"); hl_dark.data_type = "RGBA"; hl_dark.blend_type = "MULTIPLY"; hl_dark.location = (-300, 800)
    L.new(cr.outputs[0], hl_dark.inputs["Factor"]); hl_dark.inputs["Factor"].default_value = 0.4
    L.new(hl_ramp.outputs[0], hl_dark.inputs[6]); hl_dark.inputs[7].default_value = (0.55, 0.2, 0.12, 1)
    cav_hl = N.new("ShaderNodeMath"); cav_hl.operation = "MULTIPLY"; cav_hl.inputs[1].default_value = LOOK["hl_cav"]; cav_hl.location = (-450, 650)
    L.new(cr.outputs[0], cav_hl.inputs[0]); L.new(cav_hl.outputs[0], hl_dark.inputs["Factor"])
    mix_h = N.new("ShaderNodeMix"); mix_h.data_type = "RGBA"; mix_h.location = (100, 300)
    L.new(hl_f.outputs[0], mix_h.inputs["Factor"]); L.new(mix_g.outputs[2], mix_h.inputs[6]); L.new(hl_dark.outputs[2], mix_h.inputs[7])

    mix_ao = N.new("ShaderNodeMix"); mix_ao.data_type = "RGBA"; mix_ao.blend_type = "MULTIPLY"; mix_ao.location = (400, 300)
    mix_ao.inputs["Factor"].default_value = 1.0
    L.new(mix_h.outputs[2], mix_ao.inputs[6])
    ao_rgb = N.new("ShaderNodeCombineColor"); ao_rgb.location = (200, 500)
    for i in range(3):
        L.new(ao_r.outputs[0], ao_rgb.inputs[i])
    L.new(ao_rgb.outputs[0], mix_ao.inputs[7])

    # scalp darkening under the sparse hair cards (attribute written by character.py)
    sc = N.new("ShaderNodeAttribute"); sc.attribute_name = "fa_scalp"; sc.location = (400, 600)
    sc_m = N.new("ShaderNodeMix"); sc_m.data_type = "RGBA"; sc_m.location = (700, 300)
    L.new(sc.outputs["Fac"], sc_m.inputs["Factor"]); L.new(mix_ao.outputs[2], sc_m.inputs[6])
    sc_m.inputs[7].default_value = srgb(PALETTE["hair"])
    L.new(sc_m.outputs[2], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = LOOK["roughness"]
    bsdf.inputs["Specular IOR Level"].default_value = 0.32
    bsdf.inputs["Subsurface Weight"].default_value = 0.0   # SSS costs ~2x render time for little gain at app size
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.45, 0.3)
    bsdf.inputs["Subsurface Scale"].default_value = 0.012
    bsdf.inputs["Sheen Weight"].default_value = LOOK["sheen"]
    bsdf.inputs["Sheen Roughness"].default_value = 0.4
    L.new(bsdf.outputs[0], out.inputs[0])
    return mat


def flat_material(name, hexcol, roughness=0.5, metallic=0.0, spec=0.4, coat=0.0):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(hexcol)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Coat Weight"].default_value = coat
    return mat


def shorts_material(name="FA_Shorts"):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
    at = nt.nodes.new("ShaderNodeAttribute"); at.attribute_name = "fa_hl"
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = 0.05; mr.inputs["From Max"].default_value = 0.6
    mr.inputs["To Max"].default_value = 0.85; mr.interpolation_type = "SMOOTHSTEP"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs[6].default_value = srgb(PALETTE["shorts"]); mix.inputs[7].default_value = srgb("#A8301A")
    nt.links.new(at.outputs["Fac"], mr.inputs["Value"]); nt.links.new(mr.outputs[0], mix.inputs["Factor"])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.72; b.inputs["Specular IOR Level"].default_value = 0.25
    b.inputs["Sheen Weight"].default_value = 0.3
    return mat


def textured_alpha_material(name, image_path, hexcol, roughness=0.6):
    """Hair / eyebrow cards: colour from palette, alpha from the CC0 texture."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = _img(image_path, "sRGB")
    b.inputs["Base Color"].default_value = srgb(hexcol)
    b.inputs["Roughness"].default_value = roughness
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    mat.blend_method = "HASHED" if hasattr(mat, "blend_method") else None
    return mat


def setup_world_and_render(scene, res=720, samples=48, transparent=False):
    scene.render.engine = "CYCLES"
    c = scene.cycles
    c.device = "CPU"; c.samples = samples; c.use_adaptive_sampling = True; c.adaptive_threshold = 0.02
    c.use_denoising = True; c.denoiser = "OPENIMAGEDENOISE"
    c.max_bounces = 4; c.diffuse_bounces = 2; c.glossy_bounces = 1; c.transmission_bounces = 0
    c.volume_bounces = 0; c.transparent_max_bounces = 10
    c.use_light_tree = True
    scene.render.use_persistent_data = True   # keep the scene in memory between frames
    scene.render.resolution_x = res; scene.render.resolution_y = res; scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.view_settings.view_transform = "Standard"; scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0; scene.view_settings.gamma = 1.0
    scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    w = bpy.data.worlds.get("FA_World") or bpy.data.worlds.new("FA_World"); scene.world = w; w.use_nodes = True
    N = w.node_tree.nodes; L = w.node_tree.links; N.clear()
    out = N.new("ShaderNodeOutputWorld")
    env = N.new("ShaderNodeBackground"); env.inputs[0].default_value = (1, 1, 1, 1); env.inputs[1].default_value = LOOK["world"]
    camv = N.new("ShaderNodeBackground"); camv.inputs[0].default_value = srgb(PALETTE["bg"]); camv.inputs[1].default_value = 1.0
    lp = N.new("ShaderNodeLightPath"); mix = N.new("ShaderNodeMixShader")
    L.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); L.new(env.outputs[0], mix.inputs[1]); L.new(camv.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs[0])


def _aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_lights(scene, center=(0, 0, 1.0), yaw_deg=-35.0):
    """Soft studio rig. Lights rotate with the camera yaw so every view is lit the same way."""
    import math
    from mathutils import Matrix
    rot = Matrix.Rotation(math.radians(yaw_deg), 4, "Z")
    c = Vector(center)
    for o in [o for o in scene.objects if o.name.startswith("FA_Light")]:
        bpy.data.objects.remove(o)
    rig = [  # name, offset in camera-relative frame (camera looks along +Y from -Y), energy W, size m
        ("FA_Light_Key", (-2.6, -2.4, 2.6), LOOK["key"], 2.2),
        ("FA_Light_Fill", (2.8, -1.8, 0.9), LOOK["fill"], 3.2),
        ("FA_Light_Rim", (1.2, 3.2, 2.2), LOOK["rim"], 1.6),
        ("FA_Light_Top", (0.0, 0.0, 4.0), LOOK["top"], 3.0),
    ]
    for name, off, energy, size in rig:
        d = bpy.data.lights.new(name, "AREA"); d.energy = energy; d.size = size; d.shape = "DISK"
        o = bpy.data.objects.new(name, d); scene.collection.objects.link(o)
        o.location = c + (rot @ Vector(off)); _aim(o, c)
