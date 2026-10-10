import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tap } from '@/lib/haptics';
import { color, motion, radius, shadow, type } from '@/theme/tokens';

import { TEXT_SCALE_CAP } from './a11y';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { motionMode, useReduceMotion } from './useReduceMotion';

/**
 * Structural subset of @react-navigation/bottom-tabs' BottomTabBarProps —
 * that package isn't hoisted to the project root, so we type what we use.
 */
export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
}

const ROUTE_ICON: Record<string, IconName> = {
  index: 'home',
  coach: 'chat',
  analytics: 'chart',
  settings: 'settings',
};

function TabItem({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  onPress: () => void;
}) {
  const rm = motionMode(useReduceMotion());
  const pill = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: motion.fast, reduceMotion: rm }),
    transform: [{ scale: withSpring(focused ? 1 : 0.55, { ...motion.spring, reduceMotion: rm }) }],
  }));
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(focused ? -1 : 0, { ...motion.spring, reduceMotion: rm }) }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', gap: 3, minHeight: 48 }}
    >
      <View style={{ width: 54, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 4,
              right: 4,
              borderRadius: radius.pill,
              backgroundColor: color.accentSoft,
              ...shadow.glow,
            },
            pill,
          ]}
        />
        <Animated.View style={lift}>
          <Icon name={icon} size={21} color={focused ? color.accent : color.inkMuted} />
        </Animated.View>
      </View>
      {/* Phase 7 (SH-21): four labels share one row — grow less, and shrink to fit rather than split ("Progre/ss"). */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        maxFontSizeMultiplier={TEXT_SCALE_CAP.tabLabel}
        style={{
          color: focused ? color.accent : color.inkMuted,
          fontFamily: focused ? type.bodySemi : type.bodyMedium,
          fontSize: type.size.caption,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Glass bottom tab bar: per-route icons, ember active pill glow, spring transitions. */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: color.glass,
        borderTopWidth: 1,
        borderTopColor: color.border,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingTop: 10,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const focused = state.index === index;
        return (
          <TabItem
            key={route.key}
            label={label}
            icon={ROUTE_ICON[route.name] ?? 'sparkle'}
            focused={focused}
            onPress={() => {
              tap();
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          />
        );
      })}
    </View>
  );
}
