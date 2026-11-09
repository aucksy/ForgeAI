"""FINAL ad voice in the voice the owner picked (sample 2, R-431): Chatterbox Multilingual V3, Indian-accent
female, copied from the SYNTHETIC Kokoro hf_beta clip (no real person), exaggeration 0.6, cfg 0.5, temp 0.8.

    python final_chatterbox.py <ref wav> <out dir> <ad id>[,<ad id>...]

Reads each ad's `say` lines from marketing/owner-ads/src/copy.json (read only) and writes the layout
marketing/owner-ads/scripts/voice-pack.mjs expects:
    <out>/chatterbox-female-indian/<ad id>/vo-<n>.wav   one per line, 24 kHz mono 16-bit, -16 LUFS
    <out>/chatterbox-female-indian/report.json           what was said and what Whisper heard, per line
    <out>/chatterbox-female-indian/preview-<ad id>.mp3   the lines joined, for listening
"MettleUp" is fed as "Mettle Up" so it is said as two clear words.

Every line is checked by Whisper (medium.en): wrong words, AND every full stop inside the line must leave a
real pause (>= 0.18 s of near-silence), because this voice once ran "on Pro. Free messages" together.
Up to 3 tries as one take; if no take passes, the line is made sentence by sentence (3 tries each) and the
sentences are joined with 0.3 s of silence. The best take is kept either way and the report says which.
"""
import json
import os
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import wer, write_wav  # noqa: E402

REF, OUT, ADS = sys.argv[1], Path(sys.argv[2]).resolve(), sys.argv[3].split(",")
NAME = "chatterbox-female-indian"
EXAG, CFG, TEMP = 0.6, 0.5, 0.8
TRIES, MIN_STOP, JOIN_GAP = 3, 0.18, 0.3
COPY = Path(__file__).resolve().parents[1] / "owner-ads" / "src" / "copy.json"

torch.set_num_threads(os.cpu_count() or 4)
torch.manual_seed(7)

from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
tts.prepare_conditionals(REF, exaggeration=EXAG)
SR = tts.sr
asr = WhisperModel("medium.en", device="cpu", compute_type="int8")


def gen(text):
    return tts.generate(text, language_id="en", exaggeration=EXAG, cfg_weight=CFG, temperature=TEMP).squeeze(0).cpu().numpy()


def trim(a):
    hop = int(0.01 * SR)
    rms = np.sqrt(np.convolve(a ** 2, np.ones(hop) / hop, mode="same"))
    idx = np.where(rms > max(0.004, 0.03 * float(np.abs(a).max())))[0]
    if idx.size == 0:
        return a
    return a[max(0, idx[0] - int(0.06 * SR)): min(a.size, idx[-1] + int(0.15 * SR))]


def norm_word(w):
    return re.sub(r"[^a-z']", "", w.lower())


def check(a, text, tmp):
    """-> (word error, shortest pause at a full stop inside the line (s), what Whisper heard)"""
    write_wav(tmp, a, SR)
    segs, _ = asr.transcribe(str(tmp), language="en", beam_size=5, word_timestamps=True)
    words = [w for s in segs for w in s.words]
    heard = " ".join(w.word.strip() for w in words).strip()
    score = wer(text, heard)
    # the word before each inner full stop, e.g. "pro" in "on Pro. Send ..."
    stops = [norm_word(m.group(1)) for m in re.finditer(r"(\w+)\.\s+\S", text)]
    hop = int(0.01 * SR)
    rms = np.sqrt(np.convolve(a ** 2, np.ones(hop) / hop, mode="same"))
    quiet = rms < 0.02 * float(np.abs(a).max())
    shortest, pos = 9.0, 0
    for sw in stops:
        # "MetalUp" can come back as one word, so a word that ends with the stop word counts too
        i = next((k for k in range(pos, len(words) - 1) if norm_word(words[k].word).endswith(sw)), None)
        if i is None:
            return score, 0.0, heard  # cannot find the stop: treat as run together
        pos = i + 1
        lo, hi = int(max(0, words[i].end - 0.15) * SR), int(min(a.size / SR, words[i + 1].start + 0.15) * SR)
        run = best = 0
        for q in quiet[lo:hi:hop]:
            run = run + 1 if q else 0
            best = max(best, run)
        shortest = min(shortest, best * 0.01)
    return score, (shortest if stops else 9.0), heard


def best_take(text, tmp, label):
    best = None
    for t in range(1, TRIES + 1):
        a = trim(gen(text))
        score, stop, heard = check(a, text, tmp)
        ok = score <= 0.08 and stop >= MIN_STOP
        print(f"  {label} try {t}: wer={score:.2f} stop={stop:.2f}s ok={ok} heard={heard!r}", flush=True)
        key = (not ok, score, -stop)
        if best is None or key < best[0]:
            best = (key, a, score, stop, heard, t)
        if ok:
            break
    return best


copy = json.loads(COPY.read_text(encoding="utf-8"))
root = OUT / NAME
report = []
for ad_id in ADS:
    ad = next(x for x in copy["ads"] if x["id"] == ad_id)
    preview = []
    for n, line in enumerate(ad["lines"], 1):
        say = line["say"]
        text = say.replace("MettleUp", "Mettle Up")
        tmp = OUT / "tmp.wav"
        print(f"{ad_id} line {n}: {text}", flush=True)
        b = best_take(text, tmp, "whole")
        how = "one take"
        audio, score, stop, heard, tries = b[1], b[2], b[3], b[4], b[5]
        if b[0][0]:  # no whole take passed: build it sentence by sentence
            parts = [p for p in re.split(r"(?<=\.)\s+", text) if p]
            if len(parts) > 1:
                takes = [best_take(p, tmp, f"part {k + 1}") for k, p in enumerate(parts)]
                gap = np.zeros(int(JOIN_GAP * SR), dtype=np.float32)
                joined = [takes[0][1]]
                for tk in takes[1:]:
                    joined += [gap, tk[1]]
                audio = np.concatenate(joined)
                score, stop, heard = check(audio, text, tmp)
                tries = [tk[5] for tk in takes]
                how = f"{len(parts)} sentences joined with {JOIN_GAP} s pauses"
        f = root / ad_id / f"vo-{n}.wav"
        raw = OUT / "raw.wav"
        write_wav(raw, audio, SR)
        m = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(raw), "-af",
                            "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
        js = json.loads(m.stderr[m.stderr.rindex("{"):m.stderr.rindex("}") + 1])
        ln = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
              f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
        f.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af", ln,
                        "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(f)], check=True)
        with wave.open(str(f)) as w:
            secs = w.getnframes() / w.getframerate()
        report.append(dict(ad=ad_id, line=n, say=say, spoken_as=text, how=how, tries=tries, word_error=round(score, 3),
                           shortest_stop_s=None if stop >= 9 else round(stop, 2), whisper_heard=heard, seconds=round(secs, 2)))
        preview.append(str(f.resolve()))
        print(f"  -> {f.relative_to(OUT)} {secs:.2f}s, {how}, heard: {heard}", flush=True)
    # listening preview: the lines with 0.6 s between them
    lst = OUT / "concat.txt"
    sil = OUT / "sil.wav"
    write_wav(sil, np.zeros(int(0.6 * SR), dtype=np.float32), SR)
    lst.write_text("".join(f"file '{p}'\nfile '{sil}'\n" for p in preview))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-c:a", "libmp3lame", "-b:a", "192k", str(root / f"preview-{ad_id}.mp3")], check=True)

for p in ["tmp.wav", "raw.wav", "concat.txt", "sil.wav"]:
    (OUT / p).unlink(missing_ok=True)
(root / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
for r in report:
    print(f"{r['ad']} {r['line']} [{r['how']}; err {r['word_error']}; stop {r['shortest_stop_s']}] {r['whisper_heard']}")
