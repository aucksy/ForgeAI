"""Turns the raw music takes into the options he picks from (music-choices.yml, last job).

    python finish.py <raw dir> <voice dir or "-"> <out dir>

For each option (files <option>-s<seed>.wav from ace_gen.py, or <option>.wav from forge_synth.py):
  1. keep the stronger take (fewest quiet holes, most drive; scores in report.json)
  2. start where the music is already going (the hook needs energy in the first 2 s)
  3. exactly 21.0 s with a clean ending: the music stops on its strongest hit near 19.5 s and one struck-steel
     hit rings out under the end card (the same steel hit for every option, made here in code)
  4. a gentle -3 dB dip around 2.2 kHz, where a voice sits, so the words stay clear on top
  5. every option to -16 LUFS (EBU R128), so none wins by being louder
  6. <option>.mp3 to listen to, <option>.wav for the ad render (owner-ads.yml input `music`)
  7. with a voice dir: <option>-with-voice.mp3, the ad 06 sample lines laid over it the way the film mixes
     them (music at 0.2 under a line, 0.42 between lines)
"""
import glob
import json
import os
import re
import subprocess
import sys
from math import gcd

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import lfilter, resample_poly

RAW, VOICE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
SR = 48000
LEN = 21.0  # a little longer than the longest ad: the film trims the start, so the ending always lands
TARGET = -16.0
meter = pyln.Meter(SR)


def load(p):
    a, sr = sf.read(p, always_2d=True, dtype="float64")
    if a.shape[1] == 1:
        a = np.repeat(a, 2, axis=1)
    a = a[:, :2]
    if sr != SR:
        g = gcd(sr, SR)
        a = resample_poly(a, SR // g, sr // g, axis=0)
    return a


def rms_frames(a, hop=0.01):
    h = int(hop * SR)
    m = a.mean(axis=1)
    n = len(m) // h
    return np.sqrt((m[: n * h].reshape(n, h) ** 2).mean(axis=1) + 1e-12)


def score(a):
    r = rms_frames(a)
    med = np.median(r)
    holes = float((r < med * 0.12).mean())  # share of near-silent 10 ms frames
    flux = np.maximum(0, np.diff(r)).mean() / (med + 1e-9)  # punch: rises in energy
    early = float(np.sqrt((a[: 2 * SR] ** 2).mean()) / (np.sqrt((a ** 2).mean()) + 1e-9))
    return dict(holes=round(holes, 3), punch=round(float(flux), 3), early=round(early, 3),
                total=round(float(flux) * (1 - holes) * min(1.0, early + 0.3), 4))


def peaking(a, f0=2200, gain_db=-3.0, q=0.9):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    aa = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return lfilter(np.array(b) / aa[0], np.array(aa) / aa[0], a, axis=0)


def steel_hit(length):
    """One struck steel plate + a low boom: the shared ending."""
    t = np.arange(int(length * SR)) / SR
    rng = np.random.default_rng(7)
    ratios, amps = [1.0, 2.76, 5.40, 8.93, 13.34], [1.0, 0.75, 0.5, 0.32, 0.2]
    s = np.zeros(len(t))
    for k, (r, a) in enumerate(zip(ratios, amps)):
        s += a * np.sin(2 * np.pi * 196 * r * t + rng.uniform(0, 6.28)) * np.exp(-t * (1.6 + 1.1 * k))
    boom = np.sin(2 * np.pi * (48 + 40 * np.exp(-t * 18)) * t) * np.exp(-t * 3.2)
    nz = rng.standard_normal(len(t)) * np.exp(-t * 160)
    m = np.tanh(s * 0.55 + boom * 0.9 + nz * 0.5)
    m *= np.minimum(1, (length - t) / 0.35)  # land on silence exactly at the end
    return np.stack([m * 0.95, m], axis=1)


def shape(a):
    r = rms_frames(a)
    med = np.median(r)
    start = int(np.argmax(r > med * 0.5)) * 0.01
    start = max(0.0, min(2.0, start - 0.02))
    a = a[int(start * SR):]
    # the strongest hit between 19.2 and 19.9 s: the music stops there and the steel rings out
    r2 = rms_frames(a)
    flux = np.maximum(0, np.diff(r2, prepend=r2[0]))
    lo, hi = 1920, min(1990, len(flux) - 1)
    cut = (lo + int(np.argmax(flux[lo:hi]))) * 0.01 if hi > lo else 19.5
    c = int(cut * SR)
    out = np.zeros((int(LEN * SR), 2))
    body = a[: c + int(0.4 * SR)].copy()
    fade = np.ones(len(body))
    fade[c:] = np.linspace(1, 0, len(body) - c) ** 2  # the band stops under the hit, no hard cut
    body *= fade[:, None]
    out[: min(len(body), len(out))] += body[: len(out)]
    hit = steel_hit(LEN - cut)
    k = np.sqrt((body[: c] ** 2).mean()) / (np.sqrt((hit ** 2).mean()) + 1e-9)
    out[c:c + len(hit)] += hit * min(1.6, k * 1.4)
    return out, round(start, 2), round(cut, 2)


def level(a):
    lufs = meter.integrated_loudness(a)
    a = a * 10 ** ((TARGET - lufs) / 20)
    pk = np.abs(a).max()
    if pk > 0.97:  # soft-limit the few peaks the gain pushed over
        a = np.tanh(a / 0.97 * 1.0) * 0.97
        a *= 10 ** ((TARGET - meter.integrated_loudness(a)) / 20)
    return a, round(lufs, 1)


def write(a, base):
    sf.write(f"{base}.wav", np.clip(a, -1, 1), SR, subtype="PCM_16")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", f"{base}.wav",
                    "-codec:a", "libmp3lame", "-b:a", "192k", f"{base}.mp3"], check=True)


def voice_track(total):
    segs = sorted(glob.glob(os.path.join(VOICE, "seg-progress-ad-*.wav")),
                  key=lambda p: int(re.search(r"-(\d+)\.wav$", p).group(1)))
    v = np.zeros((int(total * SR), 2))
    on = np.zeros(len(v))
    t = 0.15
    for p in segs:
        s = load(p)
        s *= 0.89 / (np.abs(s).max() + 1e-9)
        i = int(t * SR)
        n = min(len(s), len(v) - i)
        if n <= 0:
            break
        v[i:i + n] += s[:n]
        on[max(0, i - int(0.13 * SR)):i + n + int(0.13 * SR)] = 1
        t += len(s) / SR + 0.3
    gain = np.where(on > 0, 0.2, 0.42)
    k = int(0.05 * SR)
    gain = np.convolve(gain, np.ones(k) / k, mode="same")
    return v, gain, len(segs)


groups = {}
for p in sorted(glob.glob(os.path.join(RAW, "**", "*.wav"), recursive=True)):
    m = re.match(r"(\d-[a-z0-9-]+?)(-s\d+)?\.wav$", os.path.basename(p))
    if m:
        groups.setdefault(m.group(1), []).append(p)

report = []
for name, takes in sorted(groups.items()):
    scored = []
    for p in takes:
        a = load(p)
        if len(a) < 21.6 * SR:
            print(f"{name}: {os.path.basename(p)} too short ({len(a) / SR:.1f} s), skipped")
            continue
        scored.append((score(a), p, a))
    if not scored:
        continue
    scored.sort(key=lambda x: x[0]["total"], reverse=True)
    sc, p, a = scored[0]
    shaped, start, cut = shape(a)
    shaped = peaking(shaped)
    final, raw_lufs = level(shaped)
    base = os.path.join(OUT, name)
    write(final, base)
    row = dict(option=name, take=os.path.basename(p), scores={os.path.basename(x[1]): x[0] for x in scored},
               start_s=start, ending_hit_s=cut, raw_lufs=raw_lufs, lufs=round(meter.integrated_loudness(final), 1),
               peak=round(float(np.abs(final).max()), 3), seconds=round(len(final) / SR, 3))
    if VOICE != "-" and os.path.isdir(VOICE):
        v, gain, nseg = voice_track(LEN)
        mix = v + final * gain[:, None]
        mix, _ = level(mix)
        write(mix, base + "-with-voice")
        row["voice_lines"] = nseg
    report.append(row)
    print(json.dumps(row), flush=True)

with open(os.path.join(OUT, "report.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)
print(f"{len(report)} options")
