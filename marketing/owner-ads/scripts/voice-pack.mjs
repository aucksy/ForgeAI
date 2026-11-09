/**
 * Picks the voice for the ads being rendered, BEFORE the bundle (timing.ts reads vo.json at bundle
 * time, so every scene follows the real length of whatever voice is chosen). Runs in the cloud render
 * (owner-ads.yml, input `voice`); never needs a key of its own.
 *
 *   VOICE=""        the voice files already in the repo (ads 01-05: Kokoro). An ad with none stays music-only.
 *   VOICE=none      music only for every ad in ONLY (lines timed by the lengths in vo.json).
 *   VOICE=<run id>  take the voice from that GitHub Actions run's artifacts (e.g. a voice-samples run):
 *                   any file named <ad-id>/vo-<n>.wav (or .mp3 .flac .ogg .m4a) inside them, one per
 *                   line of the ad's `say` text in src/copy.json, or the voice-samples layout
 *                   seg-ad-<ad-id>-<n>.wav (marketing/voice-samples, block "ad-<ad-id>"). VOICE_NAME
 *                   narrows to paths that contain it (the chosen voice's artifact or folder name).
 *
 * Env: ONLY (comma-separated ad ids), GH_TOKEN + GITHUB_REPOSITORY (for a run id).
 * Each imported line becomes mono 16-bit PCM WAV, trimmed of edge silence and peak-levelled, written to
 * public/audio/<id>/vo-<n>.wav (in the runner only); its exact length goes to vo.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = resolve(ROOT, 'public', 'audio');
const copy = JSON.parse(readFileSync(resolve(ROOT, 'src', 'copy.json'), 'utf8'));
const lenFile = resolve(AUDIO, 'vo.json');
const vo = JSON.parse(readFileSync(lenFile, 'utf8'));
const VOICE = (process.env.VOICE || '').trim();
const NAME = (process.env.VOICE_NAME || '').trim().toLowerCase();
const ids = (process.env.ONLY || copy.ads.map((a) => a.id).join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const novoice = new Set(vo._novoice || []);
const save = () => {
  vo._novoice = [...novoice];
  writeFileSync(lenFile, JSON.stringify(vo, null, 2) + '\n');
};

if (!VOICE) {
  for (const id of ids) console.log(`${id}: ${novoice.has(id) ? 'music only (no voice files yet)' : 'voice files from the repo'}`);
  process.exit(0);
}
if (VOICE === 'none') {
  for (const id of ids) { novoice.add(id); console.log(`${id}: music only`); }
  save();
  process.exit(0);
}
if (!/^\d+$/.test(VOICE)) throw new Error(`voice must be blank, "none" or a run id, got "${VOICE}"`);

// 1. download every artifact of that run
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
if (!repo || !token) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are needed to read a run');
const api = (p) => fetch(`https://api.github.com/repos/${repo}${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
const list = await (await api(`/actions/runs/${VOICE}/artifacts?per_page=100`)).json();
if (!list.artifacts?.length) throw new Error(`run ${VOICE} has no artifacts (expired, or still running?)`);
const dir = resolve(tmpdir(), `voice-${VOICE}`);
mkdirSync(dir, { recursive: true });
for (const a of list.artifacts) {
  if (a.expired) continue;
  // the zip link redirects to storage; follow it WITHOUT the token
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/artifacts/${a.id}/zip`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' });
  const loc = r.headers.get('location');
  const z = loc ? await fetch(loc) : r;
  if (!z.ok) throw new Error(`artifact ${a.name}: HTTP ${z.status}`);
  const zip = join(dir, `${a.id}.zip`);
  writeFileSync(zip, Buffer.from(await z.arrayBuffer()));
  execFileSync('unzip', ['-q', '-o', zip, '-d', join(dir, a.name)]);
  console.log(`artifact ${a.name}: ${a.size_in_bytes} bytes`);
}
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(dir);
const rel = (p) => relative(dir, p).replace(/\\/g, '/');

// 2. WAV <-> samples
function readWav(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4), len = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(pos + 8), ch: buf.readUInt16LE(pos + 10), sr: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
    if (id === 'data') { data = buf.subarray(pos + 8, Math.min(buf.length, pos + 8 + len)); break; }
    pos += 8 + len + (len % 2);
  }
  if (!fmt || !data) return null;
  const pcm16 = (fmt.format === 1 || fmt.format === 0xfffe) && fmt.bits === 16;
  const f32 = (fmt.format === 3 || fmt.format === 0xfffe) && fmt.bits === 32;
  if (!pcm16 && !f32) return null;
  const bytes = fmt.bits / 8, n = Math.floor(data.length / (bytes * fmt.ch));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const o = (i * fmt.ch + c) * bytes;
      s += pcm16 ? data.readInt16LE(o) / 32768 : data.readFloatLE(o);
    }
    out[i] = s / fmt.ch;
  }
  return { sr: fmt.sr, samples: out };
}
function decode(file) {
  const direct = readWav(readFileSync(file));
  if (direct) return direct;
  const tmp = `${file}.pcm.wav`;
  execFileSync('npx', ['--no-install', 'remotion', 'ffmpeg', '-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-c:a', 'pcm_s16le', tmp], { cwd: ROOT, stdio: 'inherit' });
  const w = readWav(readFileSync(tmp));
  if (!w) throw new Error(`could not decode ${rel(file)}`);
  return w;
}
function writeLine({ sr, samples }, out) {
  const FLOOR = 0.01;
  let a = 0, b = samples.length - 1;
  while (a < samples.length && Math.abs(samples[a]) <= FLOOR) a++;
  while (b > a && Math.abs(samples[b]) <= FLOOR) b--;
  a = Math.max(0, a - Math.round(0.06 * sr));
  b = Math.min(samples.length - 1, b + Math.round(0.12 * sr));
  let peak = 0;
  for (let i = a; i <= b; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0 ? 0.89 / peak : 1; // every voice at the same loudness ceiling (-1 dB)
  const n = b - a + 1;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[a + i] * gain)) * 32767), 44 + i * 2);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  return Math.round((n / sr) * 1000) / 1000;
}

// 3. one file per line of each ad
for (const id of ids) {
  const ad = copy.ads.find((x) => x.id === id);
  if (!ad) throw new Error(`no ad ${id} in copy.json`);
  const lens = [];
  for (let n = 1; n <= ad.lines.length; n++) {
    const re = new RegExp(`((^|/)${id}/vo-${n}|(^|/)seg-ad-${id}-${n})\\.(wav|mp3|flac|ogg|m4a)$`, 'i');
    const hits = files.filter((p) => re.test(rel(p)) && (!NAME || rel(p).toLowerCase().includes(NAME)));
    if (hits.length !== 1) {
      throw new Error(`${id} line ${n} ("${ad.lines[n - 1].say}"): ${hits.length ? 'several files, set voice_name: ' + hits.map(rel).join(', ') : `no file */${id}/vo-${n}.wav${NAME ? ` under "${NAME}"` : ''} in run ${VOICE}`}`);
    }
    lens.push(writeLine(decode(hits[0]), resolve(AUDIO, id, `vo-${n}.wav`)));
    console.log(`${id} line ${n}: ${rel(hits[0])} -> ${lens[n - 1]} s`);
  }
  vo[id] = lens;
  novoice.delete(id);
}
vo._voice_run = { run: VOICE, name: NAME || null, ads: ids };
save();
