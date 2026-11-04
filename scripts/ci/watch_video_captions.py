"""Builds the captioned 1280x720 version of the watch demo (watch-video.yml).

The raw screen recording sits on the left; a title and one caption per moment (times from the
events file watch_video.sh wrote) on the right. Usage: watch_video_captions.py <out-dir>
"""
import os
import subprocess
import sys

out = sys.argv[1]
raw = os.path.join(out, "watch-demo-raw.mp4")
events = []
for line in open(os.path.join(out, "events.txt"), encoding="utf-8"):
    parts = line.split()
    if len(parts) == 2:
        events.append((float(parts[0]), parts[1]))
t = dict((name, sec) for sec, name in events)

CAPTIONS = [
    ("app-rest", "home", "A workout is open. MettleUp shows\nthe rest timer and live heart rate\nfrom the watch's own sensor."),
    ("home", "back", "The member leaves the app.\nThe workout keeps running in a\nforeground service (type: health)."),
    ("back", "rest-over", "Back in MettleUp: the rest timer\nkept counting, heart rate is\nread again. No touch needed."),
    ("rest-over", "next-set", "The rest runs out on its own:\nthe watch buzzes, \"Rest is over\"."),
    ("next-set", "end", "The next set to log, with\nlive heart rate."),
]
TITLE = "MettleUp on Wear OS\nWorkout with heart rate\n(foreground service, type health)"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

files = []


def textfile(name, text):
    p = os.path.join(out, name)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    files.append(p)
    return p


filters = [
    "[0:v]scale=640:640:force_original_aspect_ratio=decrease,pad=1280:720:40+(640-iw)/2:(720-ih)/2:color=black,setsar=1",
]
title = textfile("cap-title.txt", TITLE)
filters.append(
    f"drawtext=fontfile={BOLD}:textfile={title}:fontcolor=white:fontsize=26:line_spacing=10:x=700:y=90"
)
for i, (a, b, text) in enumerate(CAPTIONS):
    if a not in t:
        continue
    start = t[a]
    end = t.get(b, 999.0)
    p = textfile(f"cap-{i}.txt", text)
    filters.append(
        f"drawtext=fontfile={FONT}:textfile={p}:fontcolor=0xFFB37A:fontsize=24:line_spacing=10:x=700:y=300:"
        f"enable='between(t,{start:.1f},{end:.1f})'"
    )
filters.append(
    f"drawtext=fontfile={FONT}:text='Wear OS emulator · synthetic heart-rate data':fontcolor=0x888888:fontsize=18:x=700:y=660"
)
vf = ",".join(filters)
cmd = [
    "ffmpeg", "-y", "-i", raw, "-filter_complex", vf, "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-preset", "medium", "-crf", "20", "-an", os.path.join(out, "watch-demo-captioned.mp4"),
]
print(" ".join(cmd))
subprocess.run(cmd, check=True)
