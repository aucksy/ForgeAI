import { Text, View } from 'react-native';

import { trimNum } from '@/lib/format';
import { color as palette, radius, type } from '@/theme/tokens';

export interface DeltaPillProps {
  value: number;
  /** Appended to the number (default '%'). */
  suffix?: string;
  /**
   * Whether this change is good news. Default: up is good, down is bad. A body-weight change
   * passes its own (PG-10: down is good when losing fat; neutral without a goal).
   */
  tone?: 'good' | 'bad' | 'neutral';
}

/** Signed change pill: +12% (good) / -8% (critical) / 0 (neutral). */
export function DeltaPill({ value, suffix = '%', tone }: DeltaPillProps) {
  const positive = value > 0;
  const negative = value < 0;
  const t = tone ?? (positive ? 'good' : negative ? 'bad' : 'neutral');
  const fg = t === 'good' ? palette.goodText : t === 'bad' ? palette.criticalText : palette.inkMuted;
  const bg = t === 'good' ? 'rgba(61, 203, 108, 0.12)' : t === 'bad' ? 'rgba(240, 113, 111, 0.12)' : palette.surfaceRaised;
  const text = `${positive ? '+' : ''}${trimNum(value)}${suffix}`;

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontFamily: type.monoBold, fontSize: type.size.caption, color: fg }}>
        {text}
      </Text>
    </View>
  );
}
