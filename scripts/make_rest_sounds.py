"""The member app's extra rest-over sounds (owner backlog "Pick your rest-over sound", R-55, 22 Oct 2026).

Made here from plain maths (no samples, no licences), so they can be remade the same way:

    python scripts/make_rest_sounds.py

Writes each sound twice, byte for byte the same (an alert has TWO sound paths, memory note
an-alert-has-two-sound-paths): apps/mobile/assets/sounds/rest-<id>.wav (the open app's bell) and
apps/mobile/modules/forge-rest/android/src/main/res/raw/forge_rest_<id>.wav (the "Rest is over"
channels). 44.1 kHz mono 16-bit, as loud as rest-done.wav (the ForgeAI chime, E6 -> A6) over the
first 0.4 s, never past its peak (26213).
Each is unlike the chime: a deeper struck bell, a sports-timer double beep, a coach's whistle.
"""
import os
import wave

import numpy as np

SR = 44100
PEAK = 26213  # rest-done.wav's own peak
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "apps", "mobile", "assets", "sounds")
RAW = os.path.join(ROOT, "apps", "mobile", "modules", "forge-rest", "android", "src", "main", "res", "raw")


def t(sec):
    return np.arange(int(sec * SR)) / SR


def fade(x, a=0.004, r=0.02):
    """Short fade in and out, so no click at either end."""
    n = len(x)
    env = np.ones(n)
    ai, ri = int(a * SR), int(r * SR)
    env[:ai] = np.linspace(0, 1, ai)
    env[n - ri:] = np.linspace(1, 0, ri)
    return x * env


def bell():
    """A struck bell around E5 (660 Hz): inharmonic partials, the high ones dying first."""
    tt = t(1.25)
    parts = [(1.0, 1.0, 1.6), (2.0, 0.55, 2.2), (2.76, 0.42, 3.0), (4.07, 0.25, 4.5), (5.4, 0.16, 6.0)]
    x = sum(a * np.sin(2 * np.pi * 660 * m * tt) * np.exp(-d * tt) for m, a, d in parts)
    return fade(x, a=0.002)


def beep():
    """Two short sports-timer beeps at 2 kHz (odd harmonics, softened)."""
    tone = t(0.13)
    b = sum(np.sin(2 * np.pi * 2000 * k * tone) / k for k in (1, 3, 5))
    b = fade(b, a=0.003, r=0.012)
    gap = np.zeros(int(0.09 * SR))
    tail = np.zeros(int(0.05 * SR))
    return np.concatenate([b, gap, b, tail])


def whistle():
    """A coach's whistle: a 3 kHz tone with the pea's fast trill and a little breath."""
    tt = t(0.7)
    rng = np.random.default_rng(54)  # fixed, so every run writes the same file
    f = 3000 + 60 * np.sin(2 * np.pi * 28 * tt)  # the pea rattling: a quick wobble in pitch
    phase = 2 * np.pi * np.cumsum(f) / SR
    trill = 0.75 + 0.25 * np.sin(2 * np.pi * 28 * tt)
    breath = rng.normal(0, 0.08, len(tt))
    x = (np.sin(phase) + 0.18 * np.sin(2 * phase)) * trill + breath
    env = np.minimum(1, tt / 0.03) * np.exp(-1.2 * np.maximum(0, tt - 0.45))
    return fade(x * env, a=0.002, r=0.06)


#: The chime's loudness over its first 0.4 s (rest-done.wav): every sound starts as loud as it, no louder.
LOUD_RMS = 7500


def level(x):
    """As loud as the chime over the first 0.4 s, never past its peak."""
    head = x[: int(0.4 * SR)]
    gain = LOUD_RMS / np.sqrt(np.mean(head**2))
    return x * min(gain, PEAK / np.max(np.abs(x)))


def write(path, x):
    x = level(x)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.round(x).astype("<i2").tobytes())


def main():
    for name, make in (("bell", bell), ("beep", beep), ("whistle", whistle)):
        x = make()
        write(os.path.join(ASSETS, f"rest-{name}.wav"), x)
        write(os.path.join(RAW, f"forge_rest_{name}.wav"), x)
        y = level(x)
        head = np.sqrt(np.mean(y[: int(0.4 * SR)] ** 2))
        print(f"{name}: {len(y) / SR:.2f} s, first 0.4 s rms {head:.0f}, peak {np.max(np.abs(y)):.0f}")


if __name__ == "__main__":
    main()
