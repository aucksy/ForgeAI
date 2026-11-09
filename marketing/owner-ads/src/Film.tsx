/**
 * One owner ad, 9:16. Every ad has the same four beats so the five read as one campaign:
 *   A  the hook, big, word by word, while the first device rises into the light
 *   B  the first real screen, camera pushed in, a spotlight + label on the thing the voice names
 *   C  hand-off: that device steps back into shadow, the second one lands in front
 *   D  the steel name lands, light sweeps it, "Free for 3 months. No card." and the address
 * Each ad's own screens, labels and motif live in ads.tsx.
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, EASE, MANROPE, clampOpts, easeOpts } from './theme';
import { Desk, Phone, Pose, Rect, Room, Space, Spot, mix, tf } from './stage';
import { Captions, EndCard, Headline, HiChip, Sfx, Streaks } from './kit';
import { ADS, Timing, timing } from './timing';
import { SPECS } from './ads';

export type SpotSpec = { line: 1 | 2 | 3; at: number; until: number; rect: Rect; label?: string; side?: 'left' | 'right'; below?: boolean };
/** `tag` sits above the device ("Example gym", and "on Pro" where the feature is Pro only). */
export type PhoneShot = { src: string; aspect?: number; scrollY?: number; spots: SpotSpec[]; tag?: string; lift?: number; dx?: number };
export type AdSpec = {
  id: string;
  desk: string;
  first: PhoneShot;
  second: PhoneShot;
  motif?: React.FC<{ t: Timing }>;
};

/** Pose at frame f from keyframes [frame, pose], eased between each pair. */
export function kf(f: number, keys: [number, Pose][]): Required<Pose> {
  if (f <= keys[0][0]) return mix(keys[0][1], keys[0][1], 0);
  for (let i = 0; i < keys.length - 1; i++) {
    const [fa, a] = keys[i], [fb, b] = keys[i + 1];
    if (f <= fb) return mix(a, b, EASE(Math.max(0, Math.min(1, (f - fa) / Math.max(1, fb - fa)))));
  }
  return mix(keys[keys.length - 1][1], keys[keys.length - 1][1], 0);
}

const toSpots = (specs: SpotSpec[], t: Timing): Spot[] =>
  specs.map((s) => {
    const l = t.lines[s.line - 1];
    return { from: l.from + Math.round(s.at * l.dur), to: l.from + Math.round(s.until * l.dur), rect: s.rect, label: s.label, side: s.side, below: s.below };
  });

// Props must be plain JSON (Remotion serialises them), so the spec with its motif component is
// looked up here by id instead of being passed in.
export const Film: React.FC<{ id: string }> = ({ id }) => {
  const spec = SPECS.find((s) => s.id === id)!;
  const f = useCurrentFrame();
  const ad = ADS.find((a) => a.id === spec.id)!;
  const t = timing(spec.id);
  const { A, B, C: Cc, D, total } = t;

  // world camera: a slow drift the whole time, a small push at every beat
  const cam = kf(f, [[0, { z: -120, ry: 3, rx: 1 }], [B, { z: 0, ry: 0 }], [Cc, { z: 30, ry: -2 }], [D, { z: 60, ry: 1.5 }], [total, { z: 120, ry: 2.5 }]]);

  const p1 = kf(f, [
    [A, { x: 150, y: 1150, z: -300, ry: -24, rx: 12, rz: 4 }],
    [A + 26, { x: 150, y: 640, z: -260, ry: -18, rx: 7, rz: 2 }],
    [B, { x: 120, y: 560, z: -220, ry: -14, rx: 5, rz: 1 }],
    [B + 20, { x: spec.first.dx ?? 0, y: 250 + (spec.first.lift ?? 0), z: 0, ry: -10, rx: 3 }],
    [Cc, { x: spec.first.dx ?? 0, y: 230 + (spec.first.lift ?? 0), z: 70, ry: -4, rx: 2 }],
    [Cc + 22, { x: -330, y: 200, z: -560, ry: 24, rx: 2 }],
    [D, { x: -360, y: 190, z: -640, ry: 26 }],
    [total, { x: -380, y: 180, z: -700, ry: 27 }],
  ]);
  const p2 = kf(f, [
    [Cc, { x: 760, y: 300, z: -420, ry: -46, rx: 4 }],
    [Cc + 24, { x: 90, y: 250 + (spec.second.lift ?? 0), z: 40, ry: -9, rx: 3 }],
    [D, { x: 70, y: 235 + (spec.second.lift ?? 0), z: 110, ry: -4, rx: 2 }],
    [total, { x: 60, y: 225, z: 60, ry: -3 }],
  ]);
  const pd = kf(f, [[0, { x: 260, y: -60, z: -1250, ry: -28, rx: 5 }], [total, { x: 150, y: -110, z: -1050, ry: -20, rx: 3 }]]);
  const dim1 = interpolate(f, [Cc, Cc + 20], [0, 0.55], clampOpts);
  const enter2 = interpolate(f, [Cc, Cc + 16], [0, 1], clampOpts);
  const deskIn = interpolate(f, [4, 30], [0, 1], easeOpts);

  const Motif = spec.motif;

  // music: under the voice, louder between lines, out over the last second
  const voOn = (fr: number) => t.lines.some((l) => fr >= l.from - 4 && fr <= l.from + l.dur + 4);
  const musicVol = (fr: number) =>
    (voOn(fr) ? 0.2 : 0.42) * interpolate(fr, [total - 30, total - 2], [1, 0], clampOpts) * interpolate(fr, [0, 6], [0.6, 1], clampOpts);

  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Room len={total} />
      <Space cam={cam}>
        <AbsoluteFill style={{ display: 'grid', placeItems: 'center', transformStyle: 'preserve-3d' }}>
          <div style={{ transform: tf(pd), opacity: 0.85 * deskIn, transformStyle: 'preserve-3d' }}>
            <Desk src={spec.desk} width={1700} dim={0.35} />
          </div>
        </AbsoluteFill>
        {Motif && <Motif t={t} />}
        <AbsoluteFill style={{ display: 'grid', placeItems: 'center', transformStyle: 'preserve-3d' }}>
          <div style={{ transform: tf(p1), transformStyle: 'preserve-3d', opacity: f > D + 24 ? 0 : 1 }}>
            <Phone src={spec.first.src} aspect={spec.first.aspect} scrollY={spec.first.scrollY}
              spots={toSpots(spec.first.spots, t)} tag={f < Cc ? spec.first.tag ?? 'Example gym' : undefined} dim={dim1} />
          </div>
        </AbsoluteFill>
        {f >= Cc && (
          <AbsoluteFill style={{ display: 'grid', placeItems: 'center', transformStyle: 'preserve-3d' }}>
            <div style={{ transform: tf(p2), transformStyle: 'preserve-3d', opacity: enter2 }}>
              <Phone src={spec.second.src} aspect={spec.second.aspect} scrollY={spec.second.scrollY}
                spots={toSpots(spec.second.spots, t)} tag={spec.second.tag ?? 'Example gym'} />
            </div>
          </AbsoluteFill>
        )}
      </Space>

      {/* top type: the hook, then the payoff */}
      <Headline lines={ad.hook} accent={ad.accent} start={A} end={B - 4} />
      <HiChip text={ad.hi} at={A + 30} end={B - 4} top={268 + ad.hook.length * 108 + 34} />
      <Headline lines={ad.payoff} accent={[1]} start={B + 4} end={D - 4} size={86} />

      {/* captions: low under the hook, then just under the payoff so the screens stay clear */}
      {/* No captions under the hook: the headline already says line 1 (fewer words in the first 2 s). */}
      {f >= B && <Captions lines={ad.lines} timing={t.lines} top={474} hideAfter={D + 6} />}
      <Streaks at={B - 4} />
      <Streaks at={Cc - 4} />
      <EndCard at={D} />

      {/* sound */}
      <Audio src={staticFile('audio/music.wav')} volume={musicVol} />
      {t.lines.map((l, i) => (
        <Sequence key={i} from={l.from} layout="none">
          <Audio src={staticFile(`audio/${spec.id}/vo-${i + 1}.wav`)} volume={1} />
        </Sequence>
      ))}
      <Sfx at={A} src="whoosh.wav" volume={0.35} />
      <Sfx at={A + 2 + (ad.hook.join(' ').split(' ').length - 1) * 3 + 4} src="hit.wav" volume={0.45} />
      <Sfx at={B - 6} src="whoosh.wav" volume={0.4} />
      <Sfx at={Cc - 6} src="whoosh.wav" volume={0.4} />
      {[...toSpots(spec.first.spots, t), ...toSpots(spec.second.spots, t)].map((s, i) => <Sfx key={i} at={s.from + 4} src="tick.wav" volume={0.3} />)}
      <Sfx at={D + 4} src="hit.wav" volume={0.55} />
      <Sfx at={D + 16} src="shine.wav" volume={0.35} />
    </AbsoluteFill>
  );
};
