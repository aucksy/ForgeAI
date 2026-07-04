import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { tap } from '@/lib/haptics';
import { motion } from '@/theme/tokens';

interface PressScaleProps {
  children: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  /** Fire a light haptic on press (default true). */
  haptic?: boolean;
  scaleTo?: number;
  /** Style of the animated inner container (the visible surface). */
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityLabel?: string;
}

/**
 * Internal touchable used across the kit: spring scale-down to 0.97 on press,
 * light haptic on release. Not part of the public contract.
 */
export function PressScale({
  children,
  onPress,
  disabled,
  haptic = true,
  scaleTo = 0.97,
  style,
  hitSlop,
  accessibilityLabel,
}: PressScaleProps) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        if (!disabled) scale.value = withSpring(scaleTo, motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      onPress={(e) => {
        if (haptic) tap();
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, aStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
