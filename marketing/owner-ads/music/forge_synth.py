"""Option 5: our own music, written in code (no model, no licence, no cost). A steel-forge metal groove:
a distorted down-tuned bass riff, kick and snare, power-chord stabs, and the sound of steel itself:
anvil strikes and a hammer on a plate, made from inharmonic ringing partials (how struck metal rings).

    python forge_synth.py <out.wav>

Deterministic (fixed seed). 24 s, 48 kHz stereo, 132 BPM, E minor. finish.py then cuts, levels and ends it.
"""
import sys
import wave

import numpy as np
from scipy.signal import lfilter

SR = 48000
DUR = 24.0
N = int(SR * DUR)
BPM = 132
BEAT = 60 / BPM
S16 = BEAT / 4
rng = np.random.default_rng(1108)
L = np.zeros(N)
R = np.zeros(N)


def put(t, sig, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * (1 - pan) / 1.0
    R[i:i + len(sig)] += sig * (1 + pan) / 1.0


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    return lfilter([1 - a], [1, -a], x)


def kick():
    t = tt(0.42)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    click = rng.standard_normal(len(t)) * np.exp(-t * 400) * 0.35
    return np.tanh((body + click) * 2.2) * 0.9


def snare():
    t = tt(0.28)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    nz = rng.standard_normal(len(t))
    nz = nz - lowpass(nz, 1800)  # keep the crack, not the mud
    return np.tanh((tone + nz * np.exp(-t * 16) * 0.8) * 1.6) * 0.7


def hat(open_=False):
    t = tt(0.18 if open_ else 0.05)
    nz = rng.standard_normal(len(t))
    nz = nz - lowpass(nz, 7000)
    return nz * np.exp(-t * (18 if open_ else 90)) * 0.25


def metal(f0, dec=2.2, bright=1.0, length=1.6):
    """Struck steel: inharmonic partials (free-plate ratios) with fast attack, long ring."""
    t = tt(length)
    ratios = [1.0, 2.76, 5.40, 8.93, 13.34]
    amps = [1.0, 0.7, 0.5, 0.35, 0.22]
    s = np.zeros(len(t))
    for k, (r, a) in enumerate(zip(ratios, amps)):
        s += a * (bright ** k) * np.sin(2 * np.pi * f0 * r * t + rng.uniform(0, 6.28)) * np.exp(-t * dec * (1 + 0.5 * k))
    hitn = rng.standard_normal(len(t)) * np.exp(-t * 220) * 0.6
    return np.tanh((s * 0.5 + hitn) * 1.4) * 0.6


def saw(f, t):
    return 2 * ((f * t) % 1.0) - 1


def bass_note(f, length, mute=True):
    t = tt(length)
    x = saw(f, t) + 0.6 * saw(f * 1.005, t) + 0.5 * saw(f / 2, t)
    env = np.exp(-t * (9 if mute else 1.5)) * np.minimum(1, t * 400)
    y = np.tanh(x * 4.0) * env
    return lowpass(y, 900 if mute else 1400) * 0.55


def chord(f, length):
    t = tt(length)
    x = sum(saw(f * r, t) + saw(f * r * 1.004, t) for r in (1, 1.5, 2))
    y = np.tanh(x * 3.0) * np.exp(-t * 2.2) * np.minimum(1, t * 300)
    return lowpass(y, 2200) * 0.32


E1 = 41.2
riff = [E1, E1, E1 * 1.189, E1, E1 * 1.335, E1, E1 * 1.189, E1 * 1.122]  # E E G E A E G F#
bars = int(DUR / (BEAT * 4)) + 1
K, SN = kick(), snare()
for b in range(bars):
    t0 = b * BEAT * 4
    full = b >= 2  # bars 1-2: the forge warms up (bass, metal, hats); then the band
    for s in range(16):
        ts = t0 + s * S16
        if s % 2 == 0:
            note = riff[(s // 2) % 8]
            put(ts, bass_note(note, S16 * 2 * 0.95, mute=True), 1.0 if full else 0.7)
        put(ts, hat(open_=(s % 8 == 6)), 0.9 if full else 0.5, pan=0.35 if s % 2 else -0.2)
    if full:
        for s in (0, 6, 8, 10, 14) if b % 2 else (0, 3, 8, 11, 14):
            put(t0 + s * S16, K, 1.0)
        for s in (4, 12):
            put(t0 + s * S16, SN, 1.0)
        if b % 2 == 0:
            put(t0, chord(82.4, BEAT * 2), 1.0, pan=-0.3)
            put(t0, chord(82.4 * 1.003, BEAT * 2), 1.0, pan=0.3)
    # steel: an anvil on 1, a hammer on the plate on the off-beats
    put(t0, metal(523, dec=1.6, length=2.0), 0.9, pan=0.15)
    for s in (3, 7, 11, 15):
        put(t0 + s * S16, metal(1046 if s % 8 == 3 else 932, dec=6.0, bright=0.8, length=0.6), 0.45, pan=-0.4 if s < 8 else 0.4)

mix = np.stack([L, R], axis=1)
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
pcm = (mix * 0.89 * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", sys.argv[1], f"{DUR:.1f}s")
