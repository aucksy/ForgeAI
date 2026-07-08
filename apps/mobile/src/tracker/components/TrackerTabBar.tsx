/**
 * Tracker tab bar — a copy of the frozen `components/ui/TabBar` (same tokens,
 * animation and layout) with an extended icon map for the tracker's tabs and a
 * hidden-route filter. The frozen `TabBar` is untouched; this new file is swapped
 * into `(tabs)/_layout.tsx`. Keeps the app visually cohesive.
 */
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { TabBarProps } from '@/components/ui/TabBar';
import { tap } from '@/lib/haptics';
import { color, motion, radius, shadow, type } from '@/theme/tokens';

const ROUTE_ICON: Record<string, IconName> = {
  index: 'home',
  workout: 'dumbbell',
  history: 'calendar',
  analytics: 'chart',
  settings: 'settings',
};

/** Routes present in the navigator but never shown as a tab (still navigable). */
const HIDDEN = new Set(['coach']);

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
  const pill = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: motion.fast }),
    transform: [{ scale: withSpring(focused ? 1 : 0.55, motion.spring) }],
  }));
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(focused ? -1 : 0, motion.spring) }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', gap: 3 }}
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
      <Text
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

export function TrackerTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
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
        if (HIDDEN.has(route.name)) return null;
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
