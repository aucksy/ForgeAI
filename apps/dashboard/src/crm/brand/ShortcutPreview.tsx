/**
 * T74 (R-356): "How it looks on a member's home screen" — the gym's logo as the round home-screen
 * icon a member can add from the MettleUp app, laid out by the SAME rules the phone draws it with
 * (packages/theme shortcutIcon.ts; the phone's twin is forge-phone ShortcutArt.kt): the logo's own
 * edge colour fills the circle, and the logo stays inside the part no phone cuts off.
 */
import { useEffect, useState } from 'react';

import type { ShortcutIconPlan } from '@forgeai/theme';

import { color, font, radius, space } from '../ui/kit';
import { SHORTCUT_WORDS, shortcutPreviewBox } from './brandLogic';
import { readShortcutPlan } from './logoUpload';

/** The icon's size on the preview, px (a phone draws it at about 56-64 dp). */
const ICON = 64;

export function ShortcutPreview({ logoUrl, gymName, gymColours }: { logoUrl: string; gymName: string; gymColours: readonly string[] }) {
  const [plan, setPlan] = useState<ShortcutIconPlan | null | 'reading'>('reading');
  const colourKey = gymColours.join(',');

  useEffect(() => {
    let live = true;
    setPlan('reading');
    void readShortcutPlan(logoUrl, colourKey ? colourKey.split(',') : []).then((p) => {
      if (live) setPlan(p);
    });
    return () => {
      live = false;
    };
  }, [logoUrl, colourKey]);

  const box = plan && plan !== 'reading' ? shortcutPreviewBox(plan) : null;

  return (
    <div data-testid="shortcut-preview" style={{ display: 'flex', gap: space.md, alignItems: 'center', flexWrap: 'wrap', marginTop: space.md }}>
      <div
        aria-hidden
        style={{
          width: 120,
          height: 120,
          borderRadius: radius.lg,
          // A phone wallpaper: the icon must read on it whatever its colour.
          background: 'linear-gradient(160deg, #3B4A6B 0%, #1E2536 100%)',
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 auto',
        }}
      >
        <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
          <div
            data-testid="shortcut-icon"
            data-bg={box && plan && plan !== 'reading' ? plan.bg : undefined}
            style={{
              position: 'relative',
              width: ICON,
              height: ICON,
              borderRadius: '50%',
              overflow: 'hidden',
              background: plan && plan !== 'reading' ? plan.bg : 'rgba(255,255,255,0.18)',
            }}
          >
            {box && (
              <img
                src={logoUrl}
                alt=""
                style={{
                  position: 'absolute',
                  left: `${box.left}%`,
                  top: `${box.top}%`,
                  width: `${box.width}%`,
                  height: `${box.height}%`,
                  maxWidth: 'none',
                }}
              />
            )}
          </div>
          <span
            style={{
              maxWidth: 104,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: font.body,
              fontSize: 11,
              color: '#FFFFFF',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}
          >
            {gymName}
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: space.xs, flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.ink }}>{SHORTCUT_WORDS.title}</div>
        <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {plan === 'reading' ? SHORTCUT_WORDS.reading : plan === null ? SHORTCUT_WORDS.failed : SHORTCUT_WORDS.body}
        </div>
      </div>
    </div>
  );
}
