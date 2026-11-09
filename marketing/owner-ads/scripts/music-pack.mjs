/**
 * Swaps the music bed for one of the music options, BEFORE the bundle (owner-ads.yml input `music`).
 *
 *   MUSIC=""        the procedural bed from synth-audio.mjs (ads 01-05 as first rendered).
 *   MUSIC=<run id>  a music-choices run: its artifact "music-choices" holds <n>-<style>.wav (21 s, -16 LUFS,
 *                   its own steel-hit ending). MUSIC_NAME = the option's number or name ("2", "2-steel-industrial").
 *
 * Writes public/audio/music.wav (in the runner only) and its length to vo.json `_music_seconds`; the film
 * then starts the track late enough that its ending lands exactly on the ad's last frame (timing.ts music()).
 * Env: GH_TOKEN + GITHUB_REPOSITORY.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = resolve(ROOT, 'public', 'audio');
const MUSIC = (process.env.MUSIC || '').trim();
const NAME = (process.env.MUSIC_NAME || '').trim().toLowerCase();
if (!MUSIC) { console.log('music: the procedural bed'); process.exit(0); }
if (!/^\d+$/.test(MUSIC)) throw new Error(`music must be blank or a run id, got "${MUSIC}"`);
if (!NAME) throw new Error('music_name is needed with a music run (the option number, e.g. 2)');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
if (!repo || !token) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are needed to read a run');
const list = await (await fetch(`https://api.github.com/repos/${repo}/actions/runs/${MUSIC}/artifacts?per_page=100`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
})).json();
const art = (list.artifacts || []).find((a) => a.name === 'music-choices' && !a.expired);
if (!art) throw new Error(`run ${MUSIC} has no "music-choices" artifact (expired, or still running?)`);
const r = await fetch(`https://api.github.com/repos/${repo}/actions/artifacts/${art.id}/zip`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' });
const loc = r.headers.get('location');
const z = loc ? await fetch(loc) : r; // storage link: no token
if (!z.ok) throw new Error(`music-choices: HTTP ${z.status}`);
const dir = resolve(tmpdir(), `music-${MUSIC}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'm.zip'), Buffer.from(await z.arrayBuffer()));
execFileSync('unzip', ['-q', '-o', join(dir, 'm.zip'), '-d', dir]);

const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(dir);
const hits = files.filter((p) => {
  const b = basename(p).toLowerCase();
  return b.endsWith('.wav') && !b.includes('-with-voice') && (b === `${NAME}.wav` || b.startsWith(`${NAME}-`));
});
if (hits.length !== 1) throw new Error(`music_name "${NAME}": ${hits.length} matches in run ${MUSIC}: ${files.map((p) => basename(p)).join(', ')}`);

const buf = readFileSync(hits[0]);
let pos = 12, byteRate = 0, seconds = 0;
while (pos + 8 <= buf.length) {
  const id = buf.toString('latin1', pos, pos + 4), len = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ') byteRate = buf.readUInt32LE(pos + 16);
  if (id === 'data') { seconds = len / byteRate; break; }
  pos += 8 + len + (len % 2);
}
if (!seconds) throw new Error(`${basename(hits[0])} is not a PCM WAV`);
copyFileSync(hits[0], resolve(AUDIO, 'music.wav'));
const lenFile = resolve(AUDIO, 'vo.json');
const vo = JSON.parse(readFileSync(lenFile, 'utf8'));
vo._music_seconds = Math.round(seconds * 1000) / 1000;
vo._music_run = { run: MUSIC, file: basename(hits[0]) };
writeFileSync(lenFile, JSON.stringify(vo, null, 2) + '\n');
console.log(`music: ${basename(hits[0])} (${seconds.toFixed(2)} s) from run ${MUSIC}`);
