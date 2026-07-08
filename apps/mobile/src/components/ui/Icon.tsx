import Svg, { Circle, G, Path } from 'react-native-svg';

import { color as palette } from '@/theme/tokens';

export type IconName =
  | 'home'
  | 'chat'
  | 'chart'
  | 'settings'
  | 'mic'
  | 'send'
  | 'camera'
  | 'flame'
  | 'dumbbell'
  | 'meal'
  | 'trophy'
  | 'trend'
  | 'chevron-right'
  | 'chevron-left'
  | 'plus'
  | 'check'
  | 'close'
  | 'sparkle'
  | 'calendar'
  | 'clock'
  | 'scale'
  | 'heart'
  | 'zap'
  | 'target'
  | 'key'
  | 'globe'
  | 'volume';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

interface IconDef {
  /** Stroked path data (24x24 viewBox, 1.8 stroke, round caps/joins). */
  p?: string[];
  /** Stroked circles. */
  c?: { x: number; y: number; r: number }[];
}

/** Hand-drawn Lucide-like stroke set. Zero-length `h.01` segments render as dots. */
const ICONS: Record<IconName, IconDef> = {
  home: {
    p: [
      'M3.5 10.3 12 3.2l8.5 7.1',
      'M5.3 8.9V19a2 2 0 0 0 2 2h9.4a2 2 0 0 0 2-2V8.9',
      'M9.5 21v-4.8a2.5 2.5 0 0 1 5 0V21',
    ],
  },
  chat: {
    p: ['M7.9 20A9 9 0 1 0 4 16.1L2.5 21.5Z', 'M8.5 11.5h.01', 'M12 11.5h.01', 'M15.5 11.5h.01'],
  },
  chart: {
    p: ['M4.5 4.5v15h15', 'M8.8 15.8v-3.3', 'M12.8 15.8V8.6', 'M16.8 15.8V5.9'],
  },
  settings: {
    p: ['M4 7.3h7.2', 'M15.8 7.3H20', 'M4 16.7h4.2', 'M12.8 16.7H20'],
    c: [
      { x: 13.5, y: 7.3, r: 2 },
      { x: 10.5, y: 16.7, r: 2 },
    ],
  },
  mic: {
    p: [
      'M12 3.2a3.1 3.1 0 0 1 3.1 3.1v5a3.1 3.1 0 0 1-6.2 0v-5A3.1 3.1 0 0 1 12 3.2Z',
      'M5.6 11.6a6.4 6.4 0 0 0 12.8 0',
      'M12 18v2.8',
    ],
  },
  send: {
    p: ['M21.5 2.5 11.3 12.7', 'M21.5 2.5 14.8 21.5l-3.5-8.8-8.8-3.5Z'],
  },
  camera: {
    p: [
      'M3.5 8.4A2.4 2.4 0 0 1 5.9 6h1.7l1.5-2.2h5.8L16.4 6h1.7a2.4 2.4 0 0 1 2.4 2.4v8.2a2.4 2.4 0 0 1-2.4 2.4H5.9a2.4 2.4 0 0 1-2.4-2.4Z',
    ],
    c: [{ x: 12, y: 12.3, r: 3.4 }],
  },
  flame: {
    p: [
      'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z',
    ],
  },
  dumbbell: {
    p: ['M3.5 9.7v4.6', 'M6.7 7.2v9.6', 'M17.3 7.2v9.6', 'M20.5 9.7v4.6', 'M6.7 12h10.6'],
  },
  meal: {
    p: ['M3.5 12.3h17a8.5 8.5 0 0 1-17 0Z', 'M9.3 8.6V6.6', 'M14.7 8.6V6.6'],
  },
  trophy: {
    p: [
      'M7.5 4.2h9v5.3a4.5 4.5 0 0 1-9 0Z',
      'M7.5 5.7h-3v1.2a3.1 3.1 0 0 0 3.1 3.1',
      'M16.5 5.7h3v1.2a3.1 3.1 0 0 1-3.1 3.1',
      'M12 14v3.6',
      'M9.4 20.8c0-1.7 1.2-3.2 2.6-3.2s2.6 1.5 2.6 3.2',
      'M8 20.8h8',
    ],
  },
  trend: {
    p: ['M2.8 16.8 9 10.6l4.4 4.4 7.8-7.8', 'M15.6 7.2h5.6v5.6'],
  },
  'chevron-right': { p: ['M9.3 5.5 15.8 12l-6.5 6.5'] },
  'chevron-left': { p: ['M14.7 5.5 8.2 12l6.5 6.5'] },
  plus: { p: ['M12 5v14', 'M5 12h14'] },
  check: { p: ['M4.5 12.6 9.8 18 19.5 7'] },
  close: { p: ['M6 6l12 12', 'M18 6 6 18'] },
  sparkle: {
    p: [
      'M12 4c.8 3.6 2.7 5.5 6.3 6.3-3.6.8-5.5 2.7-6.3 6.3-.8-3.6-2.7-5.5-6.3-6.3C9.3 9.5 11.2 7.6 12 4Z',
      'M18.8 15.5v3.4',
      'M17.1 17.2h3.4',
    ],
  },
  calendar: {
    p: [
      'M5.5 5.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z',
      'M8 3.4v4',
      'M16 3.4v4',
      'M3.5 10.4h17',
    ],
  },
  clock: {
    p: ['M12 7.4V12l3.2 2.1'],
    c: [{ x: 12, y: 12, r: 8.6 }],
  },
  scale: {
    p: [
      'M6.2 3.8h11.6a2.7 2.7 0 0 1 2.7 2.7v11a2.7 2.7 0 0 1-2.7 2.7H6.2a2.7 2.7 0 0 1-2.7-2.7v-11a2.7 2.7 0 0 1 2.7-2.7Z',
      'M8.6 10.4a4.7 4.7 0 0 1 6.8 0',
      'M12 11.2l1.5-2.1',
    ],
  },
  heart: {
    p: [
      'M12 20.3C7.2 16.6 3.6 13.4 3.6 9.8c0-2.5 1.9-4.3 4.2-4.3 1.7 0 3.2 1 4.2 2.6 1-1.6 2.5-2.6 4.2-2.6 2.3 0 4.2 1.8 4.2 4.3 0 3.6-3.6 6.8-8.4 10.5Z',
    ],
  },
  zap: {
    p: ['M13.2 2.6 4.5 13.5h6.3l-1 7.9 8.7-10.9h-6.3Z'],
  },
  target: {
    c: [
      { x: 12, y: 12, r: 8.6 },
      { x: 12, y: 12, r: 4.9 },
      { x: 12, y: 12, r: 1.2 },
    ],
  },
  key: {
    p: ['M10 14 20.8 3.2', 'M17.2 6.8 20 9.6', 'M13.9 10.1 16.2 12.4'],
    c: [{ x: 7.4, y: 16.6, r: 3.6 }],
  },
  globe: {
    p: [
      'M3.4 12h17.2',
      'M12 3.4c2.9 2.3 4.3 5.2 4.3 8.6s-1.4 6.3-4.3 8.6c-2.9-2.3-4.3-5.2-4.3-8.6S9.1 5.7 12 3.4Z',
    ],
    c: [{ x: 12, y: 12, r: 8.6 }],
  },
  volume: {
    p: [
      'M11.3 5.2v13.6L7 15.4H4.6a1.1 1.1 0 0 1-1.1-1.1V9.7a1.1 1.1 0 0 1 1.1-1.1H7Z',
      'M14.8 9.2a4 4 0 0 1 0 5.6',
      'M17.6 6.6a7.8 7.8 0 0 1 0 10.8',
    ],
  },
};

export function Icon({ name, size = 24, color = palette.ink }: IconProps) {
  const def = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {def.p?.map((d, i) => <Path key={i} d={d} />)}
        {def.c?.map((c, i) => <Circle key={`c${i}`} cx={c.x} cy={c.y} r={c.r} />)}
      </G>
    </Svg>
  );
}
