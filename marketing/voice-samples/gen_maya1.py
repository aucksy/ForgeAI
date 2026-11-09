"""Maya1 (Maya Research, Apache 2.0) voice samples. The voice is designed from a written description
(no reference recording), and the model's training data had an India-first focus.

    python gen_maya1.py <sample-id> <female|male>
Runs on a CPU: bf16 when the processor supports it, else fp32. Settings from the model card
(temperature 0.4, top_p 0.9, repetition_penalty 1.1). Decoder: SNAC 24 kHz (MIT).
"""
import os
import sys

import numpy as np
import torch
from snac import SNAC
from transformers import AutoModelForCausalLM, AutoTokenizer

from common import load_segments, run_voice

torch.set_num_threads(os.cpu_count() or 4)
torch.manual_seed(7)

sample_id, gender = sys.argv[1], sys.argv[2]
DESCRIPTIONS = {
    "female": "Female voice in her late 20s with an Indian accent. Warm, confident and friendly, "
              "clear diction, medium pitch, natural conversational pacing, polished advert voiceover.",
    "male": "Male voice in his 30s with an Indian accent. Warm baritone, confident and friendly, "
            "clear diction, natural conversational pacing, polished advert voiceover.",
}
DESC = DESCRIPTIONS[gender]

CODE_START, CODE_END, OFFSET = 128257, 128258, 128266
SNAC_MIN, SNAC_MAX = 128266, 156937
SOH, EOH, SOA, TEXT_EOT = 128259, 128260, 128261, 128009

flags = open("/proc/cpuinfo").read()
DTYPE = torch.bfloat16 if ("avx512_bf16" in flags or "amx_bf16" in flags) else torch.float32
print("dtype", DTYPE, flush=True)
model = AutoModelForCausalLM.from_pretrained("maya-research/maya1", torch_dtype=DTYPE, low_cpu_mem_usage=True)
model.eval()
tok = AutoTokenizer.from_pretrained("maya-research/maya1")
snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval()


def prompt(text):
    return (tok.decode([SOH]) + tok.bos_token + f'<description="{DESC}"> {text}' + tok.decode([TEXT_EOT])
            + tok.decode([EOH]) + tok.decode([SOA]) + tok.decode([CODE_START]))


def synth(text, lang):
    inputs = tok(prompt(text), return_tensors="pt", add_special_tokens=False)
    words = max(4, len(text.split()))
    with torch.inference_mode():
        out = model.generate(**inputs, max_new_tokens=min(2048, 140 + words * 60), min_new_tokens=28,
                             temperature=0.4, top_p=0.9, repetition_penalty=1.1, do_sample=True,
                             eos_token_id=CODE_END, pad_token_id=tok.pad_token_id or CODE_END)
    ids = out[0, inputs["input_ids"].shape[1]:].tolist()
    if CODE_END in ids:
        ids = ids[:ids.index(CODE_END)]
    codes = [t for t in ids if SNAC_MIN <= t <= SNAC_MAX]
    frames = len(codes) // 7
    if frames < 4:
        raise RuntimeError("too few audio tokens")
    l1, l2, l3 = [], [], []
    for i in range(frames):
        s = codes[i * 7:(i + 1) * 7]
        l1.append((s[0] - OFFSET) % 4096)
        l2 += [(s[1] - OFFSET) % 4096, (s[4] - OFFSET) % 4096]
        l3 += [(s[2] - OFFSET) % 4096, (s[3] - OFFSET) % 4096, (s[5] - OFFSET) % 4096, (s[6] - OFFSET) % 4096]
    with torch.inference_mode():
        audio = snac.decoder(snac.quantizer.from_codes(
            [torch.tensor(l, dtype=torch.long).unsqueeze(0) for l in (l1, l2, l3)]))
    a = audio[0, 0].float().cpu().numpy()
    return a[2048:] if a.size > 4096 else a, 24000  # the card's example drops the first 2048 samples


run_voice(sample_id, dict(model="Maya1 (Maya Research)", voice=f"designed: {DESC}",
                          settings=f"temperature 0.4, top_p 0.9, repetition_penalty 1.1, {DTYPE}",
                          note="Hinglish line: Roman spelling"),
          load_segments("Mettle Up", "roman"), synth)
