"""Chatterbox Multilingual V3 (Resemble AI, MIT) voice samples.

    python gen_chatterbox.py <sample-id> <voice> en    every line with Multilingual V3
    python gen_chatterbox.py <sample-id> <voice> hi    redo the Hinglish line with the Hindi finetune
voice:
  builtin          the model's own built-in voice (conds.pt that ships with the model)
  ref:<wav path>   a SYNTHETIC reference clip made by Kokoro in the same workflow run (no real
                   person's voice is used anywhere)

"en" mode: Multilingual V3 (t3_mtl23ls_v3) reads every line; the Hinglish line with language "hi".
"hi" mode: runs in its own Python environment (the Hindi finetune's loader code, from Resemble AI's
own Hindi demo Space, needs older library versions than the pip package) and replaces the Hinglish
line with the official finetune ResembleAI/Chatterbox-Multilingual-hi. If it fails, the V3 take stays.
Settings: exaggeration 0.6 (a little livelier than neutral 0.5, for an ad), cfg_weight 0.5 (CB_CFG; lower =
slower, steadier read: the built-in voice reads fast, so it gets 0.3), temp 0.8.
"""
import json
import os
import sys
from pathlib import Path

import torch

from common import OUT, load_segments, run_voice, write_wav

torch.set_num_threads(os.cpu_count() or 4)
torch.manual_seed(7)

sample_id, voice, mode = sys.argv[1], sys.argv[2], sys.argv[3]
ref = voice.split(":", 1)[1] if voice.startswith("ref:") else None
EXAG, CFG, TEMP = 0.6, float(os.environ.get("CB_CFG", "0.5")), 0.8
segments = load_segments("Mettle Up", "devanagari")

if mode == "en":
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    mtl = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
    if ref:
        mtl.prepare_conditionals(ref, exaggeration=EXAG)

    def synth(text, lang):
        wav = mtl.generate(text, language_id=lang, exaggeration=EXAG, cfg_weight=CFG, temperature=TEMP)
        return wav.squeeze(0).cpu().numpy(), mtl.sr

    run_voice(sample_id, dict(model="Chatterbox Multilingual V3 (Resemble AI)",
                              voice=("built-in voice" if not ref else f"synthetic reference {Path(ref).name}"),
                              settings=f"exaggeration={EXAG} cfg_weight={CFG} temperature={TEMP}",
                              note="Hinglish line: Multilingual V3, language hi"),
              segments, synth)
    sys.exit(0)

# mode == "hi": the space code was copied to $CB_HI_ROOT/cbhi by the workflow
sys.path.insert(0, os.environ["CB_HI_ROOT"])
from cbhi.src.chatterbox.tts import ChatterboxTTS  # noqa: E402

model = ChatterboxTTS.from_pretrained("cpu")
if ref:
    model.prepare_conditionals(ref, exaggeration=EXAG)
folder = OUT / sample_id
meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
for block, idx, lang, text in segments:
    if lang != "hi":
        continue
    wav = model.generate(text, language_id="hi", exaggeration=EXAG, cfg_weight=CFG, temperature=TEMP)
    name = f"seg-{block}-{idx}.wav"
    write_wav(folder / name, wav.squeeze(0).cpu().numpy(), model.sr)
    for s in meta["segments"]:
        if s["block"] == block and s["index"] == idx:
            s["file"] = name
meta["note"] = "Hinglish line: official Hindi finetune (ResembleAI/Chatterbox-Multilingual-hi)"
(folder / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
print("Hindi finetune line written for", sample_id)
