/**
 * Kokoro-82M voiceover — free, Apache-2.0, runs on this CPU, no key, no bill.
 *
 * English goes straight through kokoro-js. Hindi does not: the eSpeak NG build
 * inside the `phonemizer` npm package carries English voice data only, and
 * kokoro-js refuses any voice whose name does not start with a/b. The model is
 * multilingual all the same, and the Hindi voice weights ship inside
 * node_modules/kokoro-js/voices. So Hindi is phonemised by the full eSpeak NG
 * in Python (scripts/hi-phonemes.py) and the phonemes are handed to the model
 * directly, past the language gate.
 *
 * Output is 24 kHz mono WAV — Remotion reads it as-is, and a WAV's length is in
 * its header, so nothing has to guess a duration.
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {KokoroTTS} from 'kokoro-js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const AUDIO_DIR = resolve(ROOT, 'public', 'audio');

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** fp32 is the honest one. q8 saves 240 MB of download and adds a metallic edge. */
const DTYPE = (process.env.KOKORO_DTYPE || 'fp32') as 'fp32' | 'q8';

let cached: Promise<KokoroTTS> | null = null;
export function loadTts(): Promise<KokoroTTS> {
  if (!cached) {
    console.log(`  loading Kokoro-82M (${DTYPE}) — first run downloads it, then it is cached`);
    cached = KokoroTTS.from_pretrained(MODEL, {dtype: DTYPE, device: 'cpu'});
  }
  return cached;
}

/** Devanagari -> IPA, through the full eSpeak NG that only Python can reach here. */
export function hindiPhonemes(lines: string[]): string[] {
  const out = execFileSync('python', [resolve(HERE, 'hi-phonemes.py'), JSON.stringify(lines)], {
    encoding: 'utf8',
    maxBuffer: 1 << 22,
  });
  return JSON.parse(out.trim().split('\n').pop() as string);
}

/**
 * Cuts the dead air off both ends of a generated line.
 *
 * Kokoro puts about 0.3s of silence in front of every line and 0.45s behind it.
 * Measured across the eleven lines of the journey film that was 7.9 seconds of
 * a 70 second film doing nothing — and it is silence the film cannot see, because
 * scene lengths are derived from the file's length. On top of it the film then
 * adds its own designed lead-in and tail, so every scene was starting late and
 * ending long. Trimming here makes those designed gaps mean what they say.
 *
 * A small margin is kept either side so no first consonant is ever clipped.
 */
const LEAD_KEEP = 0.04;
const TAIL_KEEP = 0.12;
const FLOOR = 0.01;

export function trimSilence(buf: Buffer): Buffer {
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  const bytes = bits / 8;
  const block = channels * bytes;

  let pos = 12;
  let start = -1;
  let size = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    const len = buf.readUInt32LE(pos + 4);
    if (id === 'data') { start = pos + 8; size = Math.min(len, buf.length - start); break; }
    pos += 8 + len + (len % 2);
  }
  if (start < 0 || !block) return buf;

  const frames = Math.floor(size / block);
  const at = (i: number) => {
    let peak = 0;
    for (let c = 0; c < channels; c++) {
      const o = start + i * block + c * bytes;
      const v = bits === 32 ? buf.readFloatLE(o) : buf.readInt16LE(o) / 32768;
      peak = Math.max(peak, Math.abs(v));
    }
    return peak;
  };

  let first = 0;
  while (first < frames && at(first) <= FLOOR) first++;
  let last = frames - 1;
  while (last > first && at(last) <= FLOOR) last--;
  if (first >= last) return buf;

  const from = Math.max(0, first - Math.round(LEAD_KEEP * sampleRate));
  const to = Math.min(frames - 1, last + Math.round(TAIL_KEEP * sampleRate));
  const data = buf.subarray(start + from * block, start + (to + 1) * block);

  const out = Buffer.alloc(44 + data.length);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + data.length, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(buf.readUInt16LE(20), 20); // 1 = PCM, 3 = float
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * block, 28);
  out.writeUInt16LE(block, 32);
  out.writeUInt16LE(bits, 34);
  out.write('data', 36);
  out.writeUInt32LE(data.length, 40);
  data.copy(out, 44);
  return out;
}

export type Voice = string;

/** One line -> one WAV on disk. Returns its exact length in seconds. */
export async function speak(
  text: string,
  opts: {voice: Voice; lang: 'en' | 'hi'; speed?: number; out: string},
): Promise<number> {
  const tts = await loadTts();
  const speed = opts.speed ?? 1;

  let audio;
  if (opts.lang === 'hi') {
    const [ipa] = hindiPhonemes([text]);
    const {input_ids} = (tts as any).tokenizer(ipa, {truncation: true});
    audio = await (tts as any).generate_from_ids(input_ids, {voice: opts.voice, speed});
  } else {
    audio = await tts.generate(text, {voice: opts.voice as never, speed});
  }

  const wav = trimSilence(Buffer.from(audio.toWav()));
  mkdirSync(dirname(opts.out), {recursive: true});
  writeFileSync(opts.out, wav);
  return wavSeconds(wav);
}

/** A WAV states its own length. No bitrate guessing, no VBR trap. */
export function wavSeconds(buf: Buffer): number {
  const byteRate = buf.readUInt32LE(28);
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'data') return size / byteRate;
    pos += 8 + size + (size % 2);
  }
  return (buf.length - 44) / byteRate;
}
