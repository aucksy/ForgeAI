"""Shared bits for the voice-sample jobs (.github/workflows/voice-samples.yml).

Every model job writes one folder per voice:
    out/<sample-id>/seg-<block>-<n>.wav   one generated segment, 16-bit mono WAV
    out/<sample-id>/meta.json             what was said, which model/voice/settings, tries, transcript
assemble.py then joins the segments with fixed pauses, evens the loudness and makes the mp3.

Generative models sometimes skip or repeat words. So each English segment is transcribed by
Whisper (faster-whisper small.en, MIT) right after it is made; if too many words are wrong it is
made again (up to MAX_TRIES) and the best try is kept. The transcript goes into meta.json.
"""
import json
import os
import re
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get("OUT_DIR", HERE / "out"))
MAX_TRIES = int(os.environ.get("MAX_TRIES", "3"))
GOOD_ENOUGH = 0.08  # word error rate at or below this is accepted on the first try


def load_segments(brand: str, hinglish: str):
    """[(block_name, index, lang, text)] in speaking order. hinglish = 'roman' | 'devanagari'."""
    data = json.loads((HERE / "lines.json").read_text(encoding="utf-8"))
    out = []
    for b in data["blocks"]:
        for i, s in enumerate(b["segments"], 1):
            if isinstance(s, dict):
                text = s[hinglish]
            else:
                text = s.replace("{BRAND}", brand)
            out.append((b["name"], i, b["lang"], text))
    return out


def write_wav(path: Path, audio, sr: int):
    a = np.asarray(audio, dtype=np.float32).reshape(-1)
    a = np.clip(a, -1.0, 1.0)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes((a * 32767.0).astype("<i2").tobytes())


_whisper = None


def _get_whisper():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel
        _whisper = WhisperModel("small.en", device="cpu", compute_type="int8")
    return _whisper


BRAND_FORMS = re.compile(r"\b(mettle|metal|medal|meddle|mettel)[\s-]*up\b")


def _norm(t: str):
    t = t.lower().replace("colors", "colours").replace("3", "three")
    t = BRAND_FORMS.sub("brandword", t)
    t = t.replace("mettleup", "brandword").replace("metalup", "brandword")
    t = re.sub(r"[^a-z' ]+", " ", t)
    return t.split()


def wer(ref: str, hyp: str) -> float:
    r, h = _norm(ref), _norm(hyp)
    if not r:
        return 0.0
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / len(r)


def transcribe(path: Path) -> str:
    segs, _ = _get_whisper().transcribe(str(path), language="en", beam_size=5)
    return " ".join(s.text.strip() for s in segs).strip()


def run_voice(sample_id: str, info: dict, segments, synth):
    """synth(text, lang) -> (float32 audio, sample_rate). Writes the folder for one voice."""
    folder = OUT / sample_id
    folder.mkdir(parents=True, exist_ok=True)
    meta = dict(info, sample_id=sample_id, segments=[])
    for block, idx, lang, text in segments:
        path = folder / f"seg-{block}-{idx}.wav"
        best = None
        tries = 1 if lang != "en" else MAX_TRIES
        for t in range(1, tries + 1):
            try:
                audio, sr = synth(text, lang)
            except Exception as e:  # keep going; a missing segment shows in the report
                print(f"[{sample_id}] {block}-{idx} try {t} FAILED: {e!r}", flush=True)
                continue
            tmp = folder / f"try-{t}.wav"
            write_wav(tmp, audio, sr)
            heard = transcribe(tmp) if lang == "en" else ""
            score = wer(text, heard) if lang == "en" else 0.0
            print(f"[{sample_id}] {block}-{idx} try {t}: wer={score:.2f} heard={heard!r}", flush=True)
            if best is None or score < best[0]:
                if best:
                    best[2].unlink(missing_ok=True)
                best = (score, heard, tmp, t)
            else:
                tmp.unlink(missing_ok=True)
            if score <= GOOD_ENOUGH:
                break
        if best is None:
            meta["segments"].append(dict(block=block, index=idx, lang=lang, text=text, file=None))
            continue
        best[2].replace(path)
        meta["segments"].append(dict(block=block, index=idx, lang=lang, text=text, file=path.name,
                                     tries=best[3], wer=round(best[0], 3), heard=best[1]))
    (folder / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return meta
