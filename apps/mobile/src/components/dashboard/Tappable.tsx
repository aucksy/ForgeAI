import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

interface TappableProps {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
}

/**
 * Dashboard-local press wrapper: spring scale to 0.98 while pressed.
 * (The ui-kit's PressScale is internal to that module, so we keep our own.)
 * Haptics are the caller's responsibility — fire them inside `onPress`.
 */
export function Tappable({ children, onPress, accessibilityLabel }: TappableProps) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        scale.value = withSpring(0.98, motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      onPress={onPress}
    >
      <Animated.View style={aStyle}>{children}</Animated.View>
    </Pressable>
  );
}
