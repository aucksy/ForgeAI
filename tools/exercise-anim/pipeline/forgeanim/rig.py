"""IK controls on the MPFB 'default' rig, grip pose, and helpers to pose by world-space targets.

Controls (empties, world space):
  FA_Hand.L/R   wrist target; its rotation drives the wrist (Copy Rotation). Usually parented to a grip.
  FA_Elbow.L/R  elbow pole
  FA_Foot.L/R   ankle target (+ foot rotation)
  FA_Knee.L/R   knee pole
"""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion

SIDES = ("L", "R")
ARM_CHAIN = ["upperarm01", "upperarm02", "lowerarm01", "lowerarm02"]
LEG_CHAIN = ["upperleg01", "upperleg02", "lowerleg01", "lowerleg02"]
TWIST_LOCK = {"upperarm02": (True, False, True), "lowerarm02": (True, False, True),
              "upperleg02": (True, False, True), "lowerleg02": (True, False, True)}


def _empty(name, loc, size=0.04, shape="SPHERE"):
    e = bpy.data.objects.get(name)
    if e is None:
        e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.empty_display_type = shape; e.empty_display_size = size
    e.location = loc; e.rotation_mode = "QUATERNION"
    return e


def world_head(rig, bone):
    return rig.matrix_world @ rig.pose.bones[bone].head


def world_tail(rig, bone):
    return rig.matrix_world @ rig.pose.bones[bone].tail


def update():
    bpy.context.view_layer.update()


def _pole_error(rig, end_bone, mid_bone, rest_mid):
    update()
    return (world_head(rig, mid_bone) - rest_mid).length


def _calibrate_pole(rig, con, end_bone, mid_bone):
    """Pick the pole_angle that keeps the rest pose unchanged (no manual per-rig constant)."""
    rest_mid = rig.matrix_world @ rig.data.bones[mid_bone].head_local
    best = (1e9, 0.0)
    for deg in range(-180, 180, 15):
        con.pole_angle = math.radians(deg)
        e = _pole_error(rig, end_bone, mid_bone, rest_mid)
        if e < best[0]:
            best = (e, deg)
    lo = best[1]
    for d10 in range(-150, 151, 5):
        deg = lo + d10 / 10.0
        con.pole_angle = math.radians(deg)
        e = _pole_error(rig, end_bone, mid_bone, rest_mid)
        if e < best[0]:
            best = (e, deg)
    con.pole_angle = math.radians(best[1])
    update()
    return best


def setup(rig):
    """Add IK + grip. Rest pose is unchanged afterwards (poles calibrated)."""
    ctl = {}
    for s in SIDES:
        sx = 1 if s == "L" else -1
        # arm
        wrist = rig.matrix_world @ rig.data.bones[f"wrist.{s}"].head_local
        elbow = rig.matrix_world @ rig.data.bones[f"lowerarm01.{s}"].head_local
        hand = _empty(f"FA_Hand.{s}", wrist, 0.05, "ARROWS")
        hand.rotation_quaternion = (rig.matrix_world @ rig.data.bones[f"wrist.{s}"].matrix_local).to_quaternion()
        pole = _empty(f"FA_Elbow.{s}", elbow + Vector((0, 0.35, -0.05)), 0.03)
        pb = rig.pose.bones[f"lowerarm02.{s}"]
        c = pb.constraints.new("IK"); c.name = "FA_IK"; c.target = hand; c.pole_target = pole; c.chain_count = 4
        c.use_stretch = False; c.iterations = 500
        for b in ARM_CHAIN:
            p = rig.pose.bones[f"{b}.{s}"]
            if b in TWIST_LOCK:
                p.lock_ik_x, p.lock_ik_y, p.lock_ik_z = TWIST_LOCK[b]
            p.ik_stretch = 0.0
        # the solver may otherwise roll the whole upper arm about its length (uncanny shoulder twist)
        rig.pose.bones[f"upperarm01.{s}"].ik_stiffness_y = 0.85
        cr = rig.pose.bones[f"wrist.{s}"].constraints.new("COPY_ROTATION"); cr.name = "FA_HandRot"; cr.target = hand
        _calibrate_pole(rig, c, f"lowerarm02.{s}", f"lowerarm01.{s}")
        # leg
        ankle = rig.matrix_world @ rig.data.bones[f"foot.{s}"].head_local
        knee = rig.matrix_world @ rig.data.bones[f"lowerleg01.{s}"].head_local
        foot = _empty(f"FA_Foot.{s}", ankle, 0.05, "ARROWS")
        foot.rotation_quaternion = (rig.matrix_world @ rig.data.bones[f"foot.{s}"].matrix_local).to_quaternion()
        kp = _empty(f"FA_Knee.{s}", knee + Vector((sx * 0.05, -0.6, 0)), 0.03)
        lb = rig.pose.bones[f"lowerleg02.{s}"]
        c2 = lb.constraints.new("IK"); c2.name = "FA_IK"; c2.target = foot; c2.pole_target = kp; c2.chain_count = 4
        c2.use_stretch = False; c2.iterations = 500
        for b in LEG_CHAIN:
            p = rig.pose.bones[f"{b}.{s}"]
            if b in TWIST_LOCK:
                p.lock_ik_x, p.lock_ik_y, p.lock_ik_z = TWIST_LOCK[b]
        fr = rig.pose.bones[f"foot.{s}"].constraints.new("COPY_ROTATION"); fr.name = "FA_FootRot"; fr.target = foot
        _calibrate_pole(rig, c2, f"lowerleg02.{s}", f"lowerleg01.{s}")
        ctl.update({f"hand.{s}": hand, f"elbow.{s}": pole, f"foot.{s}": foot, f"knee.{s}": kp})
    return ctl


# ---------- hand grip ---------------------------------------------------------------------------
# Curl per finger joint (degrees about the bone's local X). Thumb wraps the other way.
GRIP = {"finger2": (42, 62, 40), "finger3": (46, 66, 40), "finger4": (50, 68, 40), "finger5": (54, 70, 40),
        "finger1": (8, 28, 22)}


def set_grip(rig, amount=1.0, sign=1.0):
    for s in SIDES:
        for f, angs in GRIP.items():
            for j, a in enumerate(angs, start=1):
                pb = rig.pose.bones.get(f"{f}-{j}.{s}")
                if pb is None:
                    continue
                pb.rotation_mode = "XYZ"
                pb.rotation_euler = (math.radians(a * amount * sign), 0, 0)


def measure_grip(rig, side):
    """Grip frame (handle centre + axis) expressed in the wrist bone's pose space. Call after set_grip()."""
    update()
    mw = rig.matrix_world
    pb = rig.pose.bones
    rings = []
    for k in (2, 3, 4, 5):
        pts = [mw @ pb[f"finger{k}-1.{side}"].head, mw @ pb[f"finger{k}-2.{side}"].head,
               mw @ pb[f"finger{k}-3.{side}"].head, mw @ pb[f"finger{k}-3.{side}"].tail]
        rings.append(sum(pts, Vector()) / 4)
    c = sum(rings, Vector()) / 4
    x = (rings[0] - rings[3]).normalized()              # pinky -> index
    wrist = mw @ pb[f"wrist.{side}"].head
    y = (wrist - c); y = (y - x * y.dot(x)).normalized()  # toward the forearm
    z = x.cross(y)
    G = Matrix((x, y, z)).transposed().to_4x4(); G.translation = c
    W = mw @ pb[f"wrist.{side}"].matrix
    return W.inverted() @ G


def grip_forearm_angle(rig, side, G_local):
    """Angle (rad) of the forearm line inside the grip frame's y-z plane with the wrist at rest (neutral).
    The grip frame's y points from the fist centre to the wrist, which is NOT the forearm line (the fist sits on
    the palm side); aiming y along the forearm cocked every wrist ~20 deg (incline press: 31 deg vs 11 at rest)."""
    update()
    mw = rig.matrix_world; pb = rig.pose.bones
    W = mw @ pb[f"wrist.{side}"].matrix
    f = (mw @ pb[f"lowerarm01.{side}"].head) - (mw @ pb[f"wrist.{side}"].head)
    Gw = W @ G_local
    d = Gw.to_3x3().inverted() @ f
    return math.atan2(d.z, d.y)


def frame_from(c, x_axis, y_hint):
    x = Vector(x_axis).normalized()
    y = Vector(y_hint); y = (y - x * y.dot(x)).normalized()
    z = x.cross(y)
    M = Matrix((x, y, z)).transposed().to_4x4(); M.translation = Vector(c)
    return M


def place_hand(rig, side, grip_world_center, handle_axis, G_local, iterations=4):
    """Move FA_Hand.<side> so the hand's grip frame lands on the handle, wrist as neutral as possible.

    handle_axis: direction from the pinky side to the index side of THIS hand along the handle.
    """
    hand = bpy.data.objects[f"FA_Hand.{side}"]
    for _ in range(iterations):
        update()
        elbow = world_head(rig, f"lowerarm01.{side}")
        wrist = world_head(rig, f"wrist.{side}")
        fore = elbow - wrist
        Gw = frame_from(grip_world_center, handle_axis, fore)
        Wm = Gw @ G_local.inverted()
        hand.location = Wm.translation
        hand.rotation_quaternion = Wm.to_quaternion()
    update()
