"""Joins each voice's segments into one mp3 and checks it.

    python assemble.py <in dir with <sample-id>/meta.json folders> <out dir>

Per voice: trim dead air off each segment, put 0.45 s between lines and 1.2 s between the three
blocks, even out the speaking pace (new voices are nudged into 2.45-2.95 English words per second,
by at most 12 %, so no voice wins or loses by speed; sample 0 is left exactly as heard), set the
loudness to -16 LUFS (two-pass ffmpeg loudnorm, so no voice wins by being louder), save a 192 kbps mp3.
Checks: length, clipping, silent gaps over 1.5 s, and a Whisper (medium, MIT) transcript of every
line so missing, repeated or wrong words show up. Writes report.json and report.md next to the mp3s.
"""
import difflib
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import wer  # noqa: E402

SRC, DST = Path(sys.argv[1]), Path(sys.argv[2])
DST.mkdir(parents=True, exist_ok=True)
LINE_GAP, BLOCK_GAP = 0.45, 1.2
PACE_LO, PACE_HI, MAX_STRETCH = 2.45, 2.95, 0.12


def read_wav(p: Path):
    with wave.open(str(p)) as w:
        sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def trim(a, sr):
    hop = int(0.01 * sr)
    if a.size < hop * 3:
        return a
    rms = np.sqrt(np.convolve(a ** 2, np.ones(hop) / hop, mode="same"))
    thr = max(0.004, 0.03 * float(np.abs(a).max()))
    idx = np.where(rms > thr)[0]
    if idx.size == 0:
        return a
    s = max(0, idx[0] - int(0.06 * sr))
    e = min(a.size, idx[-1] + int(0.15 * sr))
    return a[s:e]


def ff(*args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args], capture_output=True, text=True)


def write_wav(p, a, sr):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(a, -1, 1) * 32767).astype("<i2").tobytes())


from faster_whisper import WhisperModel  # noqa: E402
asr = WhisperModel("medium", device="cpu", compute_type="int8")


def hear(p, lang):
    segs, _ = asr.transcribe(str(p), language=lang, beam_size=5)
    return " ".join(s.text.strip() for s in segs).strip()


report = []
for meta_path in sorted(SRC.glob("*/meta.json")):
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sid, folder = meta["sample_id"], meta_path.parent
    pieces, sr, prev_block, clipped = [], None, None, 0
    en_words, en_secs, lines = 0, 0.0, []
    for s in meta["segments"]:
        if not s.get("file") or not (folder / s["file"]).exists():
            lines.append(dict(s, missing=True))
            continue
        a, r = read_wav(folder / s["file"])
        if sr is None:
            sr = r
        if r != sr:
            raise SystemExit(f"{sid}: mixed sample rates")
        clipped += int((np.abs(a) >= 0.999).sum())
        a = trim(a, sr)
        if pieces:
            gap = BLOCK_GAP if s["block"] != prev_block else LINE_GAP
            pieces.append(np.zeros(int(gap * sr), dtype=np.float32))
        pieces.append(a)
        prev_block = s["block"]
        if s["lang"] == "en":
            en_words += len(re.findall(r"[A-Za-z']+", s["text"]))
            en_secs += a.size / sr
        tmp = folder / ("trim-" + s["file"])
        write_wav(tmp, a, sr)
        heard = hear(tmp, "en" if s["lang"] == "en" else "hi")
        if s["lang"] == "en":
            score = round(wer(s["text"], heard), 3)
        else:
            score = round(1 - difflib.SequenceMatcher(None, s["text"].replace(" ", ""), heard.replace(" ", "")).ratio(), 3)
        lines.append(dict(block=s["block"], index=s["index"], text=s["text"], heard=heard, error=score,
                          seconds=round(a.size / sr, 2), tries=s.get("tries")))
    if not pieces:
        report.append(dict(sample_id=sid, failed=True))
        continue
    joined = np.concatenate(pieces)
    pace = en_words / en_secs if en_secs else 0
    tempo = 1.0
    if not sid.startswith("0-") and pace:
        if pace < PACE_LO:
            tempo = min(1 + MAX_STRETCH, PACE_LO / pace)
        elif pace > PACE_HI:
            tempo = max(1 - MAX_STRETCH, PACE_HI / pace)
    raw = DST / f"{sid}.raw.wav"
    write_wav(raw, joined, sr)
    pre = f"atempo={tempo:.4f}," if abs(tempo - 1) > 0.005 else ""
    m = ff("-i", str(raw), "-af", pre + "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-")
    js = json.loads(m.stderr[m.stderr.rindex("{"):m.stderr.rindex("}") + 1])
    ln = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
          f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
    mp3 = DST / f"{sid}.mp3"
    out = ff("-i", str(raw), "-af", pre + ln + ",aresample=44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", str(mp3))
    if out.returncode:
        raise SystemExit(out.stderr[-2000:])
    raw.unlink()
    chk = ff("-i", str(mp3), "-af", "ebur128=peak=true,silencedetect=n=-45dB:d=1.5", "-f", "null", "-")
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", chk.stderr)
    peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", chk.stderr)
    gaps = re.findall(r"silence_duration: ([\d.]+)", chk.stderr)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                               capture_output=True, text=True).stdout.strip())
    report.append(dict(sample_id=sid, model=meta.get("model"), voice=meta.get("voice"), settings=meta.get("settings"),
                       note=meta.get("note"), seconds=round(dur, 2), pace_words_per_s=round(pace, 2),
                       tempo_applied=round(tempo, 3), lufs=float(lufs[-1]) if lufs else None,
                       true_peak_dbfs=float(peak[-1]) if peak else None, clipped_samples_before=clipped,
                       gaps_over_1_5s=[float(g) for g in gaps], lines=lines))
    print(sid, f"{dur:.1f}s pace={pace:.2f} tempo={tempo:.3f}", flush=True)

(DST / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
md = ["| sample | seconds | pace w/s | tempo | LUFS | peak | clipped | long gaps | worst line error |", "|---|---|---|---|---|---|---|---|---|"]
for r in report:
    if r.get("failed"):
        md.append(f"| {r['sample_id']} | FAILED |||||||")
        continue
    worst = max((l.get("error", 1) for l in r["lines"] if not l.get("missing")), default=1)
    miss = sum(1 for l in r["lines"] if l.get("missing"))
    md.append(f"| {r['sample_id']} | {r['seconds']} | {r['pace_words_per_s']} | {r['tempo_applied']} | {r['lufs']} | "
              f"{r['true_peak_dbfs']} | {r['clipped_samples_before']} | {len(r['gaps_over_1_5s'])} | {worst}{' MISSING ' + str(miss) if miss else ''} |")
md.append("")
for r in report:
    if r.get("failed"):
        continue
    md.append(f"## {r['sample_id']}")
    for l in r["lines"]:
        md.append(f"- [{l.get('error')}] said: {l.get('text')}  \n  heard: {l.get('heard')}")
(DST / "report.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md))
