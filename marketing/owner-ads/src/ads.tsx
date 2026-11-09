/**
 * The five ads: which real screens, where the spotlight lands (fractions of the screen picture),
 * what the label says, and each ad's own motif in the 3D room. Every screen is the live admin
 * panel's demo gym ("Iron Temple Fitness", example data, mobile numbers masked) or the member
 * app's store shots (branding/mettleup/store/raw).
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { AdSpec } from './Film';
import { kf } from './Film';
import { tf } from './stage';
import { C, MANROPE, clampOpts, easeOpts } from './theme';
import type { Timing } from './timing';

const MEMBER = 1080 / 2400;

const Layer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ display: 'grid', placeItems: 'center', transformStyle: 'preserve-3d' }}>{children}</AbsoluteFill>
);

/* 01: a big steel rupee hanging in the dark behind the phone, light rolling over it. */
const Rupee: React.FC<{ t: Timing }> = ({ t }) => {
  const f = useCurrentFrame();
  const p = kf(f, [[0, { x: -380, y: 360, z: -420, ry: 30, rz: -6 }], [t.total, { x: -350, y: 330, z: -340, ry: 16, rz: -3 }]]);
  const sweep = ((f % 90) / 90) * 160 - 30;
  return (
    <Layer>
      <div style={{ transform: tf(p), opacity: interpolate(f, [6, 30], [0, 1], clampOpts), position: 'relative' }}>
        <div style={{ position: 'absolute', inset: '-10%', background: 'radial-gradient(50% 50% at 50% 50%, rgba(255,122,59,0.22), transparent 70%)', filter: 'blur(50px)' }} />
        <div style={{
          position: 'relative', fontFamily: MANROPE, fontWeight: 800, fontSize: 620, lineHeight: 1, color: '#262A31',
          WebkitTextStroke: '5px rgba(255,170,120,0.55)',
          textShadow: `${Math.round(sweep / 4) - 10}px -6px 0 rgba(255,138,76,0.18), 0 40px 90px rgba(0,0,0,0.9)`,
        }}>₹</div>
      </div>
    </Layer>
  );
};

/* 02: a forged price tag, the honest condition written on it. */
const PriceTag: React.FC<{ t: Timing }> = ({ t }) => {
  const f = useCurrentFrame();
  const at = t.lines[1].from + 6;
  if (f < at - 2 || f > t.D + 10) return null;
  const e = interpolate(f, [at, at + 22], [0, 1], easeOpts);
  const out = interpolate(f, [t.D - 2, t.D + 10], [1, 0], clampOpts);
  const p = kf(f, [[at, { x: -285, y: 230, z: 120, ry: 22, rz: -6 }], [t.D, { x: -270, y: 210, z: 160, ry: 14, rz: -4 }]]);
  return (
    <Layer>
      <div style={{ transform: `${tf(p)} translateX(${(1 - e) * -420}px) rotateZ(${(1 - e) * -20}deg)`, opacity: e * out }}>
        <div style={{
          width: 370, padding: '26px 30px 24px', borderRadius: 30, position: 'relative',
          background: 'linear-gradient(160deg, #3B4049 0%, #1D2128 55%, #14171C 100%)',
          border: '2px solid rgba(255,255,255,0.16)', boxShadow: '0 40px 90px rgba(0,0,0,0.75), 0 0 50px rgba(255,122,59,0.25)',
          fontFamily: MANROPE,
        }}>
          <div style={{ position: 'absolute', top: 24, right: 26, width: 26, height: 26, borderRadius: 13, background: C.ink, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)' }} />
          <div style={{ fontWeight: 700, fontSize: 30, color: C.grey, letterSpacing: '0.04em', textTransform: 'uppercase' }}>MettleUp Starter</div>
          <div style={{ fontWeight: 800, fontSize: 104, lineHeight: 1.05, letterSpacing: '-0.03em', color: C.molten, textShadow: '0 0 30px rgba(255,138,76,0.35)' }}>₹999</div>
          <div style={{ fontWeight: 700, fontSize: 34, color: C.iron }}>a month</div>
          <div style={{ marginTop: 16, fontWeight: 600, fontSize: 25, lineHeight: 1.3, color: C.grey }}>Less than one member, if a member pays you more than ₹999 a month.</div>
        </div>
      </div>
    </Layer>
  );
};

/* 03: the gym's own colours dropping into its app: swatches and a logo slot orbit the phone. */
const Swatches: React.FC<{ t: Timing }> = ({ t }) => {
  const f = useCurrentFrame();
  const at = t.lines[1].from;
  if (f < at || f > t.C + 20) return null;
  const e = interpolate(f, [at, at + 24], [0, 1], easeOpts);
  const out = interpolate(f, [t.C, t.C + 18], [1, 0], clampOpts);
  const cols = ['#2E7DFF', '#16B364', '#E5484D', C.forge];
  return (
    <Layer>
      {cols.map((c, i) => {
        const ang = (i / cols.length) * Math.PI * 2 + f / 40;
        const r = 420 * e;
        return (
          <div key={c} style={{
            position: 'absolute', transform: `translate3d(${Math.cos(ang) * r}px, ${170 + Math.sin(ang) * r * 0.55}px, ${Math.sin(ang) * 260}px)`,
            width: 104, height: 104, borderRadius: 30, background: c, opacity: e * out,
            boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 40px ${c}66, inset 0 2px 0 rgba(255,255,255,0.35)`,
          }} />
        );
      })}
    </Layer>
  );
};

/* 04: an Excel sheet and a paper register fly into the phone and become the member list. */
const Sheets: React.FC<{ t: Timing }> = ({ t }) => {
  const f = useCurrentFrame();
  const end = t.lines[1].from + Math.round(t.lines[1].dur * 0.75);
  if (f > end + 4) return null;
  const pull = interpolate(f, [t.B, end], [0, 1], easeOpts);
  const sheet = kf(f, [[0, { x: -250, y: 330, z: -260, ry: 24, rx: 8, rz: -8 }], [t.B, { x: -230, y: 300, z: -160, ry: 18, rx: 6, rz: -6 }]]);
  const reg = kf(f, [[0, { x: 270, y: 420, z: -300, ry: -26, rx: 10, rz: 7 }], [t.B, { x: 250, y: 390, z: -200, ry: -20, rx: 8, rz: 5 }]]);
  const toPhone = (p: ReturnType<typeof kf>) => ({ ...p, x: p.x * (1 - pull), y: p.y * (1 - pull) + 330 * pull, z: p.z * (1 - pull) + 40 * pull, s: 1 - 0.8 * pull, ry: p.ry * (1 - pull), rz: p.rz * (1 - pull) });
  const fade = interpolate(f, [4, 22], [0, 1], clampOpts) * interpolate(pull, [0.7, 1], [1, 0], clampOpts);
  const bar = (w: number, c = 'rgba(255,255,255,0.22)') => <div style={{ height: 14, width: `${w}%`, borderRadius: 7, background: c }} />;
  return (
    <Layer>
      <div style={{ position: 'absolute', transform: tf(toPhone(sheet)), opacity: fade }}>
        <div style={{ width: 520, borderRadius: 18, overflow: 'hidden', background: '#F4F6F8', boxShadow: '0 40px 90px rgba(0,0,0,0.7)' }}>
          <div style={{ height: 54, background: '#1D6F42', display: 'flex', alignItems: 'center', paddingLeft: 22, fontFamily: MANROPE, fontWeight: 800, fontSize: 28, color: '#fff' }}>members.xlsx</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 0.8fr', fontFamily: MANROPE, fontWeight: 700, fontSize: 20, color: '#444' }}>
            {['Name', 'Mobile', 'Plan', 'Paid'].map((h) => <div key={h} style={{ padding: '10px 12px', background: '#E3E7EB', borderRight: '1px solid #cfd5db' }}>{h}</div>)}
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} style={{ padding: '12px 12px', borderRight: '1px solid #dde2e6', borderBottom: '1px solid #dde2e6' }}>
                {bar(40 + ((i * 37) % 55), 'rgba(40,50,60,0.18)')}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', transform: tf(toPhone(reg)), opacity: fade }}>
        <div style={{
          width: 400, height: 520, borderRadius: 10, background: '#EFE6CF', boxShadow: '0 40px 90px rgba(0,0,0,0.7)', position: 'relative',
          backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 46px, rgba(60,90,160,0.35) 46px 48px)',
        }}>
          <div style={{ position: 'absolute', left: 64, top: 0, bottom: 0, width: 2, background: 'rgba(200,60,60,0.55)' }} />
          <div style={{ position: 'absolute', left: 84, right: 28, top: 70, display: 'flex', flexDirection: 'column', gap: 34 }}>
            {Array.from({ length: 9 }).map((_, i) => bar(45 + ((i * 41) % 50), 'rgba(30,40,80,0.35)'))}
          </div>
        </div>
      </div>
    </Layer>
  );
};

/* 05: the gym's plans as forged cards, passing from the old screen to the new one. */
const PlanCards: React.FC<{ t: Timing }> = ({ t }) => {
  const f = useCurrentFrame();
  const at = t.C + 10;
  if (f < t.C - 8 || f > t.D + 6) return null;
  const names = ['Beginner 3 days', 'Push Pull Legs', 'Upper / Lower'];
  const show = interpolate(f, [t.C - 8, t.C + 8], [0, 1], easeOpts) * interpolate(f, [t.D - 6, t.D + 6], [1, 0], clampOpts);
  return (
    <Layer>
      {names.map((n, i) => {
        const go = interpolate(f, [at + i * 5, at + i * 5 + 26], [0, 1], easeOpts);
        const p = {
          x: -330 + 440 * go, y: -10 + i * 104 + go * 160, z: 260 + Math.sin(go * Math.PI) * 220 - go * 200,
          rx: 0, ry: 18 - 30 * go, rz: -4 + 6 * go, s: 1,
        };
        return (
          <div key={n} style={{ position: 'absolute', transform: `${tf(p)} scale(${1 - 0.45 * go})`, opacity: show * interpolate(go, [0.75, 1], [1, 0], clampOpts) }}>
            <div style={{
              width: 400, padding: '20px 26px', borderRadius: 22, display: 'flex', alignItems: 'center', gap: 18,
              background: 'linear-gradient(160deg, #353A43, #1A1E24)', border: '1.5px solid rgba(255,255,255,0.16)',
              boxShadow: '0 30px 70px rgba(0,0,0,0.7), 0 0 30px rgba(255,122,59,0.18)', fontFamily: MANROPE,
            }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: `linear-gradient(180deg, #FFB07F, ${C.forge})` }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 32, color: C.iron }}>{n}</div>
                <div style={{ fontWeight: 600, fontSize: 22, color: C.grey }}>Workout plan</div>
              </div>
            </div>
          </div>
        );
      })}
    </Layer>
  );
};

export const SPECS: AdSpec[] = [
  {
    id: '01-pending-fee',
    desk: 'screens/desk-money-dues.jpg',
    first: {
      src: 'screens/phone-money-dues.jpg',
      spots: [
        { line: 2, at: 0.05, until: 0.5, rect: { x: 0.04, y: 0.073, w: 0.45, h: 0.122 }, label: 'Total due', side: 'left', below: true },
        { line: 2, at: 0.52, until: 1.05, rect: { x: 0.515, y: 0.073, w: 0.45, h: 0.122 }, label: 'Over 60 days', side: 'right', below: true },
      ],
    },
    second: {
      src: 'screens/phone-money-dues-500.jpg',
      spots: [
        { line: 3, at: 0.02, until: 0.45, rect: { x: 0.64, y: 0.17, w: 0.24, h: 0.05 }, label: 'Tap Collect', side: 'right' },
        { line: 3, at: 0.47, until: 1.0, rect: { x: 0.04, y: 0.39, w: 0.92, h: 0.13 }, label: 'Who owes, how long', side: 'left' },
      ],
    },
    motif: Rupee,
  },
  {
    id: '02-one-member-fee',
    desk: 'screens/desk-today.jpg',
    first: {
      src: 'screens/phone-plans.jpg',
      dx: 170,
      spots: [
        { line: 2, at: 0.05, until: 1.05, rect: { x: 0.03, y: 0.265, w: 0.94, h: 0.165 }, label: 'One member: ₹1,200', side: 'right' },
      ],
    },
    second: {
      src: 'screens/phone-money-dues.jpg',
      spots: [
        { line: 3, at: 0.05, until: 1.0, rect: { x: 0.04, y: 0.073, w: 0.92, h: 0.38 }, label: 'Fees and renewals', side: 'right' },
      ],
    },
    motif: PriceTag,
  },
  {
    id: '03-own-app',
    desk: 'screens/desk-settings-branding.jpg',
    first: {
      src: 'screens/phone-settings-branding.jpg',
      tag: 'Example gym',
      spots: [
        { line: 2, at: 0.1, until: 1.05, rect: { x: 0.2, y: 0.315, w: 0.6, h: 0.06 }, label: "Your gym's name", side: 'right' },
      ],
    },
    second: {
      src: 'screens/member-01.jpg',
      aspect: MEMBER,
      tag: 'Logo and colours: on Pro',
      spots: [
        { line: 3, at: 0.02, until: 0.6, rect: { x: 0.03, y: 0.325, w: 0.94, h: 0.27 }, label: "Last time's weight", side: 'left' },
      ],
    },
    motif: Swatches,
  },
  {
    id: '04-excel-move',
    desk: 'screens/desk-members.jpg',
    first: {
      src: 'screens/phone-members.jpg',
      spots: [
        { line: 2, at: 0.3, until: 1.05, rect: { x: 0.03, y: 0.075, w: 0.94, h: 0.43 }, label: 'Moved for you, free', side: 'right', below: true },
      ],
    },
    second: {
      src: 'screens/phone-members-import.jpg',
      spots: [
        { line: 3, at: 0.15, until: 1.0, rect: { x: 0.04, y: 0.31, w: 0.92, h: 0.32 }, label: 'Choose, check, Add', side: 'left' },
      ],
    },
    motif: Sheets,
  },
  {
    id: '05-trainer-leaves',
    desk: 'screens/desk-today.jpg',
    first: {
      src: 'screens/phone-workouts.jpg',
      tag: 'Example gym · Trainer plans: on Pro',
      spots: [
        { line: 2, at: 0.1, until: 1.05, rect: { x: 0.08, y: 0.42, w: 0.84, h: 0.2 }, label: 'Plans live in your gym', side: 'right' },
      ],
    },
    second: {
      src: 'screens/member-07.jpg',
      aspect: MEMBER,
      tag: "Member's app",
      spots: [
        { line: 3, at: 0.2, until: 1.0, rect: { x: 0.03, y: 0.595, w: 0.94, h: 0.075 }, label: "Trainer's plans", side: 'left' },
      ],
    },
    motif: PlanCards,
  },
];
