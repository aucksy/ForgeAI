import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { color, motion, space, type } from '@/theme/tokens';

import { useReduceMotion } from './useReduceMotion';

import { Icon } from './Icon';
import type { IconName } from './Icon';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
}

export function EmptyState({ icon, title, body }: EmptyStateProps) {
  const reduced = useReduceMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.slow)}
      style={{ alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: color.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.lg,
        }}
      >
        <Icon name={icon} size={26} color={color.accent} />
      </View>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: type.heading,
          fontSize: type.size.h3,
          color: color.ink,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.sub,
            color: color.inkMuted,
            textAlign: 'center',
            marginTop: space.sm,
            maxWidth: 260,
            lineHeight: 19,
          }}
        >
          {body}
        </Text>
      ) : null}
    </Animated.View>
  );
}
