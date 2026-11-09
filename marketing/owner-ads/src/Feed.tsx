/** Feed stills (1:1 and 4:5) for each hook: the same room, devices, type and steel name, one frame. */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { AdSpec } from './Film';
import { Desk, Phone, Room, tf, mix } from './stage';
import { Headline, Lockup } from './kit';
import { ADS } from './timing';
import { SPECS } from './ads';
import { PROGRESS_FEED } from './Progress';
import { C, MANROPE } from './theme';

export const Feed: React.FC<{ id: string; h: number }> = ({ id, h }) => {
  const spec = (SPECS.find((x) => x.id === id) ?? PROGRESS_FEED) as Pick<AdSpec, 'desk' | 'first'>;
  const ad = ADS.find((a) => a.id === id)!;
  const tall = h > 1100;
  const size = tall ? 84 : 74;
  const shot = spec.first;
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <Room len={1} still />
      <AbsoluteFill style={{ perspective: 2000, perspectiveOrigin: '70% 50%' }}>
        <AbsoluteFill style={{ display: 'grid', placeItems: 'center', transformStyle: 'preserve-3d' }}>
          <div style={{ transform: tf(mix({ x: 380, y: -40, z: -1300, ry: -30, rx: 4 }, {}, 0)), opacity: 0.75 }}>
            <Desk src={spec.desk} width={1700} dim={0.4} />
          </div>
        </AbsoluteFill>
        <AbsoluteFill style={{ display: 'grid', placeItems: 'center', transformStyle: 'preserve-3d' }}>
          <div style={{ transform: tf(mix({ x: 280, y: tall ? 330 : 240, z: -60, ry: -16, rx: 4, rz: 2 }, {}, 0)) }}>
            <Phone src={shot.src} aspect={shot.aspect} width={tall ? 420 : 380} tag={shot.tag ?? 'Example gym'} />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
      <Headline lines={ad.hook} accent={ad.accent} start={0} still size={size} top={tall ? 96 : 70} left={64} width={600} />
      <div style={{ position: 'absolute', left: 64, bottom: tall ? 92 : 64, width: 560 }}>
        <Lockup width={tall ? 470 : 420} still />
        <div style={{ marginTop: 26, fontFamily: MANROPE, fontWeight: 800, fontSize: tall ? 54 : 48, lineHeight: 1.08, letterSpacing: '-0.02em' }}>
          <div style={{ color: C.molten }}>Free for 3 months.</div><div style={{ color: C.iron }}>No card.</div>
        </div>
        <div style={{
          marginTop: 22, display: 'inline-block', fontFamily: MANROPE, fontWeight: 800, fontSize: tall ? 36 : 32, color: C.steel,
          padding: '14px 28px', borderRadius: 999, background: `linear-gradient(180deg, #FF9A5F, ${C.forge})`,
        }}>app.mettleup.fit/start</div>
      </div>
    </AbsoluteFill>
  );
};
