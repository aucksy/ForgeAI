import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { color, gradients, motion, radius, shadow, space } from '@/theme/tokens';

import { useReduceMotion } from './useReduceMotion';

export interface HeroCardProps {
  /** Gradient pair; defaults to the cool steel sheen. Pass gradients.ember for the flagship card. */
  gradient?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /**
   * Read the whole card as ONE line, numbers and units together ("This month, 12 workouts,
   * 3 more than September"). Leave out when the card holds its own buttons.
   */
  accessibilityLabel?: string;
}

/** Gradient hero surface for the headline card of a screen. */
export function HeroCard({ gradient, style, children, accessibilityLabel }: HeroCardProps) {
  const reduced = useReduceMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.slow)}
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[{ borderRadius: radius.xl, ...shadow.card }, style]}
    >
      <LinearGradient
        colors={gradient ?? gradients.steel}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.borderStrong,
          padding: space.xl,
          overflow: 'hidden',
        }}
      >
        {children}
      </LinearGradient>
    </Animated.View>
  );
}
