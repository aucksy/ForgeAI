import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import type {
  AccessibilityRole,
  AccessibilityState,
  GestureResponderEvent,
  Insets,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { tap } from '@/lib/haptics';
import { motion } from '@/theme/tokens';

import { useReduceMotion } from './useReduceMotion';

interface PressScaleProps {
  children: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  /** Fire a light haptic on press (default true). */
  haptic?: boolean;
  scaleTo?: number;
  /** Style of the animated inner container (the visible surface). */
  style?: StyleProp<ViewStyle>;
  /** Extra touch area around the visible surface (a number = every side). */
  hitSlop?: number | Insets;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Default "button" when there is an onPress. */
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
}

/**
 * Internal touchable used across the kit: spring scale-down to 0.97 on press,
 * light haptic on release. Not part of the public contract.
 * Phase 7: stays still when the phone asks for less motion; says "dimmed" when disabled.
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
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
}: PressScaleProps) {
  const reduced = useReduceMotion();
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={disabled ? { ...accessibilityState, disabled: true } : accessibilityState}
      onPressIn={() => {
        if (!disabled && !reduced) scale.value = withSpring(scaleTo, motion.spring);
      }}
      onPressOut={() => {
        scale.value = reduced ? 1 : withSpring(1, motion.spring);
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
