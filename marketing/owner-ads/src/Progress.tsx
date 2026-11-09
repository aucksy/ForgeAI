/**
 * Ad 06 "progress" (R-430, 9 Nov 2026): the second owner hook, from the gym site's hero. Same room,
 * phones, type, captions and end card as ads 01-05 (Film.tsx), but five lines and three phones:
 *   1  hook  "Members keep coming back when they see progress."  the member app's progress chart
 *   2        "Progress needs tracking, set by set."               a workout: the weight to beat on each set
 *   3        "...a free, modern workout app, in your gym's name."  the app's Gym tab, the gym's name on top
 *   4        "Open your own shop, on Pro. Send free messages..."   same screen: the shop (on Pro), then a
 *                                                                  gym message pops up (in-app inbox + phone
 *                                                                  pop-up, F128/F132; never WhatsApp)
 *   5        end card "MettleUp. Modern gym software." + the offer
 * Every screen is the real member app (store-shots run 42609482626) in the example gym "Iron Temple
 * Fitness", marked "Example gym". The pop-up's words are the gym's own: its name, then the first line of
 * a ready message ("New gym timings", dashboard crm/shop/messages.ts), as noticeAlertWords.ts builds it.
 */
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, MANROPE, clampOpts } from './theme';
import { Desk, Phone, Room, Space, Spot, tf } from './stage';
import { Captions, EndCard, Headline, HiChip, Sfx, Streaks } from './kit';
import { ADS, hasVoice, timing } from './timing';
import { kf } from './Film';
import type { PhoneShot } from './Film';

export const PROGRESS_ID = '06-progress';
const MEMBER = 1080 / 2400;

/** What the feed stills (Feed.tsx) show for this ad: the progress chart, like the hook. */
export const PROGRESS_FEED: { desk: string; first: PhoneShot } = {
  desk: 'screens/desk-today.jpg',
  first: { src: 'screens/member-05.jpg', aspect: MEMBER, tag: 'Example gym', spots: [] },
};

const R = {
  chart: { x: 0.05, y: 0.365, w: 0.9, h: 0.3 },
  sets: { x: 0.1, y: 0.255, w: 0.88, h: 0.39 },
  name: { x: 0.03, y: 0.075, w: 0.55, h: 0.085 },
  shop: { x: 0.03, y: 0.36, w: 0.94, h: 0.53 },
  notice: { x: 0.03, y: 0.03, w: 0.94, h: 0.115 },
};

/** A gym message arriving: an Android pop-up at the top of the screen, as F132 shows it. */
const Notice: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < at) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 16, stiffness: 140, mass: 0.8 } });
  return (
    <div style={{
      position: 'absolute', left: '3%', right: '3%', top: '3%', transform: `translateY(${(1 - s) * -140}%)`, opacity: Math.min(1, s * 2),
      background: 'rgba(46,50,58,0.97)', borderRadius: 26, padding: '14px 18px 16px', boxShadow: '0 14px 30px rgba(0,0,0,0.55)',
      fontFamily: MANROPE, color: '#F1F3F6',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 600, color: '#C3C8D0' }}>
        <div style={{ width: 24, height: 24, borderRadius: 12, background: C.forge, display: 'grid', placeItems: 'center' }}>
          <Img src={staticFile('brand/mark.svg')} style={{ width: 15, height: 15, filter: 'brightness(0) invert(1)' }} />
        </div>
        MettleUp · now
      </div>
      <div style={{ marginTop: 8, fontSize: 21, fontWeight: 800, letterSpacing: '-0.01em' }}>Iron Temple Fitness</div>
      <div style={{ marginTop: 2, fontSize: 19, fontWeight: 600, color: '#D5D9DF' }}>New gym timings</div>
    </div>
  );
};

export const Progress: React.FC = () => {
  const f = useCurrentFrame();
  const ad = ADS.find((a) => a.id === PROGRESS_ID)!;
  const t = timing(PROGRESS_ID);
  const L = t.lines;
  const A = 0;
  const B = L[1].from - 6; // phone 2: the workout
  const Cc = L[2].from - 6; // phone 3: the gym tab
  const S = L[3].from; // the shop
  const M = L[3].from + Math.round(L[3].dur * 0.5); // the message pops up
  const D = L[4].from - 12; // end card
  const total = t.total;

  const cam = kf(f, [[0, { z: -120, ry: 3, rx: 1 }], [B, { z: 0, ry: 0 }], [Cc, { z: 30, ry: -2 }], [D, { z: 60, ry: 1.5 }], [total, { z: 120, ry: 2.5 }]]);

  // phone 1 rises under the hook, then steps back into the shadow; gone when phone 3 lands
  const p1 = kf(f, [
    [A, { x: 150, y: 1150, z: -300, ry: -24, rx: 12, rz: 4 }],
    [A + 26, { x: 150, y: 640, z: -260, ry: -18, rx: 7, rz: 2 }],
    [B, { x: 120, y: 560, z: -200, ry: -14, rx: 5, rz: 1 }],
    [B + 22, { x: -330, y: 200, z: -560, ry: 24, rx: 2 }],
    [Cc, { x: -360, y: 190, z: -640, ry: 26 }],
    [Cc + 22, { x: -520, y: 180, z: -900, ry: 30 }],
  ]);
  const p2 = kf(f, [
    [B - 2, { x: 760, y: 300, z: -420, ry: -46, rx: 4 }],
    [B + 22, { x: 40, y: 250, z: 20, ry: -9, rx: 3 }],
    [Cc, { x: 30, y: 235, z: 80, ry: -5, rx: 2 }],
    [Cc + 22, { x: -330, y: 200, z: -560, ry: 24, rx: 2 }],
    [D, { x: -360, y: 190, z: -640, ry: 26 }],
    [total, { x: -380, y: 180, z: -700, ry: 27 }],
  ]);
  const p3 = kf(f, [
    [Cc - 2, { x: 760, y: 300, z: -420, ry: -46, rx: 4 }],
    [Cc + 22, { x: 90, y: 250, z: 40, ry: -9, rx: 3 }],
    [D, { x: 70, y: 235, z: 110, ry: -4, rx: 2 }],
    [total, { x: 60, y: 225, z: 60, ry: -3 }],
  ]);
  const pd = kf(f, [[0, { x: 260, y: -60, z: -1250, ry: -28, rx: 5 }], [total, { x: 150, y: -110, z: -1050, ry: -20, rx: 3 }]]);
  const deskIn = interpolate(f, [4, 30], [0, 1], { ...clampOpts });
  const gone1 = interpolate(f, [Cc, Cc + 16], [1, 0], clampOpts);
  const dim1 = interpolate(f, [B, B + 20], [0, 0.55], clampOpts);
  const dim2 = interpolate(f, [Cc, Cc + 20], [0, 0.55], clampOpts);
  const in2 = interpolate(f, [B - 2, B + 14], [0, 1], clampOpts);
  const in3 = interpolate(f, [Cc - 2, Cc + 14], [0, 1], clampOpts);

  const spots1: Spot[] = [{ from: 34, to: B - 2, rect: R.chart, label: 'Their progress', side: 'right' }];
  const spots2: Spot[] = [{ from: B + 18, to: Cc - 2, rect: R.sets, label: 'Weight to beat', side: 'left' }];
  const spots3: Spot[] = [
    // lands as the voice reaches "in your gym's name" (the line's second half)
    { from: Math.max(Cc + 18, L[2].from + Math.round(L[2].dur * 0.4)), to: S - 4, rect: R.name, label: "Your gym's name", side: 'left', below: true },
    { from: S + 2, to: M - 4, rect: R.shop, label: 'Your shop, on Pro', side: 'right' },
    { from: M + 6, to: D + 4, rect: R.notice, label: 'Free messages', side: 'right', below: true },
  ];

  const voice = hasVoice(PROGRESS_ID);
  const voOn = (fr: number) => voice && L.some((l) => fr >= l.from - 4 && fr <= l.from + l.dur + 4);
  const musicVol = (fr: number) =>
    (voOn(fr) ? 0.2 : 0.42) * interpolate(fr, [total - 30, total - 2], [1, 0], clampOpts) * interpolate(fr, [0, 6], [0.6, 1], clampOpts);

  const centre: React.CSSProperties = { display: 'grid', placeItems: 'center', transformStyle: 'preserve-3d' };
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Room len={total} />
      <Space cam={cam}>
        <AbsoluteFill style={centre}>
          <div style={{ transform: tf(pd), opacity: 0.85 * deskIn, transformStyle: 'preserve-3d' }}>
            <Desk src={PROGRESS_FEED.desk} width={1700} dim={0.35} />
          </div>
        </AbsoluteFill>
        {f < Cc + 18 && (
          <AbsoluteFill style={centre}>
            <div style={{ transform: tf(p1), transformStyle: 'preserve-3d', opacity: gone1 }}>
              <Phone src="screens/member-05.jpg" aspect={MEMBER} spots={spots1} tag={f < B ? 'Example gym' : undefined} dim={dim1} />
            </div>
          </AbsoluteFill>
        )}
        {f >= B - 2 && f <= D + 24 && (
          <AbsoluteFill style={centre}>
            <div style={{ transform: tf(p2), transformStyle: 'preserve-3d', opacity: in2 }}>
              <Phone src="screens/member-01.jpg" aspect={MEMBER} spots={spots2} tag={f < Cc ? 'Example gym' : undefined} dim={dim2} />
            </div>
          </AbsoluteFill>
        )}
        {f >= Cc - 2 && (
          <AbsoluteFill style={centre}>
            <div style={{ transform: tf(p3), transformStyle: 'preserve-3d', opacity: in3 }}>
              <Phone src="screens/member-gym.jpg" aspect={MEMBER} spots={spots3} tag={f < S ? 'Example gym' : 'Example gym · shop on Pro'}>
                <Notice at={M} />
              </Phone>
            </div>
          </AbsoluteFill>
        )}
      </Space>

      <Headline lines={ad.hook} accent={ad.accent} start={A} end={B - 4} />
      <HiChip text={ad.hi} at={A + 30} end={B - 4} top={268 + ad.hook.length * 108 + 34} />
      <Headline lines={ad.payoff} accent={[1]} start={B + 4} end={D - 4} size={86} />

      {f >= B && <Captions lines={ad.lines} timing={L} top={474} hideAfter={D + 6} />}
      <Streaks at={B - 4} />
      <Streaks at={Cc - 4} />
      <EndCard at={D} tagline="Modern gym software." line="Every member gets a free app in your gym's name." />

      <Audio src={staticFile('audio/music.wav')} volume={musicVol} />
      {voice && L.map((l, i) => (
        <Sequence key={i} from={l.from} layout="none">
          <Audio src={staticFile(`audio/${PROGRESS_ID}/vo-${i + 1}.wav`)} volume={1} />
        </Sequence>
      ))}
      <Sfx at={A} src="whoosh.wav" volume={0.35} />
      <Sfx at={A + 2 + (ad.hook.join(' ').split(' ').length - 1) * 3 + 4} src="hit.wav" volume={0.45} />
      <Sfx at={B - 6} src="whoosh.wav" volume={0.4} />
      <Sfx at={Cc - 6} src="whoosh.wav" volume={0.4} />
      {[...spots1, ...spots2, ...spots3].map((s, i) => <Sfx key={i} at={s.from + 4} src="tick.wav" volume={0.3} />)}
      <Sfx at={M} src="tick.wav" volume={0.45} />
      <Sfx at={D + 4} src="hit.wav" volume={0.55} />
      <Sfx at={D + 16} src="shine.wav" volume={0.35} />
    </AbsoluteFill>
  );
};
