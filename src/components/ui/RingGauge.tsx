import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { clamp } from '@/lib/format';
import { color as palette, motion, type } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RingGaugeProps {
  value: number;
  max: number;
  size?: number;
  label?: string;
  sublabel?: string;
  color?: string;
  trackColor?: string;
}

/** Animated SVG progress ring with centered label. */
export function RingGauge({
  value,
  max,
  size = 120,
  label,
  sublabel,
  color,
  trackColor,
}: RingGaugeProps) {
  const stroke = Math.max(7, Math.round(size * 0.075));
  const r = (size - stroke) / 2 - 1;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(pct, {
      duration: motion.slow * 1.6,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={trackColor ?? 'rgba(255, 255, 255, 0.07)'}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={c}
          cy={c}
          r={r}
          stroke={color ?? palette.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          fill="none"
          transform={`rotate(-90 ${c} ${c})`}
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: stroke + 4,
        }}
      >
        {label ? (
          <Text
            numberOfLines={1}
            style={{
              fontFamily: type.monoBold,
              fontSize: Math.max(14, Math.round(size * 0.17)),
              color: palette.ink,
            }}
          >
            {label}
          </Text>
        ) : null}
        {sublabel ? (
          <Text
            numberOfLines={1}
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.caption,
              color: palette.inkMuted,
              marginTop: 1,
            }}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
