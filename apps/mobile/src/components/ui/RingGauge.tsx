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

import { ringLabel, TEXT_SCALE_CAP } from './a11y';
import { motionMode, useReduceMotion } from './useReduceMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RingGaugeProps {
  value: number;
  max: number;
  size?: number;
  label?: string;
  sublabel?: string;
  color?: string;
  trackColor?: string;
  /** Leads the spoken line: "Calories" → "Calories, 1,420 of 2,200". */
  title?: string;
  /** Overrides the whole spoken line. */
  accessibilityLabel?: string;
}

/**
 * Animated SVG progress ring with centered label.
 * Phase 7: read as one line with its numbers ("Calories, 1,420 of 2,200"); the numbers inside
 * shrink to fit the ring instead of being cut ("1,4…") at large text; still when motion is reduced.
 */
export function RingGauge({
  value,
  max,
  size = 120,
  label,
  sublabel,
  color,
  trackColor,
  title,
  accessibilityLabel,
}: RingGaugeProps) {
  const reduced = useReduceMotion();
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
      reduceMotion: motionMode(reduced),
    });
  }, [pct, progress, reduced]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? ringLabel({ title, label, sublabel, value, max })}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
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
          maxWidth: size,
        }}
      >
        {label ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            maxFontSizeMultiplier={TEXT_SCALE_CAP.inShape}
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
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            maxFontSizeMultiplier={TEXT_SCALE_CAP.inShape}
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
