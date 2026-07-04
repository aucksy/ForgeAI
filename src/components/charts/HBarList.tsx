import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { fmtCompact } from '@/lib/format';
import { chart, color as palette, motion, space, type } from '@/theme/tokens';

export interface HBarListProps {
  data: { label: string; value: number; color?: string }[];
  valueFormat?: (n: number) => string;
}

function Row({
  label,
  value,
  fill,
  pct,
  index,
  fmt,
}: {
  label: string;
  value: number;
  fill: string;
  pct: number;
  index: number;
  fmt: (n: number) => string;
}) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(
      index * 55,
      withTiming(pct, { duration: motion.slow, easing: Easing.out(Easing.cubic) }),
    );
  }, [pct, index, w]);
  const aStyle = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.sub,
            color: palette.inkSecondary,
            flex: 1,
            paddingRight: space.sm,
          }}
        >
          {label}
        </Text>
        <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: palette.ink }}>
          {fmt(value)}
        </Text>
      </View>
      <View
        style={{
          height: 8,
          backgroundColor: palette.surfaceSunken,
          borderTopRightRadius: 4,
          borderBottomRightRadius: 4,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              height: 8,
              backgroundColor: fill,
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
            },
            aStyle,
          ]}
        />
      </View>
    </View>
  );
}

/**
 * Horizontal bar list (label left, value right). Identity lives in the labels,
 * so all bars share ONE hue unless a per-item color is given.
 */
export function HBarList({ data, valueFormat }: HBarListProps) {
  const fmt = valueFormat ?? fmtCompact;
  let max = 0;
  for (const d of data) if (d.value > max) max = d.value;
  const safeMax = max || 1;

  return (
    <View style={{ gap: space.md }}>
      {data.map((d, i) => (
        <Row
          key={`${d.label}${i}`}
          label={d.label}
          value={d.value}
          fill={d.color ?? chart.series[0]}
          pct={Math.max(0, Math.min(1, d.value / safeMax))}
          index={i}
          fmt={fmt}
        />
      ))}
    </View>
  );
}
