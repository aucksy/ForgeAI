import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { color, motion, radius, shadow, space } from '@/theme/tokens';

import { useReduceMotion } from './useReduceMotion';

export interface GlassCardProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** Glassmorphism surface — translucent plane + brighter hairline edge. */
export function GlassCard({ style, children }: GlassCardProps) {
  const reduced = useReduceMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base)}
      style={[
        {
          backgroundColor: color.glass,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: color.borderStrong,
          padding: space.lg,
          ...shadow.card,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
