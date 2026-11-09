/**
 * The music bed and the sound effects, written in code: no file, no API, no licence, no cost.
 * Adapted from D:/Apps/Pause/Marketing/remotion/scripts/synth-music.ts (and the AIagency "drive"
 * version). Deterministic: a fixed-seed noise source, so every run writes the same bytes.
 *
 *   node scripts/synth-audio.mjs   -> public/audio/music.wav, whoosh.wav, hit.wav, tick.wav, shine.wav
 *
 * Mood: a gym owner's money and members, so it moves: A minor - F - C - G at 100 BPM, a soft
 * kick on every beat, an off-beat hat, a sub under each chord, a plucked arpeggio and wide pads.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../public/audio');
mkdirSync(OUT, { recursive: true });
const SR = 44100;

let seed = 0x5eed1234;
const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function writeWav(name, L, R) {
  const n = L.length;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0 ? 0.89 / peak : 1;
  const out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    out.writeInt16LE(Math.round(Math.tanh(L[i] * k) * 32000), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.tanh(R[i] * k) * 32000), 46 + i * 4);
  }
  writeFileSync(resolve(OUT, name), out);
  console.log(`${name}  ${(n / SR).toFixed(2)} s`);
}

// ---------------------------------------------------------------- music
{
  const DUR = 24;
  const N = SR * DUR;
  const L = new Float64Array(N), R = new Float64Array(N);
  const BPM = 100, beat = 60 / BPM, bar = beat * 4;
  const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan); R[i] += v * (1 + pan); } };

  const prog = [
    { bass: 33, pad: [57, 60, 64, 69], arp: [69, 72, 76, 72] }, // Am
    { bass: 29, pad: [57, 60, 65, 69], arp: [69, 72, 77, 72] }, // F
    { bass: 36, pad: [55, 60, 64, 67], arp: [67, 72, 76, 72] }, // C
    { bass: 31, pad: [55, 59, 62, 67], arp: [67, 71, 74, 71] }, // G
  ];

  const pad = (t0, f, dur, amp, pan) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < dur * SR; i++) {
      const t = i / SR;
      const env = Math.max(0, Math.min(1, t / 0.5, (dur - t) / 0.6));
      const w = Math.sin(2 * Math.PI * f * t) + 0.45 * Math.sin(2 * Math.PI * f * 1.006 * t) + 0.18 * Math.sin(2 * Math.PI * f * 2.003 * t);
      add(s0 + i, amp * env * w, pan);
    }
  };
  const pluck = (t0, f, amp, pan) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < 0.5 * SR; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.004) * Math.exp(-t * 9);
      const w = Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 18) + 0.2 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 30);
      add(s0 + i, amp * env * w, pan);
    }
  };
  const sub = (t0, f, dur, amp) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < dur * SR; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.01) * Math.min(1, (dur - t) / 0.08) * (0.65 + 0.35 * Math.exp(-t * 3));
      add(s0 + i, amp * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)));
    }
  };
  const kick = (t0, amp) => {
    const s0 = Math.floor(t0 * SR);
    let ph = 0;
    for (let i = 0; i < 0.32 * SR; i++) {
      const t = i / SR;
      const f = 48 + 110 * Math.exp(-t * 32);
      ph += 2 * Math.PI * f / SR;
      add(s0 + i, amp * Math.exp(-t * 11) * Math.sin(ph));
    }
  };
  const hat = (t0, amp, pan) => {
    const s0 = Math.floor(t0 * SR);
    let prev = 0;
    for (let i = 0; i < 0.06 * SR; i++) {
      const t = i / SR;
      const n = noise();
      const hp = n - prev; prev = n; // crude high-pass
      add(s0 + i, amp * Math.exp(-t * 70) * hp, pan);
    }
  };

  const bars = Math.ceil(DUR / bar);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, ch = prog[b % 4];
    const intro = b === 0; // first bar: no drums, the hook lands on the pads
    ch.pad.forEach((m, j) => pad(t0, midi(m), bar + 0.5, 0.035, j % 2 ? 0.35 : -0.35));
    for (let q = 0; q < 4; q++) {
      sub(t0 + q * beat, midi(ch.bass), beat * 0.92, 0.16);
      if (!intro) kick(t0 + q * beat, 0.55);
      if (!intro) hat(t0 + q * beat + beat / 2, 0.11, q % 2 ? 0.4 : -0.4);
    }
    for (let e = 0; e < 8; e++) pluck(t0 + e * beat / 2, midi(ch.arp[e % 4] + (e >= 4 ? 12 : 0)), 0.05, e % 2 ? 0.5 : -0.5);
  }
  // fade in / out
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const g = Math.min(1, t / 0.25, (DUR - t) / 2.5);
    L[i] *= g; R[i] *= g;
  }
  writeWav('music.wav', L, R);
}

// ---------------------------------------------------------------- effects
function fx(name, dur, fn) {
  const N = Math.floor(SR * dur);
  const L = new Float64Array(N), R = new Float64Array(N);
  fn(N, L, R);
  writeWav(name, L, R);
}

// Whoosh: noise through a sweeping resonant band-pass, panned across.
fx('whoosh.wav', 0.7, (N, L, R) => {
  let lp = 0, bp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const fc = 300 + 4200 * Math.sin(Math.PI * t) ** 2;
    const f = 2 * Math.sin(Math.PI * fc / SR);
    const x = noise();
    lp += f * bp; const hp = x - lp - 0.5 * bp; bp += f * hp;
    const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 2;
    const pan = -0.6 + 1.2 * t;
    L[i] = bp * env * (1 - pan); R[i] = bp * env * (1 + pan);
  }
});

// Hit: a low thump with a short metallic ring, for the hook's last word and the logo.
fx('hit.wav', 1.2, (N, L, R) => {
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const f = 42 + 90 * Math.exp(-t * 20);
    ph += 2 * Math.PI * f / SR;
    const body = Math.exp(-t * 4.5) * Math.sin(ph);
    const ring = 0.18 * Math.exp(-t * 6) * (Math.sin(2 * Math.PI * 523 * t) + 0.6 * Math.sin(2 * Math.PI * 1307 * t) + 0.4 * Math.sin(2 * Math.PI * 2141 * t));
    const click = 0.5 * Math.exp(-t * 160) * noise();
    const v = body + ring + click;
    L[i] = v; R[i] = v;
  }
});

// Tick: a short bright click, for each callout landing.
fx('tick.wav', 0.12, (N, L, R) => {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const v = Math.exp(-t * 90) * (Math.sin(2 * Math.PI * 2400 * t) + 0.5 * Math.sin(2 * Math.PI * 3700 * t)) + 0.3 * Math.exp(-t * 300) * noise();
    L[i] = v; R[i] = v;
  }
});

// Shine: a rising glassy shimmer for the light sweeping across the steel name.
fx('shine.wav', 1.1, (N, L, R) => {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const k = t / 1.1;
    const env = Math.sin(Math.PI * k) ** 1.5;
    let v = 0;
    [1, 1.5, 2, 2.5, 3].forEach((h, j) => { v += Math.sin(2 * Math.PI * (880 + 900 * k) * h * t + j) / (j + 1.5); });
    v *= env * 0.5;
    L[i] = v * (1 - (k - 0.5)); R[i] = v * (1 + (k - 0.5));
  }
});
