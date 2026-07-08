import { Text, View } from 'react-native';

import { trimNum } from '@/lib/format';
import { color as palette, radius, type } from '@/theme/tokens';

export interface DeltaPillProps {
  value: number;
  /** Appended to the number (default '%'). */
  suffix?: string;
}

/** Signed change pill: +12% (good) / -8% (critical) / 0 (neutral). */
export function DeltaPill({ value, suffix = '%' }: DeltaPillProps) {
  const positive = value > 0;
  const negative = value < 0;
  const fg = positive ? palette.goodText : negative ? palette.criticalText : palette.inkMuted;
  const bg = positive
    ? 'rgba(61, 203, 108, 0.12)'
    : negative
      ? 'rgba(240, 113, 111, 0.12)'
      : palette.surfaceRaised;
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
