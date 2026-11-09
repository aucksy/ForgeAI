"""NVIDIA Magpie TTS Multilingual 357M (NVIDIA Open Model License, commercial use allowed).

    python gen_magpie.py
Makes one sample per built-in speaker it ships with (Aria, Sofia = female; Jason, Leo = male;
John is a public LibriVox reader and is skipped). English lines with language "en"; the Hinglish
line from its Devanagari spelling with language "hi". Classifier-free guidance on (the default).
"""
import os

import torch

from common import load_segments, run_voice

torch.set_num_threads(os.cpu_count() or 4)
torch.manual_seed(7)

from nemo.collections.tts.models import MagpieTTSModel  # noqa: E402

model = MagpieTTSModel.from_pretrained("nvidia/magpie_tts_multilingual_357m")
model.eval()
SR = int(getattr(model, "output_sample_rate", None) or getattr(model, "sample_rate", 22050))
SPEAKERS = {"Aria": 0, "Jason": 1, "Leo": 3, "Sofia": 4}
segments = load_segments("Mettle Up", "devanagari")

for name, idx in SPEAKERS.items():
    def synth(text, lang, idx=idx):
        with torch.inference_mode():
            audio, alen = model.do_tts(text, language=lang, apply_TN=False, speaker_index=idx)
        n = int(alen.reshape(-1)[0])
        return audio.reshape(-1)[:n].float().cpu().numpy(), SR

    run_voice(f"magpie-{name.lower()}", dict(model="NVIDIA Magpie TTS Multilingual 357M (v2607)",
                                              voice=f"built-in speaker {name}", settings="cfg on, sample rate %d" % SR,
                                              note="Hinglish line: language hi, Devanagari"),
              segments, synth)
