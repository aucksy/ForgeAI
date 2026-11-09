/**
 * Voiceover for the owner ads with Kokoro-82M (free, Apache-2.0, runs on a CPU, no key).
 *
 *   node scripts/generate-vo.mjs                 every line of every ad
 *   ONLY=01-pending-fee node scripts/generate-vo.mjs
 *   SAMPLE=1 node scripts/generate-vo.mjs        one line in several voices -> public/audio/samples/
 *
 * KOKORO_JS: path to kokoro-js's dist/kokoro.js when it is not installed here (on Aakash's PC the
 * AIagency project already has it and its model cached, so nothing is downloaded again).
 *
 * Kokoro has no Indian-English voice. Its Hindi voices (hf_*, hm_*) read English phonemes with an
 * Indian accent, so VOICE defaults to one of them; kokoro-js refuses non-English voice names, so
 * the check is switched off and the British phoneme set is used (closer to Indian English).
 * Every line is trimmed of Kokoro's ~0.75 s of edge silence and written as 16-bit PCM WAV, whose
 * header states its exact length (no mp3 clock trouble). Lengths go to public/audio/vo.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const AUDIO = resolve(ROOT, 'public', 'audio');
const copy = JSON.parse(readFileSync(resolve(ROOT, 'src', 'copy.json'), 'utf8'));

const VOICE = process.env.VOICE || 'hm_omega';
const SPEED = Number(process.env.SPEED || 1.0);

const mod = await import(process.env.KOKORO_JS ? pathToFileURL(process.env.KOKORO_JS).href : 'kokoro-js');
const tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
tts._validate_voice = () => {};

/** Float WAV from kokoro-js -> trimmed 16-bit PCM WAV. */
function toPcm16Trimmed(audio) {
  const data = audio.audio; // Float32Array
  const sr = audio.sampling_rate;
  const FLOOR = 0.01;
  let a = 0;
  while (a < data.length && Math.abs(data[a]) <= FLOOR) a++;
  let b = data.length - 1;
  while (b > a && Math.abs(data[b]) <= FLOOR) b--;
  a = Math.max(0, a - Math.round(0.09 * sr));
  b = Math.min(data.length - 1, b + Math.round(0.12 * sr));
  const n = b - a + 1;
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[a + i])) * 32767), 44 + i * 2);
  return { buf: out, seconds: n / sr };
}

async function say(text, voice, file) {
  const audio = await tts.generate(text, { voice, speed: SPEED });
  const { buf, seconds } = toPcm16Trimmed(audio);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return seconds;
}

if (process.env.SAMPLE) {
  const line = copy.ads[0].lines[1].say;
  for (const v of ['af_heart', 'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi', 'am_michael']) {
    const s = await say(line, v, resolve(AUDIO, 'samples', `${v}.wav`));
    console.log(v, s.toFixed(2));
  }
  process.exit(0);
}

const lenFile = resolve(AUDIO, 'vo.json');
let lens = {};
try { lens = JSON.parse(readFileSync(lenFile, 'utf8')); } catch { /* first run */ }
for (const ad of copy.ads) {
  if (process.env.ONLY && ad.id !== process.env.ONLY) continue;
  lens[ad.id] = [];
  for (let i = 0; i < ad.lines.length; i++) {
    const s = await say(ad.lines[i].say, VOICE, resolve(AUDIO, ad.id, `vo-${i + 1}.wav`));
    lens[ad.id].push(Math.round(s * 1000) / 1000);
    console.log(ad.id, i + 1, s.toFixed(2), 's');
  }
  if (lens._novoice) lens._novoice = lens._novoice.filter((x) => x !== ad.id);
}
lens._voice = VOICE;
lens._speed = SPEED;
writeFileSync(lenFile, JSON.stringify(lens, null, 2) + '\n');
