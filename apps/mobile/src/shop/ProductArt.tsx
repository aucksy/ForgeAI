/**
 * Our own simple drawings of the demo products (S1) — a tub, a pouch, a shaker… — in the app's
 * colours. No brand images and no network: every picture is drawn here, one component, picked by
 * `kind`. Decorative: the product's name is always written next to it, so screen readers skip it.
 */
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { color, radius } from '@/theme/tokens';

import type { ArtKind } from './types';

export interface ProductArtProps {
  kind: ArtKind;
  tint: string;
  /** Drawn width; the picture is square unless `height` says otherwise. */
  size: number;
  height?: number;
  /** Rounded tile behind the drawing (default true). */
  tile?: boolean;
}

const DARK = '#1C2130';
const LIGHT = '#F4F5F7';
const SHADE = 'rgba(0, 0, 0, 0.22)';
const SHINE = 'rgba(255, 255, 255, 0.16)';

function Drawing({ kind, tint }: { kind: ArtKind; tint: string }) {
  switch (kind) {
    case 'tub':
      return (
        <G>
          <Ellipse cx={50} cy={89} rx={30} ry={4} fill={SHADE} />
          <Rect x={22} y={30} width={56} height={58} rx={8} fill={tint} />
          <Rect x={22} y={30} width={10} height={58} rx={5} fill={SHINE} />
          <Rect x={19} y={20} width={62} height={14} rx={5} fill={DARK} />
          <Rect x={22} y={48} width={56} height={24} fill={LIGHT} opacity={0.92} />
          <Rect x={30} y={55} width={28} height={4} rx={2} fill={tint} />
          <Rect x={30} y={62} width={18} height={3} rx={1.5} fill={DARK} opacity={0.5} />
        </G>
      );
    case 'jar':
      return (
        <G>
          <Ellipse cx={50} cy={89} rx={22} ry={3.5} fill={SHADE} />
          <Rect x={30} y={40} width={40} height={48} rx={7} fill={tint} />
          <Rect x={30} y={40} width={8} height={48} rx={4} fill={SHINE} />
          <Rect x={28} y={30} width={44} height={13} rx={4} fill={DARK} />
          <Rect x={30} y={55} width={40} height={18} fill={LIGHT} opacity={0.92} />
          <Rect x={36} y={61} width={20} height={4} rx={2} fill={tint} />
        </G>
      );
    case 'pouch':
      return (
        <G>
          <Ellipse cx={50} cy={90} rx={28} ry={3.5} fill={SHADE} />
          <Path d="M28 18 H72 L78 84 Q78 90 72 90 H28 Q22 90 22 84 Z" fill={tint} />
          <Path d="M28 18 H36 L32 90 H28 Q22 90 22 84 Z" fill={SHINE} />
          <Rect x={28} y={16} width={44} height={7} rx={2} fill={DARK} />
          <Circle cx={50} cy={56} r={15} fill={LIGHT} opacity={0.92} />
          <Rect x={42} y={53} width={16} height={4} rx={2} fill={tint} />
          <Rect x={45} y={60} width={10} height={3} rx={1.5} fill={DARK} opacity={0.5} />
        </G>
      );
    case 'barbox':
      return (
        <G>
          <Ellipse cx={50} cy={84} rx={38} ry={4} fill={SHADE} />
          <Path d="M14 40 L24 30 H90 L80 40 Z" fill={tint} opacity={0.7} />
          <Rect x={14} y={40} width={66} height={42} rx={3} fill={tint} />
          <Path d="M80 40 L90 30 V72 L80 82 Z" fill={DARK} opacity={0.55} />
          <Rect x={22} y={50} width={50} height={9} rx={4.5} fill={DARK} />
          <Rect x={22} y={63} width={50} height={9} rx={4.5} fill={DARK} opacity={0.75} />
          <Rect x={26} y={52} width={14} height={5} rx={2.5} fill={LIGHT} opacity={0.85} />
        </G>
      );
    case 'shaker':
      return (
        <G>
          <Ellipse cx={50} cy={90} rx={20} ry={3} fill={SHADE} />
          <Path d="M32 36 L37 88 H63 L68 36 Z" fill={tint} />
          <Path d="M32 36 L37 88 H43 L39 36 Z" fill={SHINE} />
          <Rect x={29} y={25} width={42} height={13} rx={4} fill={DARK} />
          <Rect x={43} y={15} width={14} height={11} rx={3} fill={DARK} />
          <Line x1={56} y1={50} x2={64} y2={50} stroke={LIGHT} strokeWidth={2} opacity={0.7} />
          <Line x1={57} y1={60} x2={63} y2={60} stroke={LIGHT} strokeWidth={2} opacity={0.7} />
          <Line x1={57} y1={70} x2={63} y2={70} stroke={LIGHT} strokeWidth={2} opacity={0.7} />
        </G>
      );
    case 'bottle':
      return (
        <G>
          <Ellipse cx={50} cy={90} rx={18} ry={3} fill={SHADE} />
          <Rect x={43} y={12} width={14} height={9} rx={2} fill={DARK} />
          <Path d="M44 21 H56 V28 Q66 32 66 42 V82 Q66 89 59 89 H41 Q34 89 34 82 V42 Q34 32 44 28 Z" fill={tint} />
          <Path d="M41 34 Q37 38 37 44 V82 Q37 86 41 87 Z" fill={SHINE} />
          <Rect x={34} y={50} width={32} height={20} fill={LIGHT} opacity={0.92} />
          <Rect x={40} y={56} width={16} height={4} rx={2} fill={tint} />
        </G>
      );
    case 'gloves':
      return (
        <G>
          <Ellipse cx={50} cy={91} rx={26} ry={3} fill={SHADE} />
          <Rect x={31} y={18} width={8} height={30} rx={4} fill={tint} />
          <Rect x={41} y={13} width={8} height={34} rx={4} fill={tint} />
          <Rect x={51} y={14} width={8} height={33} rx={4} fill={tint} />
          <Rect x={61} y={20} width={8} height={28} rx={4} fill={tint} />
          <Rect x={31} y={18} width={38} height={9} fill={DARK} opacity={0.35} />
          <Ellipse cx={26} cy={58} rx={6} ry={13} fill={tint} transform="rotate(-30 26 58)" />
          <Rect x={30} y={38} width={40} height={42} rx={10} fill={tint} />
          <Rect x={37} y={48} width={26} height={18} rx={6} fill={DARK} opacity={0.35} />
          <Rect x={28} y={76} width={44} height={12} rx={4} fill={color.accentDeep} />
        </G>
      );
    case 'belt':
      return (
        <G>
          <Ellipse cx={50} cy={78} rx={40} ry={3.5} fill={SHADE} />
          <Rect x={8} y={38} width={84} height={28} rx={6} fill={tint} />
          <Rect x={8} y={38} width={84} height={6} rx={3} fill={SHINE} />
          <Line x1={12} y1={60} x2={88} y2={60} stroke={LIGHT} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          <Circle cx={22} cy={52} r={2.5} fill={DARK} />
          <Circle cx={32} cy={52} r={2.5} fill={DARK} />
          <Circle cx={42} cy={52} r={2.5} fill={DARK} />
          <Rect x={60} y={32} width={18} height={40} rx={4} fill="none" stroke={LIGHT} strokeWidth={4} opacity={0.9} />
          <Line x1={60} y1={52} x2={78} y2={52} stroke={LIGHT} strokeWidth={3} opacity={0.9} />
        </G>
      );
    case 'wraps':
      return (
        <G>
          <Ellipse cx={50} cy={82} rx={38} ry={3.5} fill={SHADE} />
          <Rect x={30} y={62} width={56} height={14} rx={4} fill={tint} opacity={0.8} />
          <Rect x={78} y={62} width={8} height={14} rx={2} fill={DARK} />
          <Circle cx={32} cy={56} r={22} fill={tint} />
          <Circle cx={32} cy={56} r={15} fill="none" stroke={DARK} strokeWidth={1.5} opacity={0.5} />
          <Circle cx={32} cy={56} r={8} fill={DARK} />
          <Path d="M64 32 Q72 24 80 32" fill="none" stroke={LIGHT} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
        </G>
      );
    case 'band':
      return (
        <G>
          <Ellipse cx={50} cy={84} rx={36} ry={3.5} fill={SHADE} />
          <Ellipse cx={50} cy={50} rx={36} ry={28} fill="none" stroke={tint} strokeWidth={7} />
          <Ellipse cx={50} cy={54} rx={26} ry={20} fill="none" stroke={color.accent} strokeWidth={6} />
          <Ellipse cx={50} cy={58} rx={16} ry={12} fill="none" stroke="#9085E9" strokeWidth={5} />
        </G>
      );
    case 'towel':
      return (
        <G>
          <Ellipse cx={50} cy={84} rx={36} ry={3.5} fill={SHADE} />
          <Rect x={16} y={30} width={68} height={50} rx={6} fill={tint} />
          <Rect x={16} y={30} width={68} height={16} rx={6} fill={SHINE} />
          <Line x1={16} y1={46} x2={84} y2={46} stroke={DARK} strokeWidth={1.5} opacity={0.35} />
          <Rect x={16} y={64} width={68} height={4} fill={LIGHT} opacity={0.75} />
          <Rect x={16} y={71} width={68} height={2} fill={LIGHT} opacity={0.55} />
          <Rect x={70} y={22} width={8} height={12} rx={3} fill={DARK} />
        </G>
      );
    case 'tshirt':
      return (
        <G>
          <Ellipse cx={50} cy={90} rx={26} ry={3} fill={SHADE} />
          <Path d="M36 16 L20 23 L8 42 L22 50 L28 42 V88 H72 V42 L78 50 L92 42 L80 23 L64 16 Q58 25 50 25 Q42 25 36 16 Z" fill={tint} />
          <Path d="M36 16 Q42 25 50 25 Q58 25 64 16" fill="none" stroke={DARK} strokeWidth={2.5} opacity={0.45} />
          <Path d="M28 42 V88 H36 V42 Z" fill={SHINE} />
          <Rect x={42} y={46} width={16} height={4} rx={2} fill={LIGHT} opacity={0.85} />
        </G>
      );
  }
}

export function ProductArt({ kind, tint, size, height, tile = true }: ProductArtProps) {
  const h = height ?? size;
  const drawn = Math.min(size, h) * 0.78;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: h,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tile ? radius.md : 0,
        backgroundColor: tile ? color.surfaceRaised : 'transparent',
      }}
    >
      <Svg width={drawn} height={drawn} viewBox="0 0 100 100">
        <Drawing kind={kind} tint={tint} />
      </Svg>
    </View>
  );
}
