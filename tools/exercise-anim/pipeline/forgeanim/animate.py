"""Turn an exercise spec (JSON) into a baked, seamless loop.

Coordinates
  world : metres, Z up, the athlete faces -Y in rest pose, +X = athlete's LEFT.
  torso : origin = midpoint of the shoulder joints; X = athlete's left, Y = forward (out of the chest), Z = up the spine.
Right-hand values mirror the left ones (x -> -x) unless a pose gives an explicit "R".

Pose keys (all optional, missing = rest / previous):
  root:   {"loc": [x,y,z] world position of the root (pelvis) joint, "rot": [rx,ry,rz] degrees applied to the whole body}
  bones:  {"spine03": [rx,ry,rz], "neck01": [...], "head": [...], "clavicle.L": [...], ...}  local euler degrees
  hands:  {"L": {"prop": "db_L", "at": [x,y,z], "axis": [x,y,z], "frame": "torso"|"world", "pivot": [x,y,z]}}
          or, preferred: {"L": {"prop": "db_L", "axis": [...], "arm": {"elev": 55, "plane": -25, "elbow": 90,
          "bend": [0,1,0]} }}  (joint angles; "fore_world": [0,0,1] instead of elbow/bend = forearm points that way)
          axis = pinky->index; pivot (optional, torso frame) = the joint the hand swings around between poses
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
                    for key in ("at", "axis", "pivot"):
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
                    if "arm" in ha and "arm" in hb:   # joint-space interpolation: angles, not positions
                        aa, ab = ha["arm"], hb["arm"]
                        h["arm"] = {k2: (lerp(aa[k2], ab[k2], u) if isinstance(aa.get(k2), list) else aa[k2] + (ab[k2] - aa[k2]) * u)
                                    for k2 in aa if k2 in ab and not isinstance(aa[k2], str)}
                        for k2 in aa:
                            if isinstance(aa[k2], str):
                                h["arm"][k2] = aa[k2]
                    piv = ha.get("pivot") or hb.get("pivot")
                    if piv and "at" in ha and "at" in hb:
                        # swing around a joint (elbow for curls, shoulder for raises/flies): angle + radius, not a straight chord
                        pv = Vector(piv); ra = Vector(ha["at"]) - pv; rb = Vector(hb["at"]) - pv
                        q = ra.normalized().rotation_difference(rb.normalized())
                        dirn = Quaternion().slerp(q, u) @ ra.normalized()
                        h["at"] = list(pv + dirn * (ra.length + (rb.length - ra.length) * u))
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
        self.resolve_arms(pose, T)
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
            if "_fk" in h:
                self.pose_arm_fk(s, h, T)
                continue
            frame = T if h.get("frame", "torso") == "torso" else Matrix.Identity(4)
            c = frame @ Vector(h["at"])
            axis = (frame.to_3x3() @ Vector(h["axis"])).normalized()
            prop = self.props.get(h.get("prop", ""))
            if prop is not None:
                up = frame.to_3x3() @ Vector((0, 0, 1))
                prop.matrix_world = R.frame_from(c, axis if s == "L" else -axis, up)
            R.place_hand(rig, s, c, axis, self.G[s])
        R.update()

    FK_BONES = ("upperarm01", "upperarm02", "lowerarm01", "lowerarm02")

    def pose_arm_fk(self, s, h, T):
        """Set the arm bones directly: each segment takes the shortest swing from where it points to where it must point,
        so the upper arm never spins about its own length (the IK solver's free roll caused an uncanny shoulder twist)."""
        rig = self.rig; pb = rig.pose.bones
        con = pb[f"lowerarm02.{s}"].constraints.get("FA_IK")
        if con:
            con.mute = True
        for b in self.FK_BONES:
            p = pb[f"{b}.{s}"]; p.rotation_mode = "QUATERNION"; p.rotation_quaternion = (1, 0, 0, 0)
        R.update()
        S, E, W, fold = h["_fk"]
        up_b = pb[f"upperarm01.{s}"]; lo_b = pb[f"lowerarm01.{s}"]

        def rotate_about(p, pivot, q):
            p.matrix = Matrix.Translation(pivot) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pivot) @ p.matrix
            R.update()
        # a) point the upper arm (shoulder -> elbow)
        sh = R.world_head(rig, f"upperarm01.{s}")
        rotate_about(up_b, sh, (R.world_head(rig, f"lowerarm01.{s}") - sh).rotation_difference(E - S))
        # b) roll it about its own length so the elbow hinge folds the forearm toward `fold` (real humeral rotation,
        #    continuous because `fold` is continuous)
        du = (E - S).normalized()
        el = R.world_head(rig, f"lowerarm01.{s}")
        f_cur = R.world_head(rig, f"wrist.{s}") - el
        fp = f_cur - du * f_cur.dot(du)
        if fp.length > 1e-6:
            ang = fp.normalized().angle(fold)
            if fp.normalized().cross(fold).dot(du) < 0:
                ang = -ang
            rotate_about(up_b, sh, Quaternion(du, ang))
        # c) bend the elbow about its hinge only
        el = R.world_head(rig, f"lowerarm01.{s}")
        rotate_about(lo_b, el, (R.world_head(rig, f"wrist.{s}") - el).rotation_difference(W - E))
        # hand orientation and the dumbbell from the wrist we actually reached
        wr = R.world_head(rig, f"wrist.{s}"); el = R.world_head(rig, f"lowerarm01.{s}")
        axis = (T.to_3x3() @ Vector(h["axis"])).normalized()
        Gw = R.frame_from(Vector((0, 0, 0)), axis, el - wr)
        Ginv = self.G[s].inverted()
        Rg = Gw.to_3x3()
        c = wr - Rg @ Ginv.translation
        Gw.translation = c
        Wm = Gw @ Ginv
        hand = self.ctl[f"hand.{s}"]; hand.location = Wm.translation; hand.rotation_quaternion = Wm.to_quaternion()
        prop = self.props.get(h.get("prop", ""))
        if prop is not None:
            prop.matrix_world = R.frame_from(c, axis if s == "L" else -axis, T.to_3x3() @ Vector((0, 0, 1)))
        R.update()
        # forearm pronation lives in the forearm (radius over ulna), not the wrist joint: hand most of the wrist's
        # spin to the forearm twist bone so the skin twists along the forearm instead of snapping at the wrist
        w = pb[f"wrist.{s}"]
        rest = w.parent.bone.matrix_local.inverted() @ w.bone.matrix_local
        q = (rest.inverted() @ (w.parent.matrix.inverted() @ w.matrix)).to_quaternion()
        tw = 2 * math.atan2(q.y, q.w)
        tw = (tw + math.pi) % (2 * math.pi) - math.pi
        pb[f"lowerarm02.{s}"].rotation_quaternion = Quaternion((0, 1, 0), tw * 0.85)
        R.update()

    def arm_lengths(self):
        if not hasattr(self, "_len"):
            B = self.rig.data.bones
            L1 = (B["lowerarm01.L"].head_local - B["upperarm01.L"].head_local).length
            L2 = (B["wrist.L"].head_local - B["lowerarm01.L"].head_local).length
            self._len = (L1, L2, self.G["L"].translation.length)
        return self._len

    def resolve_arms(self, pose, T):
        """hands.<s>.arm = {elev, plane, elbow, bend | fore_world} (degrees, torso frame, side-local: plane 0 = out to the
        side, +90 = forward, negative = behind). Turns joint angles into the handle position and the elbow pole."""
        L1, L2, hoff = self.arm_lengths()
        Ti = T.inverted(); R3 = Ti.to_3x3()
        for s, h in pose.get("hands", {}).items():
            a = h.get("arm")
            if not a:
                continue
            sx = 1.0 if s == "L" else -1.0
            S = Ti @ R.world_head(self.rig, f"upperarm01.{s}")
            e = math.radians(a["elev"]); p = math.radians(a["plane"])
            du = Vector((sx * math.sin(e) * math.cos(p), math.sin(e) * math.sin(p), -math.cos(e)))
            E = S + du * L1
            if "fore_world" in a:
                fore = (R3 @ Vector(a["fore_world"])).normalized()
                bperp = (fore - du * fore.dot(du))
                bperp = bperp.normalized() if bperp.length > 1e-6 else Vector((0, 1, 0))
            else:
                if "bend_world" in a:      # bend toward a WORLD direction (e.g. straight up for presses)
                    b = R3 @ Vector(a["bend_world"])
                else:
                    b = Vector(a.get("bend", (0, 1, 0))); b.x *= sx
                # when the upper arm points almost along b (arm straight up in a press) the fold direction is undefined
                # and flips; ease toward a fallback (torso frame: toward the midline and the head) instead
                b_raw = b.normalized()
                bp = b_raw - du * b_raw.dot(du)
                fb = Vector(a.get("bend_fallback", (-0.6, 0.0, 0.8))); fb.x *= sx
                fbp = (fb - du * fb.dot(du)).normalized()
                wgt = min(1.0, bp.length / 0.35)
                b = (bp.normalized() * wgt + fbp * (1 - wgt)) if bp.length > 1e-6 else fbp
                if a.get("elbow") == "fore_vertical":   # pick the bend that makes the forearm point exactly along b
                    a = dict(a, elbow=math.degrees(du.angle(b_raw)))
                bperp = (b - du * b.dot(du)).normalized()
                k = math.radians(a.get("elbow", 10) if not isinstance(a.get("elbow"), str) else 10)
                fore = (du * math.cos(k) + bperp * math.sin(k)).normalized()
            Wr = E + fore * L2
            h["at"] = list(Wr + fore * hoff)
            h["_fk"] = (T @ S, T @ E, T @ Wr, (T.to_3x3() @ bperp).normalized())   # world; used by pose_arm_fk
            # elbow pole: aim it at the elbow the angles ask for (away from the shoulder-wrist line), so the IK lands the
            # elbow there. When the arm is nearly straight that direction vanishes and flips sides, and the solver rolls
            # the whole upper arm over (seen: 114 deg shoulder twist). "pole" (torso frame, x = outward) is the tie-break.
            line = Wr - S; tpar = (E - S).dot(line) / max(1e-9, line.length_squared)
            away = E - (S + line * tpar)
            hint = Vector(a.get("pole", (0, 0, 0))); hint.x *= sx
            if hint.length > 0:
                hint.normalize()
                if away.length < 0.04:
                    away = hint * 0.04 + away       # straight arm: lean on the fixed hint
                elif away.dot(hint) < 0:
                    away = -away                    # never let the pole cross to the other side
            elif away.length < 1e-4:
                away = -bperp
            pose.setdefault("elbows", {})[s] = list(E + away.normalized() * 0.45)

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
        fk = any("arm" in h for p in self.spec["poses"].values() for h in p.get("hands", {}).values())
        fk_bones = [f"{b}.{s}" for b in self.FK_BONES for s in R.SIDES] if fk else []
        animated = [o for o in self.ctl.values()] + list(self.props.values())
        for f in range(n):
            scene.frame_set(f)
            self.apply(self.pose_at(f / fps, keys, cache))
            pb["root"].keyframe_insert("location", frame=f); pb["root"].keyframe_insert("rotation_quaternion", frame=f)
            for b in bone_names:
                if b in pb:
                    pb[b].keyframe_insert("rotation_euler", frame=f)
            for b in fk_bones:
                pb[b].keyframe_insert("rotation_quaternion", frame=f)
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
        w = self.spec.get("highlight")   # research-based per-muscle strengths; falls back to primary/secondary
        MU.set_highlight(self.ch["body"], prim, sec, weights=w)
        MU.set_highlight(self.ch["shorts"], prim, sec, weights=w)


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
