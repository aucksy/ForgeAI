"""Muscle masks for ForgeAI's 19 muscle keys, defined from the skeleton (rest pose), stored as point attributes.

Each muscle is a soft 0..1 weight per vertex: m_<key>. The per-exercise highlight is
fa_hl = max(primary masks, SECONDARY_LEVEL * secondary masks). Masks are computed on the LEFT side
only; right-side vertices are mirrored (x -> |x|) so both sides always match.
"""
import math
import numpy as np

MUSCLES = ["chest", "chest_upper", "chest_lower", "front_delts", "side_delts", "rear_delts", "lats", "upper_back", "traps", "lower_back",
           "biceps", "triceps", "forearms", "abs", "obliques", "glutes", "quads", "hamstrings", "adductors",
           "abductors", "calves"]
SECONDARY_LEVEL = 0.5

ARM = ("upperarm01", "upperarm02", "lowerarm01", "lowerarm02", "wrist", "finger", "metacarpal")
SHOULDER = ("shoulder01", "clavicle")
TORSO = ("spine", "breast", "neck", "root")
PELVIS = ("pelvis",)
LEG = ("upperleg", "lowerleg", "foot", "toe")


def smooth(x, e0, e1):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def window(x, lo, hi, soft):
    """1 inside [lo, hi], soft shoulders of width `soft` outside."""
    return smooth(x, lo - soft, lo) * (1 - smooth(x, hi, hi + soft))


def ang_window(theta_deg, lo, hi, soft=20.0):
    th = (theta_deg - lo) % 360.0
    span = (hi - lo) % 360.0
    inside = np.minimum(th, 360.0) <= span
    d_out = np.minimum(np.abs(th - span), np.abs(360.0 - th))
    return np.where(inside, 1.0, 1 - smooth(d_out, 0, soft))


def limb_frame(P, N, a, b, outward):
    """t along a->b, radial distance, and angle around the axis: 0 front (-Y), +90 = `outward`, 180 back."""
    a = np.asarray(a, float); b = np.asarray(b, float)
    ax = b - a; L = np.linalg.norm(ax); ax /= L
    f = np.array([0.0, -1.0, 0.0]); f = f - ax * f.dot(ax); f /= np.linalg.norm(f)
    o = np.asarray(outward, float); o = o - ax * o.dot(ax) - f * o.dot(f); o /= np.linalg.norm(o)
    d = P - a
    t = d @ ax / L
    radial = d - np.outer(d @ ax, ax)
    r = np.linalg.norm(radial, axis=1)
    # use the surface normal for the angle: robust where the limb is thick or flattened
    nr = N - np.outer(N @ ax, ax)
    theta = np.degrees(np.arctan2(nr @ o, nr @ f))
    theta_pos = np.degrees(np.arctan2(radial @ o, radial @ f))
    return t, r, theta, theta_pos


def group_sums(body, rig):
    """Per-vertex summed deform weight for arm / shoulder / torso / pelvis / leg bones."""
    bones = {b.name for b in rig.data.bones}
    idx = {}
    for g in body.vertex_groups:
        if g.name in bones:
            base = g.name.split(".")[0]
            for key, prefixes in (("arm", ARM), ("shoulder", SHOULDER), ("torso", TORSO), ("pelvis", PELVIS), ("leg", LEG)):
                if base.startswith(prefixes):
                    idx[g.index] = key
    n = len(body.data.vertices)
    out = {k: np.zeros(n) for k in ("arm", "shoulder", "torso", "pelvis", "leg")}
    for v in body.data.vertices:
        for g in v.groups:
            k = idx.get(g.group)
            if k:
                out[k][v.index] += g.weight
    return {k: np.clip(a, 0, 1) for k, a in out.items()}


def landmarks(rig):
    B = rig.data.bones
    h = lambda n: np.array(B[n].head_local)
    t = lambda n: np.array(B[n].tail_local)
    return {
        "shoulder": h("upperarm01.L"), "elbow": h("lowerarm01.L"), "wrist": h("wrist.L"),
        "acromion": t("clavicle.L") + np.array([0.06, 0.0, 0.0]),
        "hip": h("upperleg01.L"), "knee": h("lowerleg01.L"), "ankle": h("foot.L"),
        "neck": h("neck01"), "chest_top": t("clavicle.L"), "nipple": t("breast.L"),
        "navel_z": h("spine04")[2], "pelvis_z": h("spine05")[2],
    }


def compute(P, N, G, LM):
    """P, N: (n,3) rest positions/normals. G: group sums. Returns {muscle: (n,) weights}."""
    x = np.abs(P[:, 0]); y = P[:, 1]; z = P[:, 2]
    side = np.sign(P[:, 0]); side[side == 0] = 1
    Pm = np.column_stack([x, y, z])
    Nm = np.column_stack([N[:, 0] * side, N[:, 1], N[:, 2]])
    ny = Nm[:, 1]; nz = Nm[:, 2]
    S, E, W = LM["shoulder"], LM["elbow"], LM["wrist"]
    H, K, A = LM["hip"], LM["knee"], LM["ankle"]
    nip_z = LM["nipple"][2]; neck_z = LM["neck"][2]; clav_z = LM["chest_top"][2]
    navel_z = LM["navel_z"]; pel_z = LM["pelvis_z"]
    armw = G["arm"]; shw = G["shoulder"]; torw = G["torso"]; legw = G["leg"]; pelw = G["pelvis"]
    front = smooth(-ny, 0.05, 0.45); back = smooth(ny, 0.05, 0.45)
    m = {}

    # ---- arm frame (outward/up for the A-pose left arm)
    out_arm = np.array([0.6, 0.0, 0.8])
    t_u, r_u, th_u, tp_u = limb_frame(Pm, Nm, S, E, out_arm)
    near_arm = 1 - smooth(r_u, 0.085, 0.12)
    upper = np.clip(armw + shw, 0, 1)
    cap = window(t_u, -0.25, 0.42, 0.12) * near_arm * np.clip(upper + 0.3 * torw, 0, 1) * (1 - smooth(torw - upper, 0.0, 0.35))
    # deltoid = three heads from collarbone / acromion / scapular spine converging on the deltoid tuberosity
    # (~40 % down the upper arm): each head's angular band narrows and drifts toward the outside as it descends
    tt = np.clip(t_u / 0.42, 0, 1)
    def head(c0, c1, w0, w1):
        c = c0 + (c1 - c0) * tt; w = w0 + (w1 - w0) * tt
        return ang_window(th_u, c - w, c + w, 18) * ang_window(tp_u, c - w - 10, c + w + 10, 20)
    m["front_delts"] = cap * head(-8, 55, 42, 14) * (1 - smooth(-t_u, 0.05, 0.25) * back)
    m["side_delts"] = cap * head(80, 82, 38, 16)
    m["rear_delts"] = cap * head(168, 112, 36, 14) * smooth(ny, -0.2, 0.2)
    biceps_len = window(t_u, 0.38, 0.9, 0.1) * near_arm * armw
    m["biceps"] = biceps_len * ang_window(th_u, -50, 40, 25)
    m["triceps"] = window(t_u, 0.22, 0.92, 0.1) * near_arm * armw * ang_window(th_u, 130, 265, 25)

    t_f, r_f, th_f, _ = limb_frame(Pm, Nm, E, W, out_arm)
    m["forearms"] = window(t_f, 0.04, 0.82, 0.12) * (1 - smooth(r_f, 0.06, 0.09)) * armw

    # ---- torso
    torso = np.clip(torw + 0.6 * shw, 0, 1) * (1 - smooth(armw, 0.25, 0.6))
    # pectoralis major as a fan (front-facing torso skin):
    #   medial border = sternum, top = just under the collarbone, outer border = the deltopectoral groove
    #   (x ~0.12 under the collarbone, widening to the armpit fold ~0.18), lower border = from the 6th rib at the
    #   sternum (~6 cm below the nipple line) rising toward the armpit fold.
    xa = 0.185
    fx = np.clip(x / xa, 0, 1)
    top = clav_z - 0.008 + 0.012 * fx
    bottom = (nip_z - 0.062) + 0.115 * fx ** 1.7
    xmax = 0.145 + (0.19 - 0.145) * np.clip((top - z) / max(1e-3, (clav_z - nip_z)), 0, 1)
    m["chest"] = torso * smooth(-ny, 0.15, 0.45) * window(x, 0.008, 1, 0.01) * (1 - smooth(x, xmax - 0.012, xmax + 0.012))         * smooth(z, bottom - 0.012, bottom + 0.012) * (1 - smooth(z, top - 0.012, top + 0.006))
    split = top - (top - bottom) * 0.38   # top third of the fan at every x (clavicular head reaches the armpit)
    up = smooth(z, split - 0.02, split + 0.02)
    m["chest_upper"] = m["chest"] * up
    m["chest_lower"] = m["chest"] * (1 - up)
    m["abs"] = torso * front * window(x, -1, 0.062, 0.025) * window(z, navel_z - 0.075, nip_z - 0.075, 0.03)
    m["obliques"] = torso * window(x, 0.088, 0.22, 0.02) * window(z, navel_z - 0.08, nip_z - 0.08, 0.04)         * smooth(np.abs(Nm[:, 0]), 0.35, 0.7) * smooth(-ny, -0.5, -0.15)
    m["lower_back"] = torso * back * window(x, -1, 0.07, 0.03) * window(z, pel_z, navel_z + 0.12, 0.04)
    m["upper_back"] = torso * back * window(x, -1, 0.16, 0.04) * window(z, nip_z - 0.07, clav_z - 0.02, 0.04) * (1 - smooth(nz, 0.35, 0.7))
    m["lats"] = torso * smooth(ny, -0.35, 0.15) * window(x, 0.07, 0.25, 0.04) * window(z, navel_z + 0.03, nip_z + 0.04, 0.04) \
        * (1 - smooth((z - (navel_z + 0.03)) / max(1e-3, nip_z - navel_z) - (x - 0.07) / 0.12, 0.6, 1.2))
    m["traps"] = np.clip(torw + shw, 0, 1) * window(x, -1, 0.19, 0.04) * window(z, clav_z - 0.03, neck_z + 0.09, 0.035) \
        * smooth(ny + 0.6 * nz, 0.05, 0.4) * (1 - smooth(armw, 0.2, 0.5))

    # ---- hips and legs (outward = +X for the left leg)
    out_leg = np.array([1.0, 0.0, 0.0])
    t_t, r_t, th_t, _ = limb_frame(Pm, Nm, H, K, out_leg)
    thigh = np.clip(legw + 0.5 * pelw, 0, 1) * (1 - smooth(r_t, 0.11, 0.15))
    m["quads"] = thigh * window(t_t, 0.12, 0.93, 0.1) * ang_window(th_t, -55, 105, 25)
    m["hamstrings"] = thigh * window(t_t, 0.12, 0.9, 0.1) * ang_window(th_t, 140, 230, 25)
    m["adductors"] = thigh * window(t_t, 0.02, 0.62, 0.1) * ang_window(th_t, 225, 315, 25)
    m["glutes"] = np.clip(pelw + legw + torw, 0, 1) * back * window(z, H[2] - 0.17, pel_z + 0.06, 0.05) * window(x, 0.01, 0.17, 0.03)
    m["abductors"] = np.clip(pelw + legw, 0, 1) * window(z, H[2] - 0.12, pel_z + 0.08, 0.05) * smooth(np.abs(Nm[:, 0]) * (Nm[:, 0] > 0), 0.45, 0.8) * window(x, 0.1, 0.3, 0.03)
    t_c, r_c, th_c, _ = limb_frame(Pm, Nm, K, A, out_leg)
    m["calves"] = np.clip(legw, 0, 1) * window(t_c, 0.08, 0.62, 0.1) * ang_window(th_c, 110, 250, 25) * (1 - smooth(r_c, 0.08, 0.11))

    return {k: np.clip(v, 0, 1).astype(np.float32) for k, v in m.items()}


def _smooth_on_mesh(me, values, iters=4):
    """Laplacian smoothing over mesh edges: soft, even edges, then a domed core (centre darker)."""
    e = np.zeros(len(me.edges) * 2, np.int32); me.edges.foreach_get("vertices", e); e = e.reshape(-1, 2)
    n = len(me.vertices)
    deg = np.bincount(e.ravel(), minlength=n).astype(np.float32); deg[deg == 0] = 1
    out = {}
    for k, v in values.items():
        m = v.astype(np.float32)
        for _ in range(iters):
            acc = np.bincount(e[:, 0], weights=m[e[:, 1]], minlength=n) + np.bincount(e[:, 1], weights=m[e[:, 0]], minlength=n)
            m = 0.5 * m + 0.5 * acc / deg
        core = m.copy()
        for _ in range(iters):
            acc = np.bincount(e[:, 0], weights=core[e[:, 1]], minlength=n) + np.bincount(e[:, 1], weights=core[e[:, 0]], minlength=n)
            core = 0.5 * core + 0.5 * acc / deg
        # muscles fill to their borders (a light 15 % fade toward the rim), edges softened by 4 smoothing passes
        out[k] = np.clip(m * (0.85 + 0.15 * smooth(core, 0.3, 0.95)), 0, 1).astype(np.float32)
    return out


def write_masks(body, rig, pos, normals):
    """Compute and store every m_<key> attribute on the body mesh (call before copying the shorts)."""
    P = np.array([tuple(p) for p in pos], float)
    N = np.array([tuple(n) for n in normals], float)
    G = group_sums(body, rig)
    masks = _smooth_on_mesh(body.data, compute(P, N, G, landmarks(rig)))
    me = body.data
    for k in MUSCLES:
        a = me.attributes.get("m_" + k) or me.attributes.new("m_" + k, "FLOAT", "POINT")
        a.data.foreach_set("value", masks[k])
    return masks


def set_highlight(obj, primary, secondary=(), level=SECONDARY_LEVEL, weights=None):
    """Write fa_hl on any mesh that carries m_<key> attributes (body or shorts).
    weights = {mask: strength} overrides primary/secondary (e.g. {"chest_upper": 1, "chest_lower": 0.45})."""
    me = obj.data
    n = len(me.vertices)
    hl = np.zeros(n, np.float32)
    buf = np.zeros(n, np.float32)
    groups = [([k], w) for k, w in weights.items()] if weights else [(primary, 1.0), (secondary, level)]
    for keys, w in groups:
        for k in keys:
            a = me.attributes.get("m_" + k)
            if a is None:
                raise KeyError("unknown muscle key: " + k)
            a.data.foreach_get("value", buf)
            hl = np.maximum(hl, buf * w)
    a = me.attributes.get("fa_hl") or me.attributes.new("fa_hl", "FLOAT", "POINT")
    a.data.foreach_set("value", hl)
    me.update()
