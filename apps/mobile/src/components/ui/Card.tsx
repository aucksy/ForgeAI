import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { color, motion, radius, shadow, space } from '@/theme/tokens';

import { useReduceMotion } from './useReduceMotion';

export interface CardProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** Default content surface: raised card with hairline border + soft shadow. Still when motion is reduced. */
export function Card({ style, children }: CardProps) {
  const reduced = useReduceMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base)}
      style={[
        {
          backgroundColor: color.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: color.border,
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
