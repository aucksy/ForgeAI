"""Set a voice line to -16 LUFS with peaks held at -1.5 dBFS.

Plain two-pass loudnorm cannot lift a short, punchy line to -16 LUFS without passing the peak ceiling, so
it leaves such lines 2-3 dB quieter (seen in final-voice run 42672574870: "No card." lines at -19 LUFS).
Here every line gets the gain it needs and a fast limiter holds the peaks, so all lines match.

    python level.py <folder>      re-level every vo-*.wav under it in place and rebuild preview-<ad>.mp3
"""
import json
import re
import subprocess
import sys
from pathlib import Path

TARGET, CEIL = -16.0, 0.84  # 0.84 = -1.5 dBFS


def lufs(path) -> float:
    o = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", o)[-1])


def level(src, dst, sr=None):
    gain = 0.0
    tmp = Path(str(dst) + ".lvl.wav")
    for _ in range(3):  # the limiter shaves a little loudness; close the gap in up to 3 passes
        gain += TARGET - lufs(src if gain == 0.0 else tmp)
        args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-af",
                f"volume={gain:.2f}dB,alimiter=limit={CEIL}:attack=2:release=60:level=0"]
        if sr:
            args += ["-ar", str(sr)]
        subprocess.run(args + ["-ac", "1", "-c:a", "pcm_s16le", str(tmp)], check=True)
        if abs(lufs(tmp) - TARGET) <= 0.3:
            break
    tmp.replace(dst)
    return round(lufs(dst), 1)


def preview(folder: Path, ad: str):
    files = sorted((folder / ad).glob("vo-*.wav"), key=lambda p: int(p.stem.split("-")[1]))
    sil = folder / "sil.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "anullsrc=r=24000:cl=mono", "-t", "0.6", "-c:a", "pcm_s16le", str(sil)], check=True)
    lst = folder / "concat.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\nfile '{sil.resolve()}'\n" for p in files))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "192k", str(folder / f"preview-{ad}.mp3")], check=True)
    lst.unlink()
    sil.unlink()


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    rep_path = folder / "report.json"
    rep = json.loads(rep_path.read_text(encoding="utf-8")) if rep_path.exists() else []
    for wav in sorted(folder.glob("*/vo-*.wav")):
        out = level(wav, wav)
        n = int(wav.stem.split("-")[1])
        for r in rep:
            if r["ad"] == wav.parent.name and r["line"] == n:
                r["lufs"] = out
        print(f"{wav.parent.name}/{wav.name}: {out} LUFS", flush=True)
    for ad in sorted({w.parent.name for w in folder.glob("*/vo-*.wav")}):
        preview(folder, ad)
    if rep:
        rep_path.write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding="utf-8")
