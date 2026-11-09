/** Kinetic type, captions, the steel name with its light sweep, the end card, and the sound cues. */
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, MANROPE, clampOpts, easeOpts } from './theme';
import type { Line } from './timing';

const ACCENT_TEXT: React.CSSProperties = {
  background: `linear-gradient(180deg, #FFC08F 0%, ${C.molten} 45%, ${C.forge} 100%)`,
  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
};
const STEEL_TEXT: React.CSSProperties = {
  background: 'linear-gradient(180deg, #FFFFFF 0%, #E8EAEE 55%, #AEB4BE 100%)',
  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
};

/** The hook: word by word, each word rising out of a blur. Fully readable by about 1.3 s. */
export const Headline: React.FC<{
  lines: string[]; accent: number[]; start: number; end?: number; size?: number; top?: number; still?: boolean; left?: number; width?: number;
}> = ({ lines, accent, start, end = 99999, size = 104, top = 268, still, left = 76, width = 940 }) => {
  const f = useCurrentFrame();
  if (!still && (f < start || f > end + 14)) return null;
  const out = still ? 0 : interpolate(f, [end, end + 12], [0, 1], clampOpts);
  // fit the longest line to the width (Manrope ExtraBold is about 0.56 em per character)
  const longest = Math.max(...lines.map((l) => l.length));
  size = Math.min(size, Math.floor(width / (longest * 0.5)));
  let k = 0;
  return (
    <div style={{
      position: 'absolute', left, top, width, fontFamily: MANROPE, fontWeight: 800, fontSize: size, lineHeight: 1.04,
      letterSpacing: '-0.025em', opacity: 1 - out, transform: `translateY(${-out * 60}px)`, filter: `blur(${out * 10}px)`,
    }}>
      {lines.map((ln, li) => (
        <div key={li} style={{ whiteSpace: 'nowrap' }}>
          {ln.split(' ').map((w, wi) => {
            const d = start + 2 + k++ * 3;
            const t = still ? 1 : interpolate(f, [d, d + 12], [0, 1], easeOpts);
            return (
              <span key={wi} style={{
                display: 'inline-block', marginRight: '0.24em', opacity: t, transform: `translateY(${(1 - t) * 46}px)`,
                filter: `blur(${(1 - t) * 12}px)`, ...(accent.includes(li) ? ACCENT_TEXT : STEEL_TEXT),
                paddingBottom: 6,
              }}>{w}</span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** The one Hinglish line, a quiet chip under the hook. (Aakash reads every Hindi line aloud first.) */
export const HiChip: React.FC<{ text: string; at: number; end: number; top: number; still?: boolean; left?: number; size?: number }> = ({ text, at, end, top, still, left = 80, size = 38 }) => {
  const f = useCurrentFrame();
  if (!still && (f < at || f > end + 10)) return null;
  const t = still ? 1 : interpolate(f, [at, at + 14], [0, 1], easeOpts) * interpolate(f, [end, end + 10], [1, 0], clampOpts);
  return (
    <div style={{
      position: 'absolute', left, top, fontFamily: MANROPE, fontWeight: 700, fontSize: size, color: C.iron, opacity: t,
      transform: `translateX(${(1 - t) * -30}px)`, display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ width: 8, height: size * 1.2, borderRadius: 4, background: C.molten }} />
      <span style={{ fontStyle: 'italic' }}>{text}</span>
    </div>
  );
};

/** Captions for sound-off viewing: short chunks, the spoken word lit in orange. */
export const Captions: React.FC<{ lines: Line[]; timing: { from: number; dur: number }[]; top?: number; hideAfter?: number }> = ({ lines, timing, top = 1062, hideAfter = 99999 }) => {
  const f = useCurrentFrame();
  if (f >= hideAfter) return null;
  for (let i = 0; i < lines.length; i++) {
    const { from, dur } = timing[i];
    if (f < from || f > from + dur + 6) continue;
    const words = lines[i].show.split(' ');
    // chunks of at most 7 words, breaking after punctuation where possible
    const chunks: string[][] = [];
    let cur: string[] = [];
    words.forEach((w, j) => {
      cur.push(w);
      const left = words.length - j - 1;
      if ((cur.length >= 3 && /[,.?]$/.test(w) && left > 1) || (cur.length >= 5 && left > 1)) { chunks.push(cur); cur = []; }
    });
    if (cur.length) chunks.push(cur);
    const total = words.join(' ').length;
    let acc = 0;
    const spans = chunks.map((c) => { const len = c.join(' ').length + 1; const a = acc; acc += len; return { c, a: a / total, b: acc / total }; });
    const p = (f - from) / dur;
    const ch = spans.find((s) => p < s.b) || spans[spans.length - 1];
    const local = (p - ch.a) / (ch.b - ch.a);
    const appear = interpolate(f, [from + Math.floor(ch.a * dur), from + Math.floor(ch.a * dur) + 5], [0, 1], easeOpts);
    let wacc = 0;
    const clen = ch.c.join(' ').length;
    return (
      <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          maxWidth: 960, textAlign: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 54, lineHeight: 1.18, letterSpacing: '-0.01em',
          padding: '18px 30px', borderRadius: 26, background: 'rgba(9,11,14,0.78)', border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)', opacity: appear, transform: `translateY(${(1 - appear) * 16}px) scale(${0.97 + appear * 0.03})`,
        }}>
          {ch.c.map((w, j) => {
            const at = wacc / clen; wacc += w.length + 1;
            const lit = local >= at;
            return <span key={j} style={{ color: lit ? '#FFFFFF' : 'rgba(255,255,255,0.45)', marginRight: j < ch.c.length - 1 ? '0.26em' : 0, ...(lit && j === lastLit(ch.c, local, clen) ? { color: C.molten } : {}) }}>{w}</span>;
          })}
        </div>
      </div>
    );
  }
  return null;
};
function lastLit(ws: string[], local: number, clen: number) {
  let acc = 0, last = -1;
  ws.forEach((w, j) => { if (local >= acc / clen) last = j; acc += w.length + 1; });
  return last;
}

/** The MettleUp lockup (mark + steel letters, the real SVG) with a light sweeping across it. */
export const Lockup: React.FC<{ width: number; sweepAt?: number; still?: boolean }> = ({ width, sweepAt = 0, still }) => {
  const f = useCurrentFrame();
  const h = width * (408 / 1750.32);
  const t = still ? 0.55 : interpolate(f, [sweepAt, sweepAt + 28], [-0.3, 1.3], clampOpts);
  const url = staticFile('brand/lockup-steel.svg');
  return (
    <div style={{ position: 'relative', width, height: h }}>
      <div style={{ position: 'absolute', inset: '-30%', background: 'radial-gradient(50% 50% at 50% 50%, rgba(255,122,59,0.25), transparent 70%)', filter: 'blur(40px)' }} />
      <Img src={url} style={{ position: 'absolute', inset: 0, width, height: h, filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.6))' }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(105deg, transparent ${t * 100 - 14}%, rgba(255,255,255,0.95) ${t * 100}%, transparent ${t * 100 + 14}%)`,
        WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
        mixBlendMode: 'screen', opacity: still ? 0.35 : 0.9,
      }} />
    </div>
  );
};

/** The last 3 seconds: the steel name lands, light sweeps it, the offer and the address. */
export const EndCard: React.FC<{ at: number; line?: string; tagline?: string }> = ({ at, line = "Gym software + a free member app in your gym's name.", tagline }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < at) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 15, stiffness: 120, mass: 0.9 } });
  const veil = interpolate(f, [at, at + 12], [0, 1], clampOpts);
  const txt = (d: number) => interpolate(f, [at + d, at + d + 14], [0, 1], easeOpts);
  const dy = tagline ? 96 : 0; // a tagline under the name pushes the offer down
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(7,8,10,${0.72 * veil})`, backdropFilter: `blur(${14 * veil}px)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(60% 34% at 50% 34%, rgba(255,122,59,${0.18 * veil}), transparent 70%)` }} />
      <div style={{ position: 'absolute', top: 470, left: 0, right: 0, display: 'flex', justifyContent: 'center', perspective: 1600 }}>
        <div style={{ transform: `translateZ(${(1 - s) * -700}px) rotateX(${(1 - s) * 30}deg)`, opacity: Math.min(1, s * 1.5) }}>
          <Lockup width={880} sweepAt={at + 16} />
        </div>
      </div>
      {tagline && (
        <div style={{
          position: 'absolute', top: 708, left: 0, right: 0, textAlign: 'center', fontFamily: MANROPE, fontWeight: 700, fontSize: 56,
          letterSpacing: '-0.015em', color: C.iron, opacity: txt(6), transform: `translateY(${(1 - txt(6)) * 24}px)`,
        }}>{tagline}</div>
      )}
      <div style={{ position: 'absolute', top: 760 + dy, left: 0, right: 0, textAlign: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 80, lineHeight: 1.08, letterSpacing: '-0.025em' }}>
        <div style={{ opacity: txt(10), transform: `translateY(${(1 - txt(10)) * 30}px)`, ...ACCENT_TEXT }}>Free for 3 months.</div>
        <div style={{ opacity: txt(14), transform: `translateY(${(1 - txt(14)) * 30}px)`, ...STEEL_TEXT }}>No card.</div>
      </div>
      <div style={{ position: 'absolute', top: 1000 + dy, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: txt(20), transform: `scale(${0.9 + 0.1 * txt(20)})` }}>
        <div style={{
          fontFamily: MANROPE, fontWeight: 800, fontSize: 50, color: C.steel, padding: '24px 46px', borderRadius: 999,
          background: `linear-gradient(180deg, #FF9A5F, ${C.forge})`, boxShadow: '0 20px 50px rgba(240,102,42,0.45), inset 0 2px 0 rgba(255,255,255,0.35)',
          display: 'flex', alignItems: 'center', gap: 18,
        }}>
          app.mettleup.fit/start
          <svg width="42" height="42" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6" stroke={C.steel} strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1150 + dy, left: 40, right: 40, textAlign: 'center', fontFamily: MANROPE, fontWeight: 600, fontSize: 31, color: C.grey, opacity: txt(26) }}>{line}</div>
    </AbsoluteFill>
  );
};

/** Light streaks for the moment between two places. */
export const Streaks: React.FC<{ at: number; dur?: number }> = ({ at, dur = 18 }) => {
  const f = useCurrentFrame();
  if (f < at || f > at + dur) return null;
  const t = interpolate(f, [at, at + dur], [0, 1], easeOpts);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: 10 }).map((_, i) => {
        const y = (i * 173) % 1920;
        const w = 300 + ((i * 97) % 500);
        const p = Math.max(0, Math.min(1, (t - (i % 4) * 0.07) / 0.8));
        return <div key={i} style={{ position: 'absolute', top: y, left: `${-40 + p * 160}%`, width: w, height: 3, background: `linear-gradient(90deg, transparent, rgba(255,176,130,${0.6 * (1 - p)}), transparent)`, filter: 'blur(1px)' }} />;
      })}
    </AbsoluteFill>
  );
};

/** A sound effect at a frame. */
export const Sfx: React.FC<{ at: number; src: string; volume?: number }> = ({ at, src, volume = 0.5 }) => (
  <Sequence from={Math.max(0, at)} layout="none">
    <Audio src={staticFile(`audio/${src}`)} volume={volume} />
  </Sequence>
);
