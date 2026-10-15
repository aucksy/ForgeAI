"""Camera framing, frame rendering, and encoding (animated WebP + MP4 + poster)."""
import math, os, subprocess, glob
import bpy
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from . import look


def _bbox_points(objs):
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        step = max(1, len(me.vertices) // 1500)
        mw = ev.matrix_world
        pts.extend(mw @ me.vertices[i].co for i in range(0, len(me.vertices), step))
        ev.to_mesh_clear()
    return pts


def frame_camera(scene, cam, objs, yaw, pitch, lens=50, fill=0.86, sample_frames=(0,), target_offset=(0, 0, 0)):
    """Place the camera at yaw/pitch (degrees; yaw 0 = in front of the athlete) so every sampled frame fits."""
    cam.data.lens = lens
    cam.data.sensor_fit = "AUTO"
    pts = []
    for f in sample_frames:
        scene.frame_set(f)
        pts += _bbox_points(objs)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2 + Vector(target_offset)
    a = math.radians(yaw); e = math.radians(pitch)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    dist = 6.0
    for _ in range(30):
        cam.location = center + d * dist
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        uv = [world_to_camera_view(scene, cam, p) for p in pts]
        ext = max(max(abs(c.x - 0.5), abs(c.y - 0.5)) for c in uv) * 2
        # re-centre on the projected box so margins are even
        cx = (min(c.x for c in uv) + max(c.x for c in uv)) / 2 - 0.5
        cy = (min(c.y for c in uv) + max(c.y for c in uv)) / 2 - 0.5
        right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)); up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
        w = 2 * dist * math.tan(cam.data.angle / 2)
        center = center + right * cx * w + up * cy * w
        dist *= ext / fill
    cam.location = center + d * dist
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    return center, d


def render_frames(scene, out_dir, n, step=1):
    os.makedirs(out_dir, exist_ok=True)
    for f in range(0, n, step):
        p = os.path.join(out_dir, f"f{f:04d}.png")
        if os.path.isfile(p):
            continue
        scene.frame_set(f)
        scene.render.filepath = p
        bpy.ops.render.render(write_still=True)


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"
