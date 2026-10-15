"""Pack rendered frames into app files. Plain Python (Pillow + imageio-ffmpeg), no Blender.

python encode.py <key> [version]
Writes to out/<key>/:
  <key>.v<N>.webp         animated WebP loop, 480 px (in-app player: expo-image)
  <key>.v<N>.mp4          H.264 loop, 640 px (full-screen / share)
  <key>.v<N>.poster.webp  still for lists (the top of the rep)
  <key>.v<N>.sheet.png    QA contact sheet
Older versions of the same key are deleted (only the latest is kept).
"""
import sys, os, glob, json, subprocess, re
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "out")


def main():
    key = sys.argv[1]
    ver = sys.argv[2] if len(sys.argv) > 2 else "1"
    d = os.path.join(OUT, key)
    frames = sorted(glob.glob(os.path.join(d, "frames", "f*.png")))
    meta = json.load(open(os.path.join(d, "frames", "meta.json")))
    assert len(frames) == meta["frames"], f"{len(frames)} frames on disk, expected {meta['frames']}"
    fps = meta["fps"]
    for old in glob.glob(os.path.join(d, f"{key}.v*.*")):
        if not re.search(rf"\.v{re.escape(ver)}\.", os.path.basename(old)):
            os.remove(old)
    base = os.path.join(d, f"{key}.v{ver}")

    ims = [Image.open(p).convert("RGB") for p in frames]
    small = [im.resize((480, 480), Image.LANCZOS) for im in ims]
    small[0].save(base + ".webp", save_all=True, append_images=small[1:], duration=round(1000 / fps),
                  loop=0, quality=80, method=6, lossless=False)

    ff = __import__("imageio_ffmpeg").get_ffmpeg_exe()
    subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(d, "frames", "f%04d.png"),
                    "-vf", "scale=640:640:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow",
                    "-crf", "21", "-tune", "animation", "-movflags", "+faststart", base + ".mp4"], check=True)

    # poster = the top of the rep (make_clip writes it into meta.json); fallback: the frame with the most highlight
    def red_px(im):
        a = np.asarray(im.resize((160, 160))).astype(int)
        return int(((a[:, :, 0] - a[:, :, 2]) > 70).sum())
    best = meta.get("poster")
    if best is None:
        best = max(range(len(small)), key=lambda i: red_px(small[i]))
    small[best].save(base + ".poster.webp", quality=85, method=6)

    # QA: loop seam = difference between the last and first frame vs a normal frame step
    arr = [np.asarray(im.resize((160, 160))).astype(np.float32) for im in ims]
    steps = [np.abs(arr[i + 1] - arr[i]).mean() for i in range(len(arr) - 1)]
    seam = float(np.abs(arr[0] - arr[-1]).mean())
    sheet_idx = np.linspace(0, len(ims) - 1, 8).astype(int)
    tiles = [ims[i].resize((240, 240)) for i in sheet_idx]
    sheet = Image.new("RGB", (240 * 4, 240 * 2), "white")
    for j, t in enumerate(tiles):
        sheet.paste(t, ((j % 4) * 240, (j // 4) * 240))
    sheet.save(base + ".sheet.png")

    rep = {"key": key, "version": ver, "frames": len(ims), "fps": fps, "seconds": round(len(ims) / fps, 2),
           "webp_kb": round(os.path.getsize(base + ".webp") / 1024), "mp4_kb": round(os.path.getsize(base + ".mp4") / 1024),
           "poster_kb": round(os.path.getsize(base + ".poster.webp") / 1024), "poster_frame": best,
           "loop_seam": round(seam, 2), "median_step": round(float(np.median(steps)), 2), "max_step": round(float(max(steps)), 2)}
    rep["seamless"] = rep["loop_seam"] <= 1.5 * rep["max_step"]
    json.dump(rep, open(base + ".report.json", "w"), indent=1)
    print(json.dumps(rep))


if __name__ == "__main__":
    main()
