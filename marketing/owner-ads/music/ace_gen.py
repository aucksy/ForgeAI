"""One music option from ACE-Step 1.5 (MIT; "You can strictly use the generated music for commercial
purposes", huggingface.co/ACE-Step/Ace-Step1.5). Runs in .github/workflows/music-choices.yml on a CPU runner.

    python ace_gen.py <ace-step source dir> <style id> <out dir>

DiT only (turbo, 8 steps): the 5Hz language model is not loaded and "thinking" is off, so the caption
below goes straight to the music model. Instrumental, no lyrics. Two seeds per style; finish.py keeps the
stronger one. No artist or song is named anywhere in a caption.
"""
import os
import sys
import time

SRC, STYLE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, SRC)

STYLES = {
    "1-metal-riff": dict(
        caption="A heavy industrial metal instrumental. Down-tuned, heavily distorted electric guitars play a tight "
                "palm-muted riff over punchy drums with fast double kick and a driving bass. Aggressive, powerful and "
                "energetic. No vocals.",
        bpm=140, key="E minor"),
    "2-steel-industrial": dict(
        caption="An industrial electronic instrumental built from the sounds of a steel forge: metallic percussion, "
                "ringing steel clangs, anvil strikes and a hammer hitting a metal plate, over a gritty distorted synth "
                "bass and a mechanical, driving groove. Dark and powerful. No vocals.",
        bpm=128, key="D minor"),
    "3-trailer-hybrid": dict(
        caption="A hybrid cinematic trailer instrumental. A pulsing synth bass ostinato drives forward while huge "
                "metallic impacts and deep braams hit on the downbeats, with big drums and rising tension. Epic and "
                "energetic. No vocals.",
        bpm=120, key="C minor"),
    "4-gym-drive": dict(
        caption="A high-energy gym workout instrumental mixing rock and electronic dance music: a driving "
                "four-on-the-floor kick, crunchy distorted guitar power chords, bright synth stabs and claps. "
                "Motivating, uplifting and full of energy. No vocals.",
        bpm=128, key="A minor"),
}
SEEDS = [1108, 2026]

from acestep.handler import AceStepHandler  # noqa: E402
from acestep.inference import GenerationConfig, GenerationParams, generate_music  # noqa: E402

s = STYLES[STYLE]
t0 = time.time()
dit = AceStepHandler()
msg, ok = dit.initialize_service(project_root=SRC, config_path="acestep-v15-turbo", device="cpu",
                                 offload_to_cpu=False, use_mlx_dit=False)
print(f"init {time.time() - t0:.0f}s ok={ok}: {msg}", flush=True)
if not ok:
    sys.exit(1)

os.makedirs(OUT, exist_ok=True)
params = GenerationParams(
    task_type="text2music", caption=s["caption"], lyrics="[Instrumental]", instrumental=True,
    duration=24, bpm=s["bpm"], keyscale=s["key"], timesignature="4",
    inference_steps=8, shift=3.0, thinking=False,
    use_cot_metas=False, use_cot_caption=False, use_cot_language=False,
)
config = GenerationConfig(batch_size=len(SEEDS), use_random_seed=False, seeds=SEEDS, audio_format="wav")
t0 = time.time()
res = generate_music(dit, None, params=params, config=config, save_dir=OUT)
print(f"generate {time.time() - t0:.0f}s success={res.success} {getattr(res, 'status_message', '')} {getattr(res, 'error', '')}", flush=True)
if not res.success:
    sys.exit(1)
for i, a in enumerate(res.audios):
    p = a.get("path")
    if p and os.path.exists(p):
        dst = os.path.join(OUT, f"{STYLE}-s{SEEDS[i] if i < len(SEEDS) else i}.wav")
        os.replace(p, dst)
        print("wrote", dst, flush=True)
