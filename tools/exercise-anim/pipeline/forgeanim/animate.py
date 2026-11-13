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
        self._fist = {}; self._gax = {}  # grip centre and handle axis per hand (world), for place_bars
        self._palm = {}; self._flex_used = {}  # palm-side direction (world) and wrist bend (deg) per hand, for the report
        # hand shapes (fist / flat / cup / relaxed) are keyed per frame only when a recipe uses them
        self._shapes = any("hand" in h for p in spec.get("poses", {}).values() for h in p.get("hands", {}).values())

    # ---------------- scene ----------------
    def build_props(self):
        sc = self.spec.get("scene", {})
        if "bench" in sc:
            b = sc["bench"]
            kw = {k: b[k] for k in ("style", "seat_h", "back_len", "seat_len") if k in b}
            self.bench = P.incline_bench(b.get("deg", 35.0), **kw)
            self.bench["root"].location = Vector(b.get("loc", (0, 0, 0)))
            if b.get("rot_z"):
                self.bench["root"].rotation_euler = (0, 0, math.radians(b["rot_z"]))
        # "box": {"size": [x, y, z], "loc": [x, y, 0]} -> a plain step / plyo box / wall block (exercise pictures)
        for i, bx in enumerate(sc.get("boxes", [sc["box"]] if "box" in sc else [])):
            ob = P.box(tuple(bx.get("size", (0.6, 0.4, 0.3))), name=f"FA_Box{i}")
            ob.location = Vector(bx.get("loc", (0, 0, 0)))
            self.boxes = getattr(self, "boxes", []) + [ob]
        # "cables": [{"loc": [x, y], "pulley_h": 1.9, "face": [fx, fy], "height": 2.15}] -> cable columns; face = the
        # way the pulley looks (toward the athlete). Pulley height: high ~1.9-2.0, chest ~1.2, shoulder ~1.45, low ~0.15.
        self.columns = []; self.cables = {}
        for i, c in enumerate(sc.get("cables", [])):
            col = P.cable_column(f"FA_Column{i}", c.get("pulley_h", 1.9), c.get("height", 2.15), tuple(c.get("face", (0, -1))),
                                 c.get("grab"))
            x, y = c["loc"][0], c["loc"][1]
            col["root"].location = Vector((x, y, 0))
            col["pulley"] = Vector((x, y, 0)) + col["pulley_local"]
            grab = ""
            col["anchor"] = c.get("anchor"); col["grab_z"] = c.get("grab", [0, 0])[:2]
            if "grab_local" in col:
                col["grab"] = Vector((x, y, 0)) + col["grab_local"]
                grab = f", hand grip centre at {[round(v, 3) for v in col['grab']]}"
            self.columns.append(col)
            print(f"[cable] column {i}: post at ({x:.2f}, {y:.2f}), pulley at {[round(v, 3) for v in col['pulley']]}{grab}")
        if "preacher" in sc:
            # "preacher": {"seat_h": 0.6, "pad_top": [y, z], "pad_deg": 45, "loc": [x, y, 0]} (13 Nov 2026)
            pr = sc["preacher"]
            kw = {k: (tuple(v) if isinstance(v, list) else v) for k, v in pr.items() if k in ("seat_h", "pad_top", "pad_deg", "pad_len", "pad_w")}
            self.preacher = P.preacher_bench(**kw)
            self.preacher["root"].location = Vector(pr.get("loc", (0, 0, 0)))
            self.extras = getattr(self, "extras", []) + [self.preacher["root"]]
        for name, p in self.spec.get("props", {}).items():
            if p["type"] == "dumbbell":
                self.props[name] = P.dumbbell("FA_" + name)
            elif p["type"] == "ez_bar":
                # "bar": {"type": "ez_bar", "plates": [0.2]}: hands on the angled grips (props.EZ_GRIPS) (13 Nov 2026)
                kw = {k: (tuple(v) if isinstance(v, list) else v) for k, v in p.items() if k in ("plates", "plate_t", "sleeve")}
                self.props[name] = P.ez_bar("FA_" + name, **kw)
            elif p["type"] == "trap_bar":
                kw = {k: (tuple(v) if isinstance(v, list) else v) for k, v in p.items() if k in ("handle_gap", "plates", "plate_t")}
                self.props[name] = P.trap_bar("FA_" + name, **kw)
            elif p["type"] == "landmine":
                # "lm": {"type": "landmine", "pivot": [x, y, z], "grip_from_tip": 0.1}: one bar end in a floor pivot, the
                # hand(s) on the loaded end; the bar runs from the pivot through the fist(s) every frame
                kw = {k: (tuple(v) if isinstance(v, list) else v) for k, v in p.items() if k in ("grip_from_tip", "plates", "plate_t")}
                self.props[name], self._lm_len = P.landmine_bar("FA_" + name, **kw)
                self._lm_tube, base = P.landmine_base("FA_" + name + "Pivot")
                base.location = Vector(p["pivot"])
                self.extras = getattr(self, "extras", []) + [self._lm_tube, base]
            elif p["type"] == "handle":
                # machine handle that follows the hand (13 Nov 2026); levers to the machine are "machine" parts
                self.props[name] = P.handle("FA_" + name, p.get("length", 0.13))
            elif p["type"] == "barbell":
                # "bar": {"type": "barbell", "shaft": 1.31, "sleeve": 0.42, "plates": [0.225]} (13 Nov 2026)
                kw = {k: (tuple(v) if isinstance(v, list) else v) for k, v in p.items() if k in ("shaft", "sleeve", "plates", "plate_t")}
                self.props[name] = P.barbell("FA_" + name, **kw)
            elif p["type"] == "cable":
                # "h": {"type": "cable", "handle": "d"|"bar"|"rope"|"ankle", "column": 0, "length": 0.6, "foot": "L"}
                # (13 Nov 2026). Kept out of self.props: place_cables moves it from the fists (or the ankle) every frame.
                self.cables[name] = self.build_cable(name, p)
            else:
                raise ValueError("unknown prop " + p["type"])
        # "skin": {"preserve_volume": true} -> dual-quaternion skinning on the body (recipe option; off by default so
        # approved clips render exactly as they were)
        if self.spec.get("skin", {}).get("preserve_volume"):
            for ob in (self.ch["body"], self.ch["shorts"]):
                for m in ob.modifiers:
                    if m.type == "ARMATURE":
                        m.use_deform_preserve_volume = True
        if self.spec.get("skin", {}).get("calm_armpits"):
            self.calm_armpits(self.spec["skin"]["calm_armpits"])
        R.set_grip(self.rig, 1.0, 1.0)
        self.G = {s: R.measure_grip(self.rig, s) for s in R.SIDES}
        self.Gphi = {s: R.grip_forearm_angle(self.rig, s, self.G[s]) for s in R.SIDES}

    def calm_armpits(self, cfg):
        """Recipe option "skin": {"calm_armpits": {"amount": .., "radius": .., "fade": ..}}: with the arm overhead the
        armpit skin stretches to ~2-3x its rest area, and the painted muscle grooves and the normal-map detail there
        smear into dark streaks and putty-like blur (fresh reviewer, v8 shoulder press). Real armpit skin is smooth, so
        raise the existing fa_flat attribute (which already calms the face) around each armpit hollow."""
        import numpy as np
        from . import character
        body = self.ch["body"]; rig = self.rig
        cfg = cfg if isinstance(cfg, dict) else {"amount": float(cfg)}
        amt = cfg.get("amount", 0.7); rad = cfg.get("radius", 0.07); fade = cfg.get("fade", 0.06)
        pos = np.array([tuple(p) for p in character.rest_positions(body)])
        me = body.data
        flat = np.zeros(len(me.vertices), np.float32); me.attributes["fa_flat"].data.foreach_get("value", flat)
        mw = rig.matrix_world
        calm = None
        for s in R.SIDES:
            sx = 1.0 if s == "L" else -1.0
            J = np.array(tuple(mw @ rig.data.bones[f"upperarm01.{s}"].head_local))
            # armpit hollow, relative to the shoulder joint (rest A-pose): `apex` m inward, forward, down; "extra" adds
            # more spots the same way (e.g. the back of the armpit, where the rear shoulder meets the back)
            for ax, ay, az, *amt2 in [tuple(cfg.get("apex", (-0.05, 0.01, -0.10)))] + [tuple(e) for e in cfg.get("extra", [])]:
                apex = J + np.array([sx * ax, ay, az])
                k = self._calm_spot(pos, apex, cfg, rad, fade, s)
                flat = np.maximum(flat, (k * (amt2[0] if amt2 else amt)).astype(np.float32))
                calm = k if calm is None else np.maximum(calm, k)
        me.attributes["fa_flat"].data.foreach_set("value", flat)
        # the front-shoulder mask's lower edge runs into the armpit; overhead it reads as a red blob in the armpit
        # ("teaches the wrong muscle", reviewer 2). highlight() fades the red there by `hl_cut`.
        self._calm_k = calm

    @staticmethod
    def _calm_spot(pos, apex, cfg, rad, fade, s):
        """0..1 weight inside a vertical capsule from `apex` down `down` m (the grooves smear down the ribs too)."""
        import numpy as np
        down = cfg.get("down", 0.08)
        d = pos - apex
        dz = np.clip(d[:, 2], -down, 0.0)
        dist = np.sqrt(d[:, 0] ** 2 + d[:, 1] ** 2 + (d[:, 2] - dz) ** 2)
        k = np.clip(1.0 - (dist - rad) / fade, 0.0, 1.0)
        k = k * k * (3 - 2 * k)
        print(f"[forgeanim] calm armpit {s}: apex {np.round(apex, 3).tolist()}, {int((k > 0.5).sum())} verts")
        return k

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
        self.apply_girdle(pose)
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
                off = frame.to_3x3() @ Vector(h.get("prop_offset", (0, 0, 0)))   # weight off the fist centre (two hands)
                prop.matrix_world = R.frame_from(c + off, axis if s == "L" else -axis, up)
            R.place_hand(rig, s, c, axis, self.G[s])
            self._fist[s] = c.copy(); self._gax[s] = axis.copy()
        if self._shapes:
            for s in pose.get("hands", {}):
                R.set_hand(rig, s, pose["hands"][s].get("hand", "fist"))
        R.update()
        if pose.get("rest_on_palms"):
            self.rest_on_palms(pose["rest_on_palms"])
        self.place_feet_props()
        self.place_bars(pose, T)
        self.place_cables(pose, T)
        self.update_machine()

    def palm_point(self, s):
        """Centre of the palm skin (world): the mean of the wrist and the four knuckle joints, pushed out of the palm
        side by the palm's thickness."""
        rig = self.rig
        pts = [R.world_head(rig, f"finger{k}-1.{s}") for k in (2, 3, 4, 5)] + [R.world_head(rig, f"wrist.{s}")]
        c = sum(pts, Vector()) / len(pts)
        n = self._palm.get(s)
        return c + n * 0.016 if n is not None else c

    def rest_on_palms(self, rp):
        """Pose option "rest_on_palms" (13 Nov 2026): {"prop": "db_L", "drop": 0.082} stands the prop upright (handle
        along world Z) between both palms, its top plate's underside `drop` m above its centre resting on the palms
        (waiter curl). The hands' prop links are ignored for this prop."""
        prop = self.props.get(rp["prop"])
        if prop is None:
            return
        pl, pr = self.palm_point("L"), self.palm_point("R")
        mid = (pl + pr) / 2
        top = max(pl.z, pr.z)
        up = Vector((0, 0, 1))
        c = Vector((mid.x, mid.y, top - rp.get("drop", 0.082)))
        prop.matrix_world = R.frame_from(c, up, Vector((0, 1, 0)))
        R.update()
        nz = {s: round(self._palm[s].z, 2) for s in ("L", "R") if s in self._palm}
        print(f"[palms] L {[round(v, 3) for v in pl]} R {[round(v, 3) for v in pr]} gap {round((pl - pr).length, 3)} "
              f"height diff {round(pl.z - pr.z, 3)} palm normal z {nz}")

    def build_cable(self, name, p):
        kind = p.get("handle", "d")
        c = {"kind": kind, "column": p.get("column", 0), "foot": p.get("foot", "L"),
             "line": P.cable_line("FA_" + name + "_Cable"), "rope_len": p.get("rope_len", 0.30)}
        if kind == "d":
            c["obj"] = P.d_handle("FA_" + name)
        elif kind == "bar":
            c["obj"] = P.cable_bar("FA_" + name, p.get("length", 0.60))
        elif kind == "rope":
            c["obj"] = P.rope_parts("FA_" + name)
        elif kind == "ankle":
            c["obj"] = P.ankle_cuff("FA_" + name)
        else:
            raise ValueError("unknown cable handle " + kind)
        return c

    def cable_movers(self):
        """Every object place_cables moves (keyed with location, rotation and scale in bake)."""
        out = []
        for c in getattr(self, "cables", {}).values():
            out += [c["line"], c["obj"]]
            if c["kind"] == "rope":
                out += [o for o in c["obj"].children if o.type == "EMPTY"]
        return out

    def cable_meshes(self):
        """Every mesh of the cable family (columns, handles, cables) for camera framing."""
        out = []
        for col in getattr(self, "columns", []):
            out += list(col["root"].children)
        for o in self.cable_movers():
            out += [ch for ch in o.children if ch.type == "MESH"]
        return out

    def cable_clearance(self, ev, me):
        """Signed distance (m) from each cable (and rope piece out of the fist) to the body skin, at the current frame:
        negative = the cable runs through the body. The first 4 cm next to the hand or ankle are skipped (the handle sits
        in the fist / the cuff sits on the skin). Returns {name: metres}."""
        from mathutils.bvhtree import BVHTree
        mw = ev.matrix_world
        bvh = BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [p.vertices[:] for p in me.polygons])
        out = {}
        for name, c in self.cables.items():
            segs = [c["line"]]
            if c["kind"] == "rope":
                segs += [o for o in c["obj"].children if o.name.endswith("2")]
            best = 9.0
            for ob in segs:
                M = ob.matrix_world
                a = M @ Vector((0, 0, 0)); b = M @ Vector((0, 0, 1)); L = (b - a).length
                n = max(2, int(L / 0.01))
                for i in range(n + 1):
                    p = a + (b - a) * (i / n)
                    if ob is c["line"] and (p - a).length < 0.04:
                        continue
                    if ob is not c["line"] and (p - a).length < 0.04:
                        continue
                    hit = bvh.find_nearest(p)
                    if hit[0] is None:
                        continue
                    loc, nor, _, d = hit
                    sd = d if (p - loc).dot(nor) >= 0 else -d
                    best = min(best, sd)
            out[name] = round(best, 3)
        return out

    @staticmethod
    def _stretch(ob, a, b):
        """Put a unit-length (local z 0..1) piece from world point a to world point b."""
        d = b - a
        ob.matrix_world = (Matrix.Translation(a) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
                           @ Matrix.Diagonal((1, 1, max(d.length, 1e-4), 1)))

    def place_cables(self, pose, T):
        """Cable attachments sit on the fists (or the ankle) and the cable runs from the attachment's clip point to the
        pulley, so the handle can never miss the hand. Prints the check numbers for the first poses: hand gap, how far
        each grip axis is off the bar, and the cable's length and angle."""
        if not getattr(self, "cables", None):
            return
        rig = self.rig
        # "anchor": "R" on a column with a hand grip: on the first pose the whole column slides (x, y) so its grip runs
        # through that fist's centre, so a support hand is always really holding the machine. The hand must keep the
        # same pose in every picture.
        for i, col in enumerate(self.columns):
            sd = col.get("anchor")
            if sd and "grab" in col and sd in self._fist:
                fc = self._fist[sd]
                if not col.get("anchored"):
                    off = fc - col["grab"]; off.z = 0
                    col["root"].location += off; col["pulley"] += off; col["grab"] += off; col["anchored"] = True
                    print(f"[cable] column {i} moved {[round(v, 3) for v in off]} so its grip runs through the {sd} fist; "
                          f"post now at {[round(v, 3) for v in col['root'].location]}, pulley {[round(v, 3) for v in col['pulley']]}")
                gx = (fc - col["grab"]); gx.z = 0
                z0, z1 = col["grab_z"]
                if getattr(self, "_grip_log", 0) < 4:
                    self._grip_log = getattr(self, "_grip_log", 0) + 1
                    up = Vector((0, 0, 1)); a = self._gax[sd]
                    print(f"[cable] grip check {sd}: fist off the grip line {gx.length * 100:.1f} cm, fist height {fc.z:.3f} "
                          f"(grip {z0}-{z1}), fist axis off vertical {math.degrees(min(a.angle(up), a.angle(-up))):.1f} deg")
        for name, c in self.cables.items():
            Pp = self.columns[c["column"]]["pulley"]
            on = [s for s, h in pose.get("hands", {}).items() if h.get("prop") == name and s in self._fist]
            log = {}
            if c["kind"] == "d":
                if len(on) != 1:
                    continue
                s = on[0]; fc = self._fist[s]; ax = self._gax[s].normalized()
                d = Pp - fc; y = d - ax * d.dot(ax)
                y = y.normalized() if y.length > 1e-6 else (T.to_3x3() @ Vector((0, 0, 1)))
                c["obj"].matrix_world = R.frame_from(fc, ax, y)
                clip_pt = fc + y * P.D_TIP
                log["hand"] = s; log["grip_axis_to_cable_deg"] = round(math.degrees(ax.angle(d)), 1)
            elif c["kind"] == "bar":
                if len(on) != 2:
                    continue
                cl, cr = self._fist["L"], self._fist["R"]
                x = (cl - cr).normalized(); mid = (cl + cr) / 2
                d = Pp - mid; y = (d - x * d.dot(x)).normalized()
                c["obj"].matrix_world = R.frame_from(mid, x, y)
                clip_pt = mid + y * P.BAR_EYE
                log["hand_gap"] = round((cl - cr).length, 3)
                log["grip_off_bar_deg"] = {s: round(math.degrees(min(self._gax[s].angle(x), self._gax[s].angle(-x))), 1)
                                           for s in on if s in self._gax}
            elif c["kind"] == "rope":
                if len(on) != 2:
                    continue
                fist = {s: (self._fist[s], self._gax[s].normalized()) for s in ("L", "R")}
                mid = (fist["L"][0] + fist["R"][0]) / 2
                u = (Pp - mid).normalized()
                kids = {o.name: o for o in c["obj"].children}
                ex = {}
                for s, (fc, ax) in fist.items():
                    sg = 1.0 if ax.dot(u) >= 0 else -1.0     # the index side faces the join; the knob sits past the pinky
                    a = ax * sg
                    ex[s] = fc + a * 0.05
                    self._stretch(kids[f"FA_{name}_Strand{s}"], fc - a * 0.05, ex[s])
                    kids[f"FA_{name}_Knob{s}"].matrix_world = Matrix.Translation(fc - a * 0.072) @ a.to_track_quat("Z", "Y").to_matrix().to_4x4()
                    log[f"rope_through_fist_{s}"] = "index side up" if sg > 0 else "FLIPPED (pinky side faces the join)"
                half = (ex["L"] - ex["R"]).length / 2
                J = (ex["L"] + ex["R"]) / 2 + u * math.sqrt(max(0.0025, c["rope_len"] ** 2 - half ** 2))
                for s in ("L", "R"):
                    self._stretch(kids[f"FA_{name}_Strand{s}2"], ex[s], J)
                    a = (ex[s] - fist[s][0]).normalized()
                    log[f"bend_at_fist_{s}_deg"] = round(math.degrees(a.angle(J - ex[s])), 1)
                kids[f"FA_{name}_Eye"].matrix_world = Matrix.Translation(J + u * 0.02) @ u.to_track_quat("Z", "Y").to_matrix().to_4x4()
                clip_pt = J + u * 0.045
                log["hand_gap"] = round((fist["L"][0] - fist["R"][0]).length, 3)
            elif c["kind"] == "ankle":
                f = c["foot"]
                ank = R.world_head(rig, f"foot.{f}"); knee = R.world_head(rig, f"lowerleg01.{f}")
                sh = (knee - ank).normalized()
                cc = ank + sh * 0.05
                d = Pp - cc; yp = (d - sh * d.dot(sh)).normalized()
                c["obj"].matrix_world = R.frame_from(cc, yp.cross(sh), yp)
                clip_pt = cc + yp * P.CUFF_RING
                log["ankle"] = f
            else:
                continue
            self._stretch(c["line"], clip_pt, Pp)
            if getattr(self, "_cable_log", 0) < 6:
                self._cable_log = getattr(self, "_cable_log", 0) + 1
                d = Pp - clip_pt
                log["cable_len"] = round(d.length, 3)
                log["cable_deg_from_down"] = round(math.degrees(d.angle(Vector((0, 0, -1)))), 1)
                print(f"[cable] {name} ({c['kind']}): {log}")
        R.update()

    def place_bars(self, pose, T):
        """A barbell held by both hands runs through both fist centres (its centre halfway between them), so the bar can
        never miss a hand. With one hand on it, "prop_offset" places it as for a dumbbell. Prints the check numbers:
        hand gap and how far each hand's grip axis is off the bar line (0 = the fist is square on the bar)."""
        for name, p in self.spec.get("props", {}).items():
            if p["type"] not in ("barbell", "ez_bar", "trap_bar", "landmine") or name not in self.props:
                continue
            on = [s for s, h in pose.get("hands", {}).items() if h.get("prop") == name and s in self._fist]
            if p["type"] == "landmine":
                if on:
                    self.place_landmine(name, p, on)
                continue
            if len(on) != 2:
                continue
            cl, cr = self._fist["L"], self._fist["R"]
            x = (cl - cr).normalized()
            hint = T.to_3x3() @ Vector((0, 0, 1))
            seg = None
            if p["type"] in ("ez_bar", "trap_bar") and "L" in self._gax and "R" in self._gax:
                # the grips are not along the bar line: the bar's own Y comes from the two hands' handle axes
                yl = self._gax["L"] - x * self._gax["L"].dot(x); yr = self._gax["R"] - x * self._gax["R"].dot(x)
                if (yl + yr).length > 1e-3:
                    hint = yl + yr
            self.props[name].matrix_world = R.frame_from((cl + cr) / 2, x, hint)
            M3 = self.props[name].matrix_world.to_3x3()
            if p["type"] == "ez_bar":
                a = math.radians(P.EZ_GRIP_DEG)
                seg = {"L": (M3 @ Vector((math.cos(a), math.sin(a), 0))).normalized(), "R": (M3 @ Vector((-math.cos(a), math.sin(a), 0))).normalized()}
            elif p["type"] == "trap_bar":
                seg = {"L": (M3 @ Vector((0, 1, 0))).normalized(), "R": (M3 @ Vector((0, 1, 0))).normalized()}
            if getattr(self, "_bar_log", 0) < 4:
                self._bar_log = getattr(self, "_bar_log", 0) + 1
                line = seg or {"L": x, "R": x}
                offs = {s: round(math.degrees(min(self._gax[s].angle(line[s]), self._gax[s].angle(-line[s]))), 1) for s in on if s in self._gax}
                print(f"[bar] {name} ({p['type']}): hand gap {(cl - cr).length:.3f} m, grip axis off the handle (deg) {offs}")
        R.update()

    def place_landmine(self, name, p, on):
        """The bar runs from the pivot through the fist(s); its far end slides in the pivot tube. Logs how deep."""
        g = sum((self._fist[s] for s in on), Vector()) / len(on)
        piv = Vector(p["pivot"])
        dvec = g - piv; dist = dvec.length; dvec.normalize()
        up = Vector((0, 0, 1))
        self.props[name].matrix_world = R.frame_from(g, dvec, up)
        self._lm_tube.matrix_world = R.frame_from(piv, dvec, up)
        if getattr(self, "_lm_log", 0) < 4:
            self._lm_log = getattr(self, "_lm_log", 0) + 1
            offs = {s: round(math.degrees(min(self._gax[s].angle(dvec), self._gax[s].angle(-dvec))), 1) for s in on if s in self._gax}
            line_off = {s: round(((self._fist[s] - piv) - dvec * (self._fist[s] - piv).dot(dvec)).length, 3) for s in on}
            print(f"[landmine] {name}: bar end {dist - self._lm_len:+.3f} m from the hinge along the bar (want +0.02..+0.25, "
                  f"inside the tube), bar {math.degrees(math.asin(max(-1.0, min(1.0, dvec.z)))):.1f} deg above the floor, "
                  f"grip axis off the bar (deg) {offs}, fist off the bar line (m) {line_off}")

    def place_feet_props(self):
        """props.<name>.feet = {"fwd": m, "shift": m}: a dumbbell squeezed between the feet (dumbbell leg curl).
        Handle along the shins (knee -> ankle, past the ankle = the sole side), centred between the two ankles, moved
        `fwd` along the feet toward the toes and `shift` along the handle. The feet must be close together."""
        rig = self.rig
        for name, p in self.spec.get("props", {}).items():
            ft = p.get("feet")
            if ft is None or name not in self.props:
                continue
            ank = (R.world_head(rig, "foot.L") + R.world_head(rig, "foot.R")) / 2
            knee = (R.world_head(rig, "lowerleg01.L") + R.world_head(rig, "lowerleg01.R")) / 2
            shin = (ank - knee).normalized()
            toe = sum((R.world_tail(rig, f"foot.{s}") - R.world_head(rig, f"foot.{s}") for s in R.SIDES), Vector())
            toe = (toe - shin * toe.dot(shin)).normalized()
            c = ank + toe * ft.get("fwd", 0.12) + shin * ft.get("shift", 0.0)
            self.props[name].matrix_world = R.frame_from(c, shin, toe)
        R.update()

    FK_BONES = ("upperarm01", "upperarm02", "lowerarm01", "lowerarm02")
    GIRDLE_BONES = ("clavicle", "shoulder01")

    def girdle_angles(self, elev):
        """Scapulohumeral rhythm (research/dumbbell_shoulder_press.json, S8-S11): below `start` deg of arm raise the
        girdle is still; past it the shoulder blade turns upward `ur` deg per deg of raise, the collarbone lifts `elev`
        and draws back `retract` deg per deg. Each is capped. Returns degrees (upward rot, clav elevation, retraction)."""
        g = self.spec["girdle"]
        x = max(0.0, elev - g.get("start", 30.0))
        # soften the knee at `start` so the girdle eases in instead of starting with a kink
        k = g.get("knee", 15.0)
        if k > 0:
            x = (x * x / (2 * k)) if x < k else x - k / 2
        return (min(g.get("ur_max", 55.0), x * g.get("ur", 0.4)),
                min(g.get("elev_max", 25.0), x * g.get("elev", 0.15)),
                min(g.get("retract_max", 15.0), x * g.get("retract", 0.08)))

    def apply_girdle(self, pose):
        """Recipe option "girdle": move the collarbone (clavicle.*) and the shoulder-blade bone (shoulder01.*) with the
        arm, so the shoulder skin is shared between them instead of folding at the armpit when the arm goes overhead.
        Off unless the recipe has "girdle" (approved clips are untouched)."""
        if not self.spec.get("girdle"):
            return
        g = self.spec["girdle"]
        rig = self.rig; pb = rig.pose.bones; mw = rig.matrix_world
        sp = pb["spine01"]
        Rsp = (mw.to_3x3() @ sp.matrix.to_3x3()) @ (mw.to_3x3() @ sp.bone.matrix_local.to_3x3()).inverted()
        A = mw.to_3x3().inverted()
        sca = math.radians(g.get("scap_plane", 30.0))   # shoulder blade's plane: ~30 deg forward of the frontal plane
        for s, h in pose.get("hands", {}).items():
            a = h.get("arm")
            if not a:
                continue
            sx = 1.0 if s == "L" else -1.0
            ur, ce, cr = self.girdle_angles(a["elev"])
            for b in self.GIRDLE_BONES:
                p = pb[f"{b}.{s}"]; p.rotation_mode = "QUATERNION"; p.rotation_quaternion = (1, 0, 0, 0)
                p.location = (0, 0, 0)
            R.update()

            def turn(bone, axis_rest_world, deg, pivot=0.0):
                p = pb[f"{bone}.{s}"]
                ax = (A @ (Rsp @ Vector(axis_rest_world))).normalized()
                piv = p.head + (p.tail - p.head) * pivot
                q = Quaternion(ax, math.radians(deg))
                p.matrix = Matrix.Translation(piv) @ q.to_matrix().to_4x4() @ Matrix.Translation(-piv) @ p.matrix
                R.update()
            # collarbone: lateral end up (about the forward axis) and back (about the vertical axis)
            turn("clavicle", (0, -sx, 0), ce)
            turn("clavicle", (0, 0, sx), cr)
            # shoulder blade: upward rotation in its own plane (axis = the plane's normal). This rig's shoulder01 starts at
            # the middle of the collarbone, not at the AC joint; turning it about its head lifted the shoulder joint 10 cm
            # (a huge shrug). A real blade turns about an axis that moves out to the AC joint late in the raise, so the
            # socket itself rises only a little: pivot `ur_pivot` of the way from the bone's head to the joint.
            turn("shoulder01", (math.sin(sca), -sx * math.cos(sca), 0), ur, g.get("ur_pivot", 0.8))

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
        G0 = R.frame_from(Vector((0, 0, 0)), axis, el - wr)
        Ginv = self.G[s].inverted()
        hand = self.ctl[f"hand.{s}"]; prop = self.props.get(h.get("prop", ""))

        def place(theta, tilt=0.0, flex=0.0):
            # tilt: the handle slants up to ~17 deg off square to the forearm, as it does in a real fist
            Gw = G0 @ Matrix.Rotation(tilt, 4, "Z") @ Matrix.Rotation(theta, 4, "X")   # then turn about the handle
            c = wr - Gw.to_3x3() @ Ginv.translation
            Gw.translation = c
            if flex:
                # wrist bend (13 Nov 2026): turn the whole hand (and what it holds) about the wrist joint, about the axis
                # across the wrist: + = flexion (palm toward the forearm), - = extension (back of the hand toward it)
                k, pdir = self._flex_axis(wr, el, c)
                Gw = Matrix.Translation(wr) @ Matrix.Rotation(flex, 4, k) @ Matrix.Translation(-wr) @ Gw
                c = Gw.translation.copy()
                self._palm[s] = (Matrix.Rotation(flex, 3, k) @ pdir).normalized()
            else:
                self._palm[s] = self._flex_axis(wr, el, c)[1]
            ax_w = Gw.to_3x3().col[0]
            Wm = Gw @ Ginv
            self._fist[s] = c.copy(); self._gax[s] = ax_w.copy()
            hand.location = Wm.translation; hand.rotation_quaternion = Wm.to_quaternion()
            if prop is not None:
                # "prop_offset" (torso frame, m): the weight sits off the fist centre, e.g. a waiter curl holds an
                # upright dumbbell under its top plate with the handle between the two fists
                off = T.to_3x3() @ Vector(h.get("prop_offset", (0, 0, 0)))
                prop.matrix_world = R.frame_from(c + off, ax_w if s == "L" else -ax_w, T.to_3x3() @ Vector((0, 0, 1)))
            R.update()
            return self._wrist_off_rest(s)

        # straight wrist: turn the hand about the handle by the rest offset (the fist centre sits on the palm side of
        # the forearm line; aiming at it cocked the incline wrist ~20 deg). arm.tilt (deg, interpolated) slants the
        # handle off square to the forearm as a real fist does; pick it with the wrist check, never per frame
        # (a per-frame search made the dumbbell pop between two answers).
        tilt = math.radians(h.get("arm", {}).get("tilt", 0.0))
        flex = h.get("arm", {}).get("flex", 0.0)
        if isinstance(flex, str):
            # "level-" / "level+": bend the wrist back (-) or forward (+) until the hand's length (wrist -> middle
            # knuckle) is level with the floor: a flat palm on the floor (push-up, plank) or palms up under a plate
            place(-self.Gphi[s], tilt)
            flex = self._level_flex(s, wr, el, flex.endswith("+"))
        place(-self.Gphi[s], tilt, math.radians(flex))
        self._flex_used[s] = round(flex, 1)
        # forearm pronation lives in the forearm (radius over ulna), not the wrist joint: hand most of the wrist's
        # spin to the forearm twist bone so the skin twists along the forearm instead of snapping at the wrist
        w = pb[f"wrist.{s}"]
        rest = w.parent.bone.matrix_local.inverted() @ w.bone.matrix_local
        q = (rest.inverted() @ (w.parent.matrix.inverted() @ w.matrix)).to_quaternion()
        tw = 2 * math.atan2(q.y, q.w)
        tw = (tw + math.pi) % (2 * math.pi) - math.pi
        pb[f"lowerarm02.{s}"].rotation_quaternion = Quaternion((0, 1, 0), tw * 0.85)
        R.update()

    @staticmethod
    def _flex_axis(wr, el, c):
        """Axis across the wrist (k) and the palm side (p, perpendicular to the forearm, toward the fist centre).
        Turning the forearm direction about k by +angle moves it toward p: flexion."""
        d = (wr - el).normalized()
        p = c - wr; p = p - d * p.dot(d)
        p = p.normalized() if p.length > 1e-6 else Vector((0, 0, 1))
        return d.cross(p).normalized(), p

    def _level_flex(self, s, wr, el, plus):
        """Degrees of wrist bend that make the hand (wrist -> middle knuckle) level with the floor."""
        rig = self.rig
        h0 = R.world_head(rig, f"finger3-1.{s}") - R.world_head(rig, f"wrist.{s}")
        k, _ = self._flex_axis(wr, el, self._fist[s])
        best = None
        prev = None
        for i in range(-300, 301):
            th = math.radians(i * 0.5)
            z = (Matrix.Rotation(th, 3, k) @ h0).z
            if prev is not None and (prev[1] <= 0) != (z <= 0):
                t0, z0 = prev
                root = t0 + (th - t0) * (z0 / (z0 - z)) if z0 != z else th
                if (root > 0) == plus and (best is None or abs(root) < abs(best)):
                    best = root
            prev = (th, z)
        if best is None:
            print(f"[hand] {s}: no wrist bend makes the hand level; kept straight")
            return 0.0
        return math.degrees(best)

    def _wrist_off_rest(self, s):
        """Angle (rad) between the forearm line seen from the hand now and with the wrist at rest: 0 = neutral wrist."""
        pb = self.rig.pose.bones; b = self.rig.data.bones
        d = pb[f"wrist.{s}"].matrix.to_3x3().inverted() @ pb[f"lowerarm02.{s}"].matrix.to_3x3().col[1]
        d0 = b[f"wrist.{s}"].matrix_local.to_3x3().inverted() @ b[f"lowerarm02.{s}"].matrix_local.to_3x3().col[1]
        return d.angle(d0)

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

    # ---------------- machines (13 Nov 2026, exercise pictures) ----------------
    # "machine": {"parts": [...]}. Each part is a plain box / cylinder / rod (props.part) or a template ("stack").
    # Points (P) in a part are one of:
    #   [x, y, z]                     world
    #   "fist.L@start"                fist centre of that hand in that pose (from a pre-pass that applies every pose)
    #   "bone:foot.L@end" / "tail:..." head / tail of a bone in that pose;  "prop:h_L@start" a prop's origin
    #   "body:-y:z=1.2~0.05:x=0~0.15@start"  the body skin point furthest along -y inside those bands
    #   {"a": P, "off": [dx, dy, dz]} offset;  {"mid": [P, P]};  {"xyz": [P|num, P|num, P|num]} one axis from each
    #   {"bisect": [P1, P2], "near": P} the point nearest `near` that is equally far from P1 and P2 (a lever pivot:
    #                                   the lever is the same length at the start and at the end)
    #   moving points (the part moves every frame): {"fist": "L"}, {"bone": "foot.L"}, {"tail": "foot.L"},
    #                                   {"prop": "h_L", "loc": [lx, ly, lz]} (a point in the prop's own frame), + "off"
    # Part: {"shape": "box"|"cyl", "size": [...], "at": P, "rot": [deg x, y, z]} or {"shape": "rod", "size": [r],
    #   "a": P, "b": P, "ext": [m past a, m past b]}; "mat": frame|pad|chrome|iron|rubber; "mirror": true adds the
    #   right-side copy (a static point is mirrored x -> -x, a moving point swaps L/R). {"template": "stack", "at": P,
    #   "h": 1.5, "rot_z": deg} = a weight stack. Rods print their length and tilt; moving rods print their length at
    #   every key pose (a lever must keep its length).
    def _scan_anchors(self, x, out):
        if isinstance(x, str) and "@" in x:
            out.add(x)
        elif isinstance(x, dict):
            for v in x.values():
                self._scan_anchors(v, out)
        elif isinstance(x, list):
            for v in x:
                self._scan_anchors(v, out)

    def _eval_anchor(self, a):
        what, pose = a.rsplit("@", 1)
        rig = self.rig
        if what.startswith("fist."):
            return self._fist[what[5:]].copy()
        if what.startswith("bone:"):
            return R.world_head(rig, what[5:]).copy()
        if what.startswith("tail:"):
            return R.world_tail(rig, what[5:]).copy()
        if what.startswith("prop:"):
            return self.props[what[5:]].matrix_world.translation.copy()
        if what.startswith("propx:"):          # "propx:h_L:0.09,0,0@start" = a point in the prop's own frame
            _, nm, loc = what.split(":")
            return self.props[nm].matrix_world @ Vector([float(v) for v in loc.split(",")])
        if what.startswith("body:"):
            import numpy as np
            parts = what.split(":")[1:]
            d = parts[0]; sign = -1.0 if d[0] == "-" else 1.0; ax = "xyz".index(d[-1])
            dg = bpy.context.evaluated_depsgraph_get(); dg.update()
            ev = self.ch["body"].evaluated_get(dg); me = ev.to_mesh()
            P_ = np.array([tuple(ev.matrix_world @ v.co) for v in me.vertices]); ev.to_mesh_clear()
            keep = np.ones(len(P_), bool)
            for f in parts[1:]:
                k, rng = f.split("="); c, h = (float(v) for v in rng.split("~"))
                keep &= np.abs(P_[:, "xyz".index(k)] - c) <= h
            Q = P_[keep]
            if not len(Q):
                raise ValueError("no body point inside " + a)
            return Vector(tuple(Q[int(np.argmax(sign * Q[:, ax]))]))
        raise ValueError("unknown anchor " + a)

    def _P(self, P, mirror_side=False):
        """Static point -> world Vector (a number stays a number, for "xyz")."""
        if isinstance(P, (int, float)):
            return P
        if isinstance(P, str):
            v = self.anchors[P].copy()
        elif isinstance(P, list):
            v = Vector(P)
        elif "a" in P:
            v = self._P(P["a"])
        elif "mid" in P:
            v = (self._P(P["mid"][0]) + self._P(P["mid"][1])) / 2
        elif "mirror" in P:
            v = mirror(self._P(P["mirror"]))
        elif "xyz" in P:
            c = [self._P(q) for q in P["xyz"]]
            v = Vector([q if isinstance(q, (int, float)) else q[i] for i, q in enumerate(c)])
        elif "bisect" in P:
            A_, B_ = self._P(P["bisect"][0]), self._P(P["bisect"][1]); nr = self._P(P["near"])
            nrm = (B_ - A_).normalized(); M_ = (A_ + B_) / 2
            v = nr - nrm * (nr - M_).dot(nrm)
        else:
            raise ValueError(f"bad point {P}")
        if isinstance(P, dict):
            v = v + Vector(P.get("off", (0, 0, 0)))
        return mirror(v) if mirror_side else v

    @staticmethod
    def _is_dyn(P):
        return isinstance(P, dict) and (any(k in P for k in ("fist", "bone", "tail", "prop", "along")) or ("a" in P and Clip._is_dyn(P["a"])))

    def _Pd(self, P):
        """Moving point -> world Vector now."""
        if "a" in P:
            return self._Pd(P["a"]) + Vector(P.get("off", (0, 0, 0)))
        off = Vector(P.get("off", (0, 0, 0)))
        if "fist" in P:
            return self._fist[P["fist"]] + off
        if "bone" in P:
            return R.world_head(self.rig, P["bone"]) + off
        if "tail" in P:
            return R.world_tail(self.rig, P["tail"]) + off
        if "along" in P:
            # {"along": [bone A, bone B], "t": 0.85, "hinge": [1, 0, 0], "d": 0.07}: the point t of the way from A's head to
            # B's head ("tail:<bone>" = its tail), moved d m off the limb toward hinge x limb (the back of a shin for a
            # knee hinge along +x). For pads that ride on a limb (leg-curl roller, knee pad).
            ends = [R.world_tail(self.rig, n[5:]) if n.startswith("tail:") else R.world_head(self.rig, n) for n in P["along"]]
            d = ends[1] - ends[0]
            side = Vector(P.get("hinge", (1, 0, 0))).cross(d)
            side = side.normalized() if side.length > 1e-9 else Vector((0, 0, 0))
            return ends[0] + d * P.get("t", 0.5) + side * P.get("d", 0.0) + off
        return self.props[P["prop"]].matrix_world @ Vector(P.get("loc", (0, 0, 0))) + off

    @staticmethod
    def _mirror_dyn(P):
        P = json.loads(json.dumps(P))
        if "a" in P:
            P["a"] = Clip._mirror_dyn(P["a"])
        if "off" in P:
            P["off"] = [-P["off"][0], P["off"][1], P["off"][2]]
        if "fist" in P:
            P["fist"] = {"L": "R", "R": "L"}[P["fist"]]
        sw = lambda n: n[:-2] + {".L": ".R", ".R": ".L"}.get(n[-2:], n[-2:])
        for k in ("bone", "tail"):
            if k in P:
                P[k] = sw(P[k])
        if "along" in P:
            P["along"] = [sw(n) for n in P["along"]]
        if "prop" in P:
            P["prop"] = P["prop"][:-2] + {"_L": "_R", "_R": "_L"}.get(P["prop"][-2:], P["prop"][-2:])
            if "loc" in P:
                P["loc"] = [-P["loc"][0], P["loc"][1], -P["loc"][2]]
        return P

    def _pt(self, P, side):
        """(is_moving, resolver) for a part point; side "R" = the mirrored copy."""
        if self._is_dyn(P):
            Q = self._mirror_dyn(P) if side == "R" else P
            return True, (lambda: self._Pd(Q))
        v = self._P(P, mirror_side=(side == "R"))
        return False, (lambda: v)

    def build_machine(self):
        cfg = self.spec["machine"]
        need = set(); self._scan_anchors(cfg, need)
        self.anchors = {}
        poses = sorted(set(self.spec["poses"]))
        for pn in poses:
            self.apply(self.full_pose(pn)); R.update()
            for a in need:
                if a.endswith("@" + pn):
                    self.anchors[a] = self._eval_anchor(a)
            fl = self._fist.get("L"); fr = self._fist.get("R")
            print(f"[machine] pose {pn}: fist L {tuple(round(c, 3) for c in fl) if fl else None} "
                  f"R {tuple(round(c, 3) for c in fr) if fr else None} root {tuple(round(c, 3) for c in R.world_head(self.rig, 'root'))}")
        for a in sorted(need):
            print(f"[machine] anchor {a} = {tuple(round(c, 3) for c in self.anchors[a])}")
        self.machine_objs = []; self.machine_dyn = []
        for i, pt in enumerate(cfg.get("parts", [])):
            for side in (("L", "R") if pt.get("mirror") else ("L",)):
                self._build_part(f"FA_M{i}{side if pt.get('mirror') else ''}", pt, side)
        self.update_machine()

    def _build_part(self, name, pt, side):
        sx = -1.0 if side == "R" else 1.0
        if pt.get("template") == "stack":
            ob = P.weight_stack(name, h=pt.get("h", 1.55))
            ob.location = self._P(pt["at"], mirror_side=(side == "R"))
            ob.rotation_euler = (0, 0, math.radians(sx * pt.get("rot_z", 0)))
            self.machine_objs += list(ob.children)
            return
        shape = pt["shape"]
        ob = P.part(name, shape, pt.get("size", [0.03]), pt.get("mat", "frame"), pt.get("bevel"))
        self.machine_objs.append(ob)
        rot = pt.get("rot", [0, 0, 0]); rot = [rot[0], sx * rot[1], sx * rot[2]]
        Rm = Euler([math.radians(r) for r in rot], "XYZ").to_matrix().to_4x4()
        if shape == "rod":
            ext = pt.get("ext", (0, 0))
            da, fa = self._pt(pt["a"], side); db, fb = self._pt(pt["b"], side)

            def place(ob=ob, fa=fa, fb=fb, ext=ext):
                a, b = fa(), fb(); d = b - a
                if d.length < 1e-6:
                    d = Vector((0, 0, 1e-3))
                u = d.normalized(); a = a - u * ext[0]; b = b + u * ext[1]; d = b - a
                ob.matrix_world = Matrix.Translation((a + b) / 2) @ u.to_track_quat("Y", "Z").to_matrix().to_4x4() @ Matrix.Diagonal((1, d.length, 1, 1))
                return d.length, math.degrees(u.angle(Vector((0, 0, 1))))
            if da or db:
                self.machine_dyn.append({"ob": ob, "place": place, "name": name, "check": pt.get("check", True)})
            else:
                ln, tilt = place()
                print(f"[machine] rod {name}: length {ln:.3f} m, {tilt:.1f} deg off vertical")
            return
        dyn, f = self._pt(pt["at"], side)

        def place(ob=ob, f=f, Rm=Rm):
            ob.matrix_world = Matrix.Translation(f()) @ Rm
            return None
        if dyn:
            self.machine_dyn.append({"ob": ob, "place": place, "name": name, "check": False})
        else:
            place()

    def update_machine(self):
        for d in getattr(self, "machine_dyn", []):
            d["last"] = d["place"]()

    def log_machine(self, f):
        for d in getattr(self, "machine_dyn", []):
            if d.get("check") and d.get("last"):
                print(f"[machine] frame {f} moving rod {d['name']}: length {d['last'][0]:.3f} m")

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
        if self.spec.get("machine"):
            self.build_machine()
        cache = {}
        key_frames = {min(n - 1, int(round(k[0] * fps))) for k in keys}
        rig = self.rig; pb = rig.pose.bones
        bone_names = set()
        for p in self.spec["poses"].values():
            bone_names |= set(p.get("bones", {}).keys())
        bone_names |= {b[:-2] + ".R" for b in bone_names if b.endswith(".L")}
        fk = any("arm" in h for p in self.spec["poses"].values() for h in p.get("hands", {}).values())
        fk_bones = [f"{b}.{s}" for b in self.FK_BONES for s in R.SIDES] if fk else []
        if self.spec.get("girdle"):
            girdle_bones = [f"{b}.{s}" for b in self.GIRDLE_BONES for s in R.SIDES if f"{b}.{s}" not in bone_names]
            fk_bones += girdle_bones
        else:
            girdle_bones = []
        animated = [o for o in self.ctl.values()] + list(self.props.values())
        movers = self.cable_movers() + [d["ob"] for d in getattr(self, "machine_dyn", [])]   # stretched every frame, so their scale is keyed too
        if hasattr(self, "_lm_tube"):
            animated.append(self._lm_tube)   # the landmine tube turns with the bar
        finger_bones = [f"{b}.{s}" for b in R.FINGER_BONES for s in R.SIDES if f"{b}.{s}" in pb] if self._shapes else []
        self.ground_poses(cache)
        for f in range(n):
            scene.frame_set(f)
            self.apply(self.pose_at(f / fps, keys, cache))
            # MPFB sets every bone to XYZ euler, so keying only rotation_quaternion dropped the root's turn: every frame
            # rendered with the LAST pose's lean (sissy squat end stood upright, 12 Nov 2026). Key the channel in use.
            pb["root"].keyframe_insert("location", frame=f)
            pb["root"].keyframe_insert("rotation_quaternion" if pb["root"].rotation_mode == "QUATERNION" else "rotation_euler", frame=f)
            for b in bone_names:
                if b in pb:
                    pb[b].keyframe_insert("rotation_euler", frame=f)
            for b in fk_bones:
                pb[b].keyframe_insert("rotation_quaternion", frame=f)
            for b in finger_bones:
                pb[b].keyframe_insert("rotation_euler", frame=f)
            for b in girdle_bones:   # the shoulder blade turns about a pivot off its head, so it moves too
                pb[b].keyframe_insert("location", frame=f)
            for o in animated + movers:
                o.keyframe_insert("location", frame=f)
                o.keyframe_insert("rotation_quaternion" if o.rotation_mode == "QUATERNION" else "rotation_euler", frame=f)
            for o in movers:
                o.keyframe_insert("scale", frame=f)
            if f in key_frames:
                self.log_machine(f)
        for ob in [rig] + animated + movers:
            ad = ob.animation_data
            if ad and ad.action:
                for fc in _fcurves(ad.action):
                    for k in fc.keyframe_points:
                        k.interpolation = "LINEAR"
        return n

    def ground_poses(self, cache):
        """Pose option "ground" (13 Nov 2026): {"feet": 0, "hands": 0} etc. puts the named parts on the floor (or at the
        given height) using the real skin, not a guess. "feet" moves each foot target on its own (toes / soles land at
        that height). Any other part (hands, forearms, shins, upperarms, thighs, pelvis, trunk_head, all; ".L"/".R" for
        one side) moves the whole body (root, foot targets, knee poles) by the lowest of those parts. Three passes."""
        import copy
        from . import report as REP
        for name, P in self.spec["poses"].items():
            g = P.get("ground")
            if not g:
                continue
            pose = cache.setdefault(name, self.full_pose(name))
            if "root" not in pose:
                pose["root"] = {"loc": list(self.rest_root.translation), "rot": [0, 0, 0]}
            pose["root"].setdefault("loc", list(self.rest_root.translation))
            pose["root"]["loc"] = list(pose["root"]["loc"])
            tilt = g.get("_tilt")   # [[front parts], [back parts]]: also pitch the body (root rot X) so BOTH touch
            g = {k: v for k, v in g.items() if k != "_tilt"}
            body_parts = [k for k in g if k != "feet"]
            for it in range(7):
                self.apply(copy.deepcopy(pose))
                lw = REP.lows(self.ch["body"], self.rig)
                msg = {k: round(v[0], 4) for k, v in lw.items() if k.split(".")[0] in [b.split(".")[0] for b in g] or k == "all"}
                print(f"[ground] {name} pass {it}: lows {msg}")
                if it == 6:
                    break
                if "feet" in g:
                    for s in R.SIDES:
                        z = REP.low_of(lw, [f"feet.{s}"])
                        f = pose.get("feet", {}).get(s)
                        if z is not None and f and "at" in f:
                            f["at"] = [f["at"][0], f["at"][1], f["at"][2] - (z - g["feet"])]
                if tilt:
                    # two contacts along the body (e.g. forearms and knees): turn about the root (world X) so both
                    # reach the floor; z' ~ z + d * (y - y_root) for a small turn d
                    def low_pt(parts):
                        c = [v for k, v in lw.items() if k != "all" and (k in parts or k.split(".")[0] in parts)]
                        return min(c, key=lambda v: v[0]) if c else None
                    f, b = low_pt(tilt[0]), low_pt(tilt[1])
                    if f and b and abs(f[1][1] - b[1][1]) > 0.2:
                        dlt = -(f[0] - b[0]) / (f[1][1] - b[1][1])
                        pose["root"]["rot"] = list(pose["root"].get("rot", [0, 0, 0]))
                        pose["root"]["rot"][0] += math.degrees(dlt)
                        yr = pose["root"]["loc"][1]
                        pose["root"]["loc"][2] -= f[0] + dlt * (f[1][1] - yr)
                        print(f"[ground] {name}: tilt {math.degrees(dlt):+.2f} deg")
                        continue
                if body_parts:
                    dz = REP.low_of(lw, body_parts) - min(g[k] for k in body_parts)
                    pose["root"]["loc"][2] -= dz
                    if "feet" not in g:
                        for f in pose.get("feet", {}).values():
                            if "at" in f:
                                f["at"] = [f["at"][0], f["at"][1], f["at"][2] - dz]
                        for s in list(pose.get("knees", {})):
                            kp = pose["knees"][s]; pose["knees"][s] = [kp[0], kp[1], kp[2] - dz]
            print(f"[ground] {name}: root loc {[round(c, 4) for c in pose['root']['loc']]}, feet "
                  f"{ {s: [round(c, 4) for c in f['at']] for s, f in pose.get('feet', {}).items() if 'at' in f} }")

    def highlight(self):
        prim = self.spec.get("primary", []); sec = self.spec.get("secondary", [])
        w = research_weights(self.spec.get("key")) or self.spec.get("highlight")   # research file wins
        MU.set_highlight(self.ch["body"], prim, sec, weights=w, side=self.spec.get("highlight_side"))
        cut = (self.spec.get("skin", {}).get("calm_armpits") or {})
        cut = cut.get("hl_cut", 0.0) if isinstance(cut, dict) else 0.0
        if cut > 0 and getattr(self, "_calm_k", None) is not None:
            import numpy as np
            me = self.ch["body"].data; a = me.attributes["fa_hl"]
            hl = np.zeros(len(me.vertices), np.float32); a.data.foreach_get("value", hl)
            a.data.foreach_set("value", (hl * (1.0 - cut * self._calm_k)).astype(np.float32)); me.update()
        MU.set_highlight(self.ch["shorts"], prim, sec, weights=w, side=self.spec.get("highlight_side"))


TIER_GLOW = {"primary": 1.0, "secondary": 0.35, "stabiliser": 0.0, "deep": 0.0}   # research/FORMAT.md


def research_weights(key):
    """Muscle colours straight from research/<key>.json (tier -> glow), so the clip can never drift from the
    research. None when the exercise has no research file yet."""
    import os
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "research", f"{key}.json")
    if not key or not os.path.exists(p):
        return None
    w = {}
    for m in json.load(open(p, encoding="utf-8"))["muscles"]:
        k, g = m.get("mask_key"), TIER_GLOW[m["tier"]]
        if k and k != "none" and g > 0:
            w[k] = max(w.get(k, 0.0), g)
    return w or None


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
