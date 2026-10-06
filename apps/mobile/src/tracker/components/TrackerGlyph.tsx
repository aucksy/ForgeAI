/**
 * A few extra glyphs the workout screen needs (Phase 1). Drawn in the same style as
 * the frozen `components/ui/Icon` (24×24, 1.8 stroke, round caps) — that file is
 * frozen, so the tracker keeps its own small set here.
 */
import Svg, { Circle, Path } from 'react-native-svg';

import { color as palette } from '@/theme/tokens';

export type GlyphName = 'more' | 'chevron-down' | 'medal' | 'trash' | 'pencil' | 'list' | 'info';

const PATHS: Record<GlyphName, { p?: string[]; dots?: { x: number; y: number }[]; c?: { x: number; y: number; r: number }[] }> = {
  more: { dots: [{ x: 5.5, y: 12 }, { x: 12, y: 12 }, { x: 18.5, y: 12 }] },
  'chevron-down': { p: ['M5.5 9.3 12 15.8l6.5-6.5'] },
  medal: {
    p: ['M8.2 3.5 10.6 9', 'M15.8 3.5 13.4 9', 'M12 13.2v.01'],
    c: [{ x: 12, y: 15, r: 5.4 }],
  },
  trash: {
    p: ['M4.5 6.8h15', 'M9.5 6.8V4.6h5v2.2', 'M6.6 6.8l.9 12.4a1.8 1.8 0 0 0 1.8 1.6h5.4a1.8 1.8 0 0 0 1.8-1.6l.9-12.4'],
  },
  pencil: {
    p: ['M15.2 4.6 19.4 8.8 9 19.2H4.8V15Z', 'M13 6.8l4.2 4.2'],
  },
  list: { p: ['M9 6.5h11', 'M9 12h11', 'M9 17.5h11', 'M4.5 6.5h.01', 'M4.5 12h.01', 'M4.5 17.5h.01'] },
  info: { p: ['M12 11v5.2', 'M12 7.9v.01'], c: [{ x: 12, y: 12, r: 8.6 }] },
};

export function Glyph({ name, size = 22, color = palette.ink }: { name: GlyphName; size?: number; color?: string }) {
  const d = PATHS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {d.p?.map((p, i) => (
        <Path key={i} d={p} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {d.c?.map((c, i) => (
        <Circle key={`c${i}`} cx={c.x} cy={c.y} r={c.r} stroke={color} strokeWidth={1.8} />
      ))}
      {d.dots?.map((c, i) => (
        <Circle key={`d${i}`} cx={c.x} cy={c.y} r={1.9} fill={color} />
      ))}
    </Svg>
  );
}
