/**
 * Sample 0: the voice the owner ads use today, made exactly the way marketing/owner-ads/scripts/
 * generate-vo.mjs makes it (kokoro-js 1.2.1, Kokoro-82M fp32, voice hf_alpha, speed 0.9, the
 * voice check switched off so the British phoneme set is used). The brand is spelled "MettleUp",
 * as in the ads.
 *
 * Also writes two SYNTHETIC reference clips (Kokoro hf_beta, hm_omega) that Chatterbox uses to
 * pick an Indian-accented voice. No real person's voice is used anywhere.
 *
 *   node gen_kokoro.mjs <out dir> <ref dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KokoroTTS } from 'kokoro-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2]);
const REF = resolve(process.argv[3]);
const lines = JSON.parse(readFileSync(resolve(HERE, 'lines.json'), 'utf8'));

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
tts._validate_voice = () => {};

function wav16(audio) {
  const data = audio.audio, sr = audio.sampling_rate, n = data.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), 44 + i * 2);
  return out;
}

const id = '0-current-kokoro';
const folder = resolve(OUT, id);
mkdirSync(folder, { recursive: true });
const meta = { sample_id: id, model: 'Kokoro-82M (hexgrad), via kokoro-js 1.2.1', voice: 'hf_alpha',
  settings: 'speed 0.9, fp32 (exactly as the owner ads today)', note: 'Hinglish line: Roman spelling', segments: [] };
for (const b of lines.blocks) {
  for (let i = 0; i < b.segments.length; i++) {
    const s = b.segments[i];
    const text = typeof s === 'string' ? s.replace('{BRAND}', 'MettleUp') : s.roman;
    const audio = await tts.generate(text, { voice: 'hf_alpha', speed: 0.9 });
    const file = `seg-${b.name}-${i + 1}.wav`;
    writeFileSync(resolve(folder, file), wav16(audio));
    meta.segments.push({ block: b.name, index: i + 1, lang: b.lang, text, file });
    console.log(id, file, (audio.audio.length / audio.sampling_rate).toFixed(2), 's');
  }
}
writeFileSync(resolve(folder, 'meta.json'), JSON.stringify(meta, null, 2));

mkdirSync(REF, { recursive: true });
const refText = 'Hello, and thank you for joining us today. Running a gym is hard work, so we built a simple '
  + 'way to see every member, every payment and every workout in one place. It is quick to set up, '
  + 'and your members will love it.';
for (const v of ['hf_beta', 'hm_omega']) {
  const audio = await tts.generate(refText, { voice: v, speed: 1.0 });
  writeFileSync(resolve(REF, `${v}.wav`), wav16(audio));
  console.log('reference', v, (audio.audio.length / audio.sampling_rate).toFixed(2), 's');
}
