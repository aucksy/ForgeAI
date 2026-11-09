/**
 * The MettleUp logo for the admin app (R-259 "steel plate", owner pick 31 Oct 2026): the Forged hex
 * mark, then METTLEUP in the steel-plate letters, laid out like the phone app's MettleUpLogo (name cap
 * height 0.44 x the mark, 0.32 x the mark apart). The shapes come from brand/steelLockup.ts, which
 * branding/mettleup/_src/web_steel_lockup.py writes; never draw "MettleUp" in a font in a logo spot.
 *
 * Small sizes are flat: "METTLE" and "UP" use --mu-mettle / --mu-up (index.css), so the name follows
 * the Dark | Light switch (Iron + Forge on dark, Steel + Ember on light). The mark keeps its own faces.
 *
 * `height` is the mark's height in px (the whole lockup's height). `mark={false}` draws the name alone,
 * at cap height `height` (for the quiet "Powered by" line).
 */
import type { CSSProperties } from 'react';
import { LOCKUP_CAP, LOCKUP_GAP, MARK_BOX, MARK_FACES, NAME_BOX, NAME_METTLE_D, NAME_UP_D } from '../brand/steelLockup';

function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

export function SteelLockup({
  height,
  mark = true,
  style,
}: {
  height: number;
  mark?: boolean;
  style?: CSSProperties;
}) {
  const name = (
    <>
      <path d={NAME_METTLE_D} style={{ fill: 'var(--mu-mettle)' }} />
      <path d={NAME_UP_D} style={{ fill: 'var(--mu-up)' }} />
    </>
  );
  if (!mark) {
    const w = (NAME_BOX.w * height) / NAME_BOX.h;
    return (
      <svg
        role="img"
        aria-label="MettleUp"
        viewBox={`0 0 ${NAME_BOX.w} ${NAME_BOX.h}`}
        width={n(w)}
        height={height}
        style={{ display: 'block', flex: 'none', ...style }}
      >
        {name}
      </svg>
    );
  }
  const s = MARK_BOX.size;
  const cap = s * LOCKUP_CAP;
  const k = cap / NAME_BOX.h;
  const wordX = s + s * LOCKUP_GAP;
  const totalW = wordX + NAME_BOX.w * k;
  return (
    <svg
      role="img"
      aria-label="MettleUp"
      viewBox={`0 0 ${n(totalW)} ${s}`}
      width={n((height * totalW) / s)}
      height={height}
      style={{ display: 'block', flex: 'none', ...style }}
    >
      <g transform={`translate(${-MARK_BOX.x} ${-MARK_BOX.y})`}>
        {MARK_FACES.map((f, i) => (
          <path key={i} d={f.d} fill={f.fill} />
        ))}
      </g>
      <g transform={`translate(${n(wordX)} ${n((s - cap) / 2)}) scale(${k})`}>{name}</g>
    </svg>
  );
}
