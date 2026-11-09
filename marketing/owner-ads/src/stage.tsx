/**
 * The lit room every ad happens in (pattern from D:/Brain/Lessons/product-film-not-a-slideshow.md):
 * screens are real devices hanging in a dark steel space, tilted, at their own depth, lit by a
 * forge-orange key light with a cool rim, and the camera never stops moving. All CSS 3D.
 */
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, EASE, MANROPE, clampOpts, easeOpts } from './theme';

export type Pose = { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; s?: number };
const P0: Required<Pose> = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 };
export const mix = (a: Pose, b: Pose, t: number): Required<Pose> => {
  const A = { ...P0, ...a }, B = { ...P0, ...b };
  const k = (key: keyof Required<Pose>) => A[key] + (B[key] - A[key]) * t;
  return { x: k('x'), y: k('y'), z: k('z'), rx: k('rx'), ry: k('ry'), rz: k('rz'), s: k('s') };
};
export const tf = (p: Required<Pose>) =>
  `translate3d(${p.x}px, ${p.y}px, ${p.z}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg) scale(${p.s})`;

/** Background: steel dark, a warm key light top-left, a cool rim bottom-right, fine dust, vignette. */
export const Room: React.FC<{ len: number; warm?: number; still?: boolean }> = ({ len, warm = 1, still }) => {
  const f = useCurrentFrame();
  const a = still ? 0.5 : interpolate(f, [0, len], [0, 1], clampOpts);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #11141A 0%, ${C.ink} 55%, #07080A 100%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(55% 38% at ${30 + a * 14}% ${12 + a * 4}%, rgba(255,122,59,${0.22 * warm}), transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(50% 30% at ${80 - a * 10}% ${86 - a * 6}%, rgba(120,150,190,0.10), transparent 70%)` }} />
      {/* the floor: a faint horizon and a warm pool where the devices stand */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent 72%, rgba(255,138,76,0.05) 80%, transparent 100%)' }} />
      <Dust a={a} />
      <AbsoluteFill style={{ background: 'radial-gradient(80% 70% at 50% 45%, transparent 45%, rgba(0,0,0,0.6) 100%)' }} />
    </AbsoluteFill>
  );
};

const Dust: React.FC<{ a: number }> = ({ a }) => (
  <AbsoluteFill>
    {Array.from({ length: 34 }).map((_, i) => {
      const x = (i * 263) % 1080;
      const y0 = (i * 547) % 1920;
      const y = (y0 - a * (60 + (i % 5) * 30) + 1920) % 1920;
      const r = 1.5 + (i % 4);
      return (
        <div key={i} style={{
          position: 'absolute', left: x, top: y, width: r, height: r, borderRadius: r,
          background: i % 3 ? 'rgba(255,190,150,0.35)' : 'rgba(220,230,255,0.25)', filter: 'blur(0.6px)',
          opacity: 0.25 + ((i * 37) % 60) / 100,
        }} />
      );
    })}
  </AbsoluteFill>
);

/** One 3D space with one vanishing point; `cam` moves the whole world. */
export const Space: React.FC<{ cam: Required<Pose>; children: React.ReactNode }> = ({ cam, children }) => (
  <AbsoluteFill style={{ perspective: 2200, perspectiveOrigin: '50% 48%' }}>
    <AbsoluteFill style={{ transformStyle: 'preserve-3d', transform: tf(cam) }}>{children}</AbsoluteFill>
  </AbsoluteFill>
);

/** A rectangle on a screen, as fractions of the screen picture. */
export type Rect = { x: number; y: number; w: number; h: number };

export type Spot = { from: number; to: number; rect: Rect; label?: string; side?: 'left' | 'right'; below?: boolean };

/** Dims the screen except one area, and lands a glowing hairline box on it. */
const SpotLayer: React.FC<{ spots: Spot[]; sw: number; sh: number }> = ({ spots, sw, sh }) => {
  const f = useCurrentFrame();
  const on = spots.find((s) => f >= s.from - 2 && f <= s.to + 8);
  if (!on) return null;
  const t = interpolate(f, [on.from, on.from + 14], [0, 1], easeOpts);
  const out = interpolate(f, [on.to - 2, on.to + 8], [1, 0], clampOpts);
  const pad = 14 + (1 - t) * 40;
  const r = on.rect;
  return (
    <div style={{
      position: 'absolute', left: r.x * sw - pad, top: r.y * sh - pad, width: r.w * sw + pad * 2, height: r.h * sh + pad * 2,
      borderRadius: 26, boxShadow: `0 0 0 3000px rgba(4,5,8,${0.62 * t * out})`, opacity: 1,
      border: `4px solid rgba(255,138,76,${t * out})`,
      outline: `10px solid rgba(255,138,76,${0.18 * t * out})`,
    }} />
  );
};

/** The label that names what the spotlight is on: a pill just above the box, popping out of the
 *  screen towards the camera, pushed a little past the device's edge on its side. */
const CalloutLayer: React.FC<{ spots: Spot[]; sw: number; sh: number }> = ({ spots, sw, sh }) => {
  const f = useCurrentFrame();
  return (
    <>
      {spots.filter((s) => s.label).map((s, i) => {
        if (f < s.from + 4 || f > s.to + 8) return null;
        const t = interpolate(f, [s.from + 4, s.from + 20], [0, 1], easeOpts);
        const out = interpolate(f, [s.to - 2, s.to + 8], [1, 0], clampOpts);
        const top = s.below ? (s.rect.y + s.rect.h) * sh + 30 : s.rect.y * sh - 112;
        const right = s.side === 'right';
        const pos: React.CSSProperties = right ? { right: -70 } : { left: -70 };
        return (
          <div key={i} style={{
            position: 'absolute', top, ...pos, opacity: t * out,
            transform: `translateZ(${90 * t}px) translateY(${(1 - t) * 30}px) scale(${0.85 + 0.15 * t})`,
            transformOrigin: right ? 'right center' : 'left center',
            fontFamily: MANROPE, fontWeight: 800, fontSize: 50, color: C.steel, background: `linear-gradient(180deg, #FFB683, ${C.molten})`,
            padding: '16px 30px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '-0.015em',
            boxShadow: '0 22px 50px rgba(0,0,0,0.6), 0 0 34px rgba(255,138,76,0.4)',
          }}>{s.label}</div>
        );
      })}
    </>
  );
};

/** A phone: dark titanium frame, the real screen inside, glass glare, side keys, a soft floor shadow. */
export const Phone: React.FC<{
  src: string; width?: number; aspect?: number; spots?: Spot[]; tag?: string; glare?: number; dim?: number; scrollY?: number;
}> = ({ src, width = 470, aspect = 1170 / 2532, spots = [], tag, glare = 0.5, dim = 0, scrollY = 0 }) => {
  const sw = width, sh = width / aspect;
  const bez = 16;
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'relative', width: sw + bez * 2, height: sh + bez * 2, transformStyle: 'preserve-3d' }}>
      {/* floor shadow + warm bloom behind */}
      <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: -60, height: 90, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', filter: 'blur(30px)', transform: 'translateZ(-40px)' }} />
      <div style={{ position: 'absolute', inset: '-18%', background: 'radial-gradient(50% 50% at 50% 45%, rgba(255,122,59,0.30), transparent 70%)', filter: 'blur(60px)', transform: 'translateZ(-80px)' }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 78,
        background: 'linear-gradient(135deg, #5A606B 0%, #23272E 22%, #14171C 60%, #3B4049 100%)',
        boxShadow: '0 50px 120px rgba(0,0,0,0.7), inset 0 0 0 2px rgba(255,255,255,0.10)',
      }} />
      {/* rim light on the frame's edge */}
      <div style={{ position: 'absolute', inset: -2, borderRadius: 80, background: 'linear-gradient(150deg, rgba(255,168,119,0.55), transparent 35%, transparent 70%, rgba(150,180,220,0.25))', filter: 'blur(3px)', zIndex: -1 }} />
      {/* side keys */}
      <div style={{ position: 'absolute', right: -5, top: '22%', width: 6, height: 110, borderRadius: 3, background: '#2C3038' }} />
      <div style={{ position: 'absolute', right: -5, top: '33%', width: 6, height: 70, borderRadius: 3, background: '#2C3038' }} />
      <div style={{ position: 'absolute', left: bez, top: bez, width: sw, height: sh, borderRadius: 64, overflow: 'hidden', background: '#000' }}>
        <Img src={staticFile(src)} style={{ width: sw, display: 'block', transform: `translateY(${-scrollY * sh}px)` }} />
        <SpotLayer spots={spots} sw={sw} sh={sh} />
        {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${dim})` }} />}
        {/* glass glare: a soft diagonal band that drifts */}
        <div style={{
          position: 'absolute', inset: '-40%',
          background: `linear-gradient(115deg, transparent 42%, rgba(255,255,255,${0.10 * glare}) 48%, rgba(255,255,255,${0.03 * glare}) 54%, transparent 60%)`,
          transform: `translateX(${(f % 300) / 300 * 40 - 20}%)`,
        }} />
      </div>
      <div style={{ position: 'absolute', left: bez, top: bez, width: sw, height: sh }}>
        <CalloutLayer spots={spots} sw={sw} sh={sh} />
      </div>
      {tag && <ExampleTag text={tag} />}
    </div>
  );
};

/** "Example gym" — every demo screen says so (claims rule 8). */
export const ExampleTag: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => (
  <div style={{
    position: 'absolute', top: -58, left: '50%', transform: 'translateX(-50%) translateZ(30px)',
    fontFamily: MANROPE, fontWeight: 700, fontSize: 28, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: C.grey, background: 'rgba(20,23,28,0.85)', border: '1px solid rgba(255,255,255,0.14)', padding: '8px 18px', borderRadius: 999,
    whiteSpace: 'nowrap', ...style,
  }}>{text}</div>
);

/** A desktop browser window with the real admin panel in it. */
export const Desk: React.FC<{ src: string; width?: number; dim?: number }> = ({ src, width = 1500, dim = 0 }) => {
  const h = width * (1800 / 2880);
  return (
    <div style={{ position: 'relative', width, height: h + 46, transformStyle: 'preserve-3d' }}>
      <div style={{ position: 'absolute', inset: '-14%', background: 'radial-gradient(50% 50% at 50% 50%, rgba(255,122,59,0.22), transparent 70%)', filter: 'blur(70px)', transform: 'translateZ(-60px)' }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 22, overflow: 'hidden', background: '#16191F',
        boxShadow: '0 60px 140px rgba(0,0,0,0.75), inset 0 0 0 2px rgba(255,255,255,0.08)',
      }}>
        <div style={{ height: 46, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 22, background: '#1E222A' }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c, opacity: 0.8 }} />)}
          <div style={{ marginLeft: 30, height: 26, width: 420, borderRadius: 13, background: '#2A2F38', color: C.grey, fontFamily: MANROPE, fontSize: 17, display: 'flex', alignItems: 'center', paddingLeft: 16 }}>app.mettleup.fit</div>
        </div>
        <Img src={staticFile(src)} style={{ width, display: 'block' }} />
        {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${dim})` }} />}
      </div>
    </div>
  );
};

/** Places a child at a pose in the space, travelling between two poses over [from, to]. */
export const Place: React.FC<{
  from: Pose; to: Pose; start: number; end: number; enter?: number; exit?: number; children: React.ReactNode; enterFrom?: Pose;
}> = ({ from, to, start, end, enter = 22, exit = 12, enterFrom, children }) => {
  const f = useCurrentFrame();
  if (f < start || f > end + exit) return null;
  const travel = interpolate(f, [start, end], [0, 1], { ...clampOpts, easing: EASE });
  const e = interpolate(f, [start, start + enter], [0, 1], easeOpts);
  const x = exit > 0 ? interpolate(f, [end, end + exit], [1, 0], clampOpts) : 1;
  let p = mix(from, to, travel);
  if (enterFrom) p = mix({ ...p, ...enterFrom, s: (enterFrom.s ?? 1) * p.s }, p, e);
  return (
    <AbsoluteFill style={{ display: 'grid', placeItems: 'center', transformStyle: 'preserve-3d' }}>
      <div style={{ transformStyle: 'preserve-3d', transform: tf(p), opacity: Math.min(e * 1.4, 1) * x }}>{children}</div>
    </AbsoluteFill>
  );
};
