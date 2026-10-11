/**
 * Simple drawings of the shop's products — a tub, a pouch, a shaker… — in the
 * product's own colour. The same shapes the member app draws (apps/mobile
 * `src/shop/ProductArt.tsx`), redrawn as plain SVG so the owner sees what members
 * see. Decorative: the product's name is always written beside it.
 */

import type { ArtKind } from './logic';

const DARK = '#1C2130';
const LIGHT = '#F4F5F7';
const SHADE = 'rgba(0, 0, 0, 0.22)';
const SHINE = 'rgba(255, 255, 255, 0.16)';
const EMBER = '#E8641F';

function Drawing({ kind, tint }: { kind: ArtKind; tint: string }) {
  switch (kind) {
    case 'tub':
      return (
        <g>
          <ellipse cx={50} cy={89} rx={30} ry={4} fill={SHADE} />
          <rect x={22} y={30} width={56} height={58} rx={8} fill={tint} />
          <rect x={22} y={30} width={10} height={58} rx={5} fill={SHINE} />
          <rect x={19} y={20} width={62} height={14} rx={5} fill={DARK} />
          <rect x={22} y={48} width={56} height={24} fill={LIGHT} opacity={0.92} />
          <rect x={30} y={55} width={28} height={4} rx={2} fill={tint} />
          <rect x={30} y={62} width={18} height={3} rx={1.5} fill={DARK} opacity={0.5} />
        </g>
      );
    case 'jar':
      return (
        <g>
          <ellipse cx={50} cy={89} rx={22} ry={3.5} fill={SHADE} />
          <rect x={30} y={40} width={40} height={48} rx={7} fill={tint} />
          <rect x={30} y={40} width={8} height={48} rx={4} fill={SHINE} />
          <rect x={28} y={30} width={44} height={13} rx={4} fill={DARK} />
          <rect x={30} y={55} width={40} height={18} fill={LIGHT} opacity={0.92} />
          <rect x={36} y={61} width={20} height={4} rx={2} fill={tint} />
        </g>
      );
    case 'pouch':
      return (
        <g>
          <ellipse cx={50} cy={90} rx={28} ry={3.5} fill={SHADE} />
          <path d="M28 18 H72 L78 84 Q78 90 72 90 H28 Q22 90 22 84 Z" fill={tint} />
          <path d="M28 18 H36 L32 90 H28 Q22 90 22 84 Z" fill={SHINE} />
          <rect x={28} y={16} width={44} height={7} rx={2} fill={DARK} />
          <circle cx={50} cy={56} r={15} fill={LIGHT} opacity={0.92} />
          <rect x={42} y={53} width={16} height={4} rx={2} fill={tint} />
          <rect x={45} y={60} width={10} height={3} rx={1.5} fill={DARK} opacity={0.5} />
        </g>
      );
    case 'barbox':
      return (
        <g>
          <ellipse cx={50} cy={84} rx={38} ry={4} fill={SHADE} />
          <path d="M14 40 L24 30 H90 L80 40 Z" fill={tint} opacity={0.7} />
          <rect x={14} y={40} width={66} height={42} rx={3} fill={tint} />
          <path d="M80 40 L90 30 V72 L80 82 Z" fill={DARK} opacity={0.55} />
          <rect x={22} y={50} width={50} height={9} rx={4.5} fill={DARK} />
          <rect x={22} y={63} width={50} height={9} rx={4.5} fill={DARK} opacity={0.75} />
          <rect x={26} y={52} width={14} height={5} rx={2.5} fill={LIGHT} opacity={0.85} />
        </g>
      );
    case 'shaker':
      return (
        <g>
          <ellipse cx={50} cy={90} rx={20} ry={3} fill={SHADE} />
          <path d="M32 36 L37 88 H63 L68 36 Z" fill={tint} />
          <path d="M32 36 L37 88 H43 L39 36 Z" fill={SHINE} />
          <rect x={29} y={25} width={42} height={13} rx={4} fill={DARK} />
          <rect x={43} y={15} width={14} height={11} rx={3} fill={DARK} />
          <line x1={56} y1={50} x2={64} y2={50} stroke={LIGHT} strokeWidth={2} opacity={0.7} />
          <line x1={57} y1={60} x2={63} y2={60} stroke={LIGHT} strokeWidth={2} opacity={0.7} />
          <line x1={57} y1={70} x2={63} y2={70} stroke={LIGHT} strokeWidth={2} opacity={0.7} />
        </g>
      );
    case 'bottle':
      return (
        <g>
          <ellipse cx={50} cy={90} rx={18} ry={3} fill={SHADE} />
          <rect x={43} y={12} width={14} height={9} rx={2} fill={DARK} />
          <path
            d="M44 21 H56 V28 Q66 32 66 42 V82 Q66 89 59 89 H41 Q34 89 34 82 V42 Q34 32 44 28 Z"
            fill={tint}
          />
          <path d="M41 34 Q37 38 37 44 V82 Q37 86 41 87 Z" fill={SHINE} />
          <rect x={34} y={50} width={32} height={20} fill={LIGHT} opacity={0.92} />
          <rect x={40} y={56} width={16} height={4} rx={2} fill={tint} />
        </g>
      );
    case 'gloves':
      return (
        <g>
          <ellipse cx={50} cy={91} rx={26} ry={3} fill={SHADE} />
          <rect x={31} y={18} width={8} height={30} rx={4} fill={tint} />
          <rect x={41} y={13} width={8} height={34} rx={4} fill={tint} />
          <rect x={51} y={14} width={8} height={33} rx={4} fill={tint} />
          <rect x={61} y={20} width={8} height={28} rx={4} fill={tint} />
          <rect x={31} y={18} width={38} height={9} fill={DARK} opacity={0.35} />
          <ellipse cx={26} cy={58} rx={6} ry={13} fill={tint} transform="rotate(-30 26 58)" />
          <rect x={30} y={38} width={40} height={42} rx={10} fill={tint} />
          <rect x={37} y={48} width={26} height={18} rx={6} fill={DARK} opacity={0.35} />
          <rect x={28} y={76} width={44} height={12} rx={4} fill={EMBER} />
        </g>
      );
    case 'belt':
      return (
        <g>
          <ellipse cx={50} cy={78} rx={40} ry={3.5} fill={SHADE} />
          <rect x={8} y={38} width={84} height={28} rx={6} fill={tint} />
          <rect x={8} y={38} width={84} height={6} rx={3} fill={SHINE} />
          <line x1={12} y1={60} x2={88} y2={60} stroke={LIGHT} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          <circle cx={22} cy={52} r={2.5} fill={DARK} />
          <circle cx={32} cy={52} r={2.5} fill={DARK} />
          <circle cx={42} cy={52} r={2.5} fill={DARK} />
          <rect x={60} y={32} width={18} height={40} rx={4} fill="none" stroke={LIGHT} strokeWidth={4} opacity={0.9} />
          <line x1={60} y1={52} x2={78} y2={52} stroke={LIGHT} strokeWidth={3} opacity={0.9} />
        </g>
      );
    case 'wraps':
      return (
        <g>
          <ellipse cx={50} cy={82} rx={38} ry={3.5} fill={SHADE} />
          <rect x={30} y={62} width={56} height={14} rx={4} fill={tint} opacity={0.8} />
          <rect x={78} y={62} width={8} height={14} rx={2} fill={DARK} />
          <circle cx={32} cy={56} r={22} fill={tint} />
          <circle cx={32} cy={56} r={15} fill="none" stroke={DARK} strokeWidth={1.5} opacity={0.5} />
          <circle cx={32} cy={56} r={8} fill={DARK} />
          <path d="M64 32 Q72 24 80 32" fill="none" stroke={LIGHT} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
        </g>
      );
    case 'band':
      return (
        <g>
          <ellipse cx={50} cy={84} rx={36} ry={3.5} fill={SHADE} />
          <ellipse cx={50} cy={50} rx={36} ry={28} fill="none" stroke={tint} strokeWidth={7} />
          <ellipse cx={50} cy={54} rx={26} ry={20} fill="none" stroke="#FF7A3B" strokeWidth={6} />
          <ellipse cx={50} cy={58} rx={16} ry={12} fill="none" stroke="#9085E9" strokeWidth={5} />
        </g>
      );
    case 'towel':
      return (
        <g>
          <ellipse cx={50} cy={84} rx={36} ry={3.5} fill={SHADE} />
          <rect x={16} y={30} width={68} height={50} rx={6} fill={tint} />
          <rect x={16} y={30} width={68} height={16} rx={6} fill={SHINE} />
          <line x1={16} y1={46} x2={84} y2={46} stroke={DARK} strokeWidth={1.5} opacity={0.35} />
          <rect x={16} y={64} width={68} height={4} fill={LIGHT} opacity={0.75} />
          <rect x={16} y={71} width={68} height={2} fill={LIGHT} opacity={0.55} />
          <rect x={70} y={22} width={8} height={12} rx={3} fill={DARK} />
        </g>
      );
    case 'tshirt':
    default:
      return (
        <g>
          <ellipse cx={50} cy={90} rx={26} ry={3} fill={SHADE} />
          <path
            d="M36 16 L20 23 L8 42 L22 50 L28 42 V88 H72 V42 L78 50 L92 42 L80 23 L64 16 Q58 25 50 25 Q42 25 36 16 Z"
            fill={tint}
          />
          <path d="M36 16 Q42 25 50 25 Q58 25 64 16" fill="none" stroke={DARK} strokeWidth={2.5} opacity={0.45} />
          <path d="M28 42 V88 H36 V42 Z" fill={SHINE} />
          <rect x={42} y={46} width={16} height={4} rx={2} fill={LIGHT} opacity={0.85} />
        </g>
      );
  }
}

export function ProductArt({ kind, tint, size }: { kind: ArtKind; tint: string; size: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 14,
        // A light tile so dark tints (black coffee, a charcoal T-shirt) still read.
        background: 'radial-gradient(circle at 50% 40%, #2A3042 0%, #171B27 75%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 100 100">
        <Drawing kind={kind} tint={tint} />
      </svg>
    </div>
  );
}
