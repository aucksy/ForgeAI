/**
 * Tracker tab bar — a copy of the frozen `components/ui/TabBar` (same tokens,
 * animation and layout) with an extended icon map for the tracker's tabs and a
 * hidden-route filter. The frozen `TabBar` is untouched; this new file is swapped
 * into `(tabs)/_layout.tsx`. Keeps the app visually cohesive.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardFrame } from '@/components/KeyboardRoom';
import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { TEXT_SCALE_CAP } from '@/components/ui/a11y';
import type { TabBarProps } from '@/components/ui/TabBar';
import { motionMode, useReduceMotion } from '@/components/ui/useReduceMotion';
import { tap, thud } from '@/lib/haptics';
import { confirmAndRemoveDemo } from '@/onboarding/demoRemoval';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { useDashboard } from '@/store/dashboardStore';
import { color, motion, radius, shadow, space, type } from '@/theme/tokens';

import { showsMiniBar } from '../lib/miniBar';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { WorkoutMiniBar } from './WorkoutMiniBar';

const ROUTE_ICON: Record<string, IconName> = {
  index: 'home',
  workout: 'dumbbell',
  history: 'calendar',
  analytics: 'chart',
  settings: 'person',
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
  // Audit Phase 7: the pill and lift stay still when the phone asks for less motion.
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
      {/* Audit Phase 7 (SH-21): five labels share one row — grow less, and shrink to fit rather than split ("Progre/ss"). */}
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

/**
 * Phase 1 (DS-06): while the demo is loaded, every tab says so — a slim strip above the tabs,
 * "Demo data · Remove". Remove keeps the member's own workouts (onboarding/demoRemoval).
 */
function DemoStrip() {
  const demo = useOnboarding((s) => s.demo);
  const [busy, setBusy] = useState(false);
  if (!demo) return null;
  const onRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await confirmAndRemoveDemo();
    } catch {
      thud();
      setBusy(false);
      return;
    }
    setBusy(false);
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        minHeight: 36,
        paddingHorizontal: space.lg,
        backgroundColor: color.surfaceSunken,
        borderTopWidth: 1,
        borderTopColor: color.border,
      }}
    >
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.warning }}>
        Demo data
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>·</Text>
      <Pressable
        onPress={() => void onRemove()}
        accessibilityRole="button"
        accessibilityLabel="Remove demo data"
        hitSlop={8}
        style={{ minHeight: 36, justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accent }}>
          {busy ? 'Removing…' : 'Remove'}
        </Text>
      </Pressable>
    </View>
  );
}

export function TrackerTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  // Phase 3 review: every screen now shrinks above the keyboard (KeyboardRoom), so while
  // the member types, the tab bar and the workout bar step aside instead of riding up on it.
  const typing = useKeyboardFrame() != null;
  const homeReady = useDashboard((s) => s.data != null);
  const editing = useActiveWorkout((s) => s.editingSessionId != null || s.pastLog);
  if (typing) return null;
  return (
    <View>
    {/* Phase 1: a workout left open shows here until finished — on every tab but Workout,
        and (Phase 7) not on Home once Home's own card says "Workout in progress". */}
    {showsMiniBar({ tab: state.routes[state.index]?.name, homeReady, editing }) ? <WorkoutMiniBar /> : null}
    <DemoStrip />
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
    </View>
  );
}
