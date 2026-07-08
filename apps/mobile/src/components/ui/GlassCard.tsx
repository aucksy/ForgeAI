import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { color, motion, radius, shadow, space } from '@/theme/tokens';

export interface GlassCardProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** Glassmorphism surface — translucent plane + brighter hairline edge. */
export function GlassCard({ style, children }: GlassCardProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.base)}
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
