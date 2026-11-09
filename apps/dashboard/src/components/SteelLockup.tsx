/**
 * The MettleUp logo for the admin app (R-259 "steel plate", owner pick 31 Oct 2026): the Forged hex
 * mark, then METTLEUP in the steel-plate letters, laid out like the phone app's MettleUpLogo (name cap
 * height 0.44 x the mark, 0.32 x the mark apart). The shapes come from brand/steelLockup.ts, which
 * branding/mettleup/_src/web_steel_lockup.py writes; never draw "MettleUp" in a font in a logo spot.
 *
 * The name is never flat (owner, 9 Nov 2026, R-425): at every size and on Dark and Light it wears the
 * splash's shine, "METTLE" in polished steel and "UP" in orange metal (vertical gradients, cap line to
 * baseline). On the Light theme the same shine is drawn in gunmetal (index.css swaps .mu-name-dark /
 * .mu-name-light), so the bright steel top does not vanish into a white page. Each instance gets its own
 * gradient ids (useId), so several logos on one page never clash.
 *
 * `height` is the mark's height in px (the whole lockup's height). `mark={false}` draws the name alone,
 * at cap height `height` (for the quiet "Powered by" line).
 */
import { useId, type CSSProperties } from 'react';
import {
  LOCKUP_CAP,
  LOCKUP_GAP,
  MARK_BOX,
  MARK_FACES,
  NAME_BOX,
  NAME_FORGE_ON_LIGHT_STOPS,
  NAME_FORGE_STOPS,
  NAME_METTLE_D,
  NAME_STEEL_ON_LIGHT_STOPS,
  NAME_STEEL_STOPS,
  NAME_UP_D,
} from '../brand/steelLockup';

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
  // useId gives ':r0:'-style ids; keep only characters that are safe inside url(#...).
  const uid = 'mu' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const grad = (id: string, stops: ReadonlyArray<readonly [number, string]>) => (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={NAME_BOX.h}>
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
  // The name is drawn twice; index.css shows .mu-name-dark (steel) or .mu-name-light (gunmetal) by theme.
  const name = (
    <>
      <defs>
        {grad(`${uid}s`, NAME_STEEL_STOPS)}
        {grad(`${uid}f`, NAME_FORGE_STOPS)}
        {grad(`${uid}sl`, NAME_STEEL_ON_LIGHT_STOPS)}
        {grad(`${uid}fl`, NAME_FORGE_ON_LIGHT_STOPS)}
      </defs>
      <g className="mu-name-dark">
        <path d={NAME_METTLE_D} fill={`url(#${uid}s)`} />
        <path d={NAME_UP_D} fill={`url(#${uid}f)`} />
      </g>
      <g className="mu-name-light">
        <path d={NAME_METTLE_D} fill={`url(#${uid}sl)`} />
        <path d={NAME_UP_D} fill={`url(#${uid}fl)`} />
      </g>
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
