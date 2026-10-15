"""Turn an exercise spec (JSON) into a baked, seamless loop.

Coordinates
  world : metres, Z up, the athlete faces -Y in rest pose, +X = athlete's LEFT.
  torso : origin = midpoint of the shoulder joints; X = athlete's left, Y = forward (out of the chest), Z = up the spine.
Right-hand values mirror the left ones (x -> -x) unless a pose gives an explicit "R".

Pose keys (all optional, missing = rest / previous):
  root:   {"loc": [x,y,z] world position of the root (pelvis) joint, "rot": [rx,ry,rz] degrees applied to the whole body}
  bones:  {"spine03": [rx,ry,rz], "neck01": [...], "head": [...], "clavicle.L": [...], ...}  local euler degrees
  hands:  {"L": {"prop": "db_L", "at": [x,y,z], "axis": [x,y,z], "frame": "torso"|"world"}}   axis = pinky->index
  elbows: {"L": [x,y,z]}  pole position, torso frame
  feet:   {"L": {"at": [x,y,z] world ankle, "rot": [rx,ry,rz] degrees world}}
  knees:  {"L": [x,y,z]}  pole position, world
"""
import math, json
import bpy
from mathutils import Vector, Matrix, Euler, Quaternion
from . import rig as R
from . import props as P
from . import muscles as MU

MIRROR = Vector((-1, 1, 1))


def ease(u, kind="smooth"):
    u = max(0.0, min(1.0, u))
    if kind == "linear":
        return u
    if kind == "smoother":
        return u * u * u * (u * (u * 6 - 15) + 10)
    return u * u * (3 - 2 * u)


def mirror(v):
    return Vector((-v[0], v[1], v[2]))


def lerp(a, b, u):
    return [x + (y - x) * u for x, y in zip(a, b)]


def torso_frame(rig):
    R.update()
    sl = R.world_head(rig, "upperarm01.L"); sr = R.world_head(rig, "upperarm01.R")
    o = (sl + sr) / 2
    x = (sl - sr).normalized()
    up = R.world_head(rig, "neck01") - R.world_head(rig, "spine05")
    z = (up - x * up.dot(x)).normalized()
    f = x.cross(z)  # forward
    M = Matrix((x, f, z)).transposed().to_4x4(); M.translation = o
    return M


class Clip:
    def __init__(self, spec, ch, ctl):
        self.spec = spec; self.ch = ch; self.rig = ch["rig"]; self.ctl = ctl
        self.props = {}
        self.G = {}
        self.rest_root = self.rig.data.bones["root"].matrix_local.copy()
        self.rest = {}  # resolved full poses

    # ---------------- scene ----------------
    def build_props(self):
        sc = self.spec.get("scene", {})
        if "bench" in sc:
            b = sc["bench"]
            self.bench = P.incline_bench(b.get("deg", 35.0))
            self.bench["root"].location = Vector(b.get("loc", (0, 0, 0)))
        for name, p in self.spec.get("props", {}).items():
            if p["type"] == "dumbbell":
                self.props[name] = P.dumbbell("FA_" + name)
            else:
                raise ValueError("unknown prop " + p["type"])
        R.set_grip(self.rig, 1.0, 1.0)
        self.G = {s: R.measure_grip(self.rig, s) for s in R.SIDES}

    # ---------------- pose resolution ----------------
    def full_pose(self, name):
        """Merge a named pose over its 'base' (and the spec defaults), mirroring left -> right."""
        poses = self.spec["poses"]
        p = json.loads(json.dumps(poses[name]))
        base = p.pop("base", None)
        out = self.full_pose(base) if base else json.loads(json.dumps(self.spec.get("defaults", {})))
        for k, v in p.items():
            if isinstance(v, dict) and isinstance(out.get(k), dict):
                out[k].update(v)
            else:
                out[k] = v
        for group in ("hands", "elbows", "feet", "knees"):
            g = out.get(group, {})
            if "L" in g and "R" not in g:
                l = g["L"]
                if isinstance(l, dict):
                    r = dict(l)
                    for key in ("at", "axis"):
                        if key in r:
                            r[key] = list(mirror(r[key]))
                    if "rot" in r:
                        r["rot"] = [r["rot"][0], -r["rot"][1], -r["rot"][2]]
                    if "prop" in r and r["prop"].endswith("_L"):
                        r["prop"] = r["prop"][:-2] + "_R"
                    g["R"] = r
                else:
                    g["R"] = list(mirror(l))
        bones = out.get("bones", {})
        for b, v in list(bones.items()):
            if b.endswith(".L") and b[:-2] + ".R" not in bones:
                bones[b[:-2] + ".R"] = [v[0], -v[1], -v[2]]
        return out

    @staticmethod
    def blend(a, b, u):
        """Interpolate two resolved poses."""
        out = {}
        for k in set(a) | set(b):
            va, vb = a.get(k), b.get(k)
            if va is None or vb is None:
                out[k] = va if vb is None else vb
            elif k == "root":
                out[k] = {"loc": lerp(va.get("loc", vb.get("loc")), vb.get("loc", va.get("loc")), u),
                          "rot": lerp(va.get("rot", [0, 0, 0]), vb.get("rot", [0, 0, 0]), u)}
            elif k == "bones":
                names = set(va) | set(vb)
                out[k] = {n: lerp(va.get(n, [0, 0, 0]), vb.get(n, [0, 0, 0]), u) for n in names}
            elif k in ("hands", "feet"):
                out[k] = {}
                for s in set(va) | set(vb):
                    ha, hb = va.get(s, vb.get(s)), vb.get(s, va.get(s))
                    h = dict(ha)
                    for key in ("at", "axis", "rot"):
                        if key in ha and key in hb:
                            h[key] = lerp(ha[key], hb[key], u)
                    out[k][s] = h
            elif k in ("elbows", "knees"):
                out[k] = {s: lerp(va.get(s, vb.get(s)), vb.get(s, va.get(s)), u) for s in set(va) | set(vb)}
            else:
                out[k] = va if u < 0.5 else vb
        return out

    # ---------------- apply ----------------
    def apply(self, pose):
        rig = self.rig; pb = rig.pose.bones
        root = pose.get("root")
        for b in pb:
            if b.name in ("root",):
                continue
        if root:
            rot = Euler([math.radians(a) for a in root.get("rot", [0, 0, 0])], "XYZ").to_matrix().to_4x4()
            loc = Vector(root.get("loc", self.rest_root.translation))
            W = Matrix.Translation(loc) @ rot @ Matrix.Translation(-self.rest_root.translation) @ self.rest_root
            pb["root"].matrix = rig.matrix_world.inverted() @ W
        for name, e in pose.get("bones", {}).items():
            if name in pb:
                pb[name].rotation_mode = "XYZ"
                pb[name].rotation_euler = Euler([math.radians(a) for a in e], "XYZ")
        R.update()
        T = torso_frame(rig)
        for s, pos in pose.get("elbows", {}).items():
            self.ctl[f"elbow.{s}"].location = T @ Vector(pos)
        for s, pos in pose.get("knees", {}).items():
            self.ctl[f"knee.{s}"].location = Vector(pos)
        for s, f in pose.get("feet", {}).items():
            ft = self.ctl[f"foot.{s}"]
            if "at" in f:
                ft.location = Vector(f["at"])
            if "rot" in f:
                ft.rotation_quaternion = Euler([math.radians(a) for a in f["rot"]], "XYZ").to_quaternion() @ self.foot_rest[s]
        R.update()
        for s, h in pose.get("hands", {}).items():
            frame = T if h.get("frame", "torso") == "torso" else Matrix.Identity(4)
            c = frame @ Vector(h["at"])
            axis = (frame.to_3x3() @ Vector(h["axis"])).normalized()
            prop = self.props.get(h.get("prop", ""))
            if prop is not None:
                up = frame.to_3x3() @ Vector((0, 0, 1))
                prop.matrix_world = R.frame_from(c, axis if s == "L" else -axis, up)
            R.place_hand(rig, s, c, axis, self.G[s])
        R.update()

    # ---------------- bake ----------------
    def timeline(self):
        t = self.spec["timing"]
        fps = t.get("fps", 30)
        keys = t["keys"]  # [[seconds, pose_name, ease?], ...]; last pose must equal the first for a loop
        total = keys[-1][0]
        n = int(round(total * fps))
        return fps, keys, n

    def pose_at(self, sec, keys, cache):
        for i in range(len(keys) - 1):
            t0, p0 = keys[i][0], keys[i][1]
            t1, p1 = keys[i + 1][0], keys[i + 1][1]
            if t0 <= sec <= t1:
                kind = keys[i + 1][2] if len(keys[i + 1]) > 2 else "smooth"
                u = 0.0 if t1 == t0 else ease((sec - t0) / (t1 - t0), kind)
                a = cache.setdefault(p0, self.full_pose(p0)); b = cache.setdefault(p1, self.full_pose(p1))
                return self.blend(a, b, u) if p0 != p1 else a
        return cache.setdefault(keys[-1][1], self.full_pose(keys[-1][1]))

    def bake(self):
        scene = bpy.context.scene
        fps, keys, n = self.timeline()
        scene.render.fps = fps; scene.frame_start = 0; scene.frame_end = n - 1
        self.foot_rest = {s: self.ctl[f"foot.{s}"].rotation_quaternion.copy() for s in R.SIDES}
        cache = {}
        rig = self.rig; pb = rig.pose.bones
        bone_names = set()
        for p in self.spec["poses"].values():
            bone_names |= set(p.get("bones", {}).keys())
        bone_names |= {b[:-2] + ".R" for b in bone_names if b.endswith(".L")}
        animated = [o for o in self.ctl.values()] + list(self.props.values())
        for f in range(n):
            scene.frame_set(f)
            self.apply(self.pose_at(f / fps, keys, cache))
            pb["root"].keyframe_insert("location", frame=f); pb["root"].keyframe_insert("rotation_quaternion", frame=f)
            for b in bone_names:
                if b in pb:
                    pb[b].keyframe_insert("rotation_euler", frame=f)
            for o in animated:
                o.keyframe_insert("location", frame=f)
                o.keyframe_insert("rotation_quaternion" if o.rotation_mode == "QUATERNION" else "rotation_euler", frame=f)
        for ob in [rig] + animated:
            ad = ob.animation_data
            if ad and ad.action:
                for fc in _fcurves(ad.action):
                    for k in fc.keyframe_points:
                        k.interpolation = "LINEAR"
        return n

    def highlight(self):
        prim = self.spec.get("primary", []); sec = self.spec.get("secondary", [])
        MU.set_highlight(self.ch["body"], prim, sec)
        MU.set_highlight(self.ch["shorts"], prim, sec)


def _fcurves(action):
    """Blender 4.4+ layered actions keep F-curves in channelbags; older ones on action.fcurves."""
    if hasattr(action, "fcurves") and len(action.fcurves):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for cb in getattr(strip, "channelbags", []):
                out.extend(cb.fcurves)
    return out
