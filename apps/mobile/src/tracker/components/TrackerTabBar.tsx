/**
 * Tracker tab bar — a copy of the frozen `components/ui/TabBar` (same tokens,
 * animation and layout) with an extended icon map for the tracker's tabs and a
 * hidden-route filter. The frozen `TabBar` is untouched; this new file is swapped
 * into `(tabs)/_layout.tsx`. Keeps the app visually cohesive.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardFrame } from '@/components/KeyboardRoom';
import { Icon, askConfirm } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { TEXT_SCALE_CAP } from '@/components/ui/a11y';
import type { TabBarProps } from '@/components/ui/TabBar';
import { motionMode, useReduceMotion } from '@/components/ui/useReduceMotion';
import { tap, thud } from '@/lib/haptics';
import { confirmAndRemoveDemo } from '@/onboarding/demoRemoval';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { color, motion, radius, shadow, space, type } from '@/theme/tokens';
import { HIDDEN_TAB_ROUTES, isShownTab, tabTitle } from '@/lib/appTabs';
import { useGymShop } from '@/shop/gymStore';
import { unreadCount } from '@/shop/inbox';
import { inboxFor, useGymInbox } from '@/shop/inboxStore';

import { showsMiniBar } from '../lib/miniBar';
import { PILL_H, edgeSprings, pillEdges, pillWidth } from '../lib/tabPill';
import { Glyph, type GlyphName } from './TrackerGlyph';
import { WorkoutMiniBar } from './WorkoutMiniBar';

/**
 * Release A (docs/ux/MEMBER-APP-MAP.md §3.1): 4 tabs, always the same 4 — Workout, Progress, Gym,
 * Profile (lib/appTabs.ts). The Gym tab (route `shop`) shows with or without a gym and is always
 * "Gym" (before, R-77, it was missing without a gym and became "Shop" with products).
 */
type TabIcon = { icon: IconName } | { glyph: GlyphName };
const ROUTE_ICON: Record<string, TabIcon> = {
  workout: { icon: 'dumbbell' },
  progress: { icon: 'trend' },
  shop: { glyph: 'gym' },
  profile: { icon: 'person' },
};

/** The tab row's top padding: the sliding highlight sits at the top of each tab, this far down. */
const TAB_ROW_TOP = 10;

/** Routes present in the navigator but never shown as a tab (still navigable). */
const HIDDEN = new Set(HIDDEN_TAB_ROUTES);

function TabItem({
  label,
  icon,
  focused,
  onPress,
  onLayout,
  badge = 0,
}: {
  label: string;
  icon: TabIcon;
  focused: boolean;
  onPress: () => void;
  /** R-78: where this tab sits in the bar, for the one sliding highlight (SlidingPill). */
  onLayout: (e: LayoutChangeEvent) => void;
  /** Gym messages: the Gym tab's unread count (0 = no badge). */
  badge?: number;
}) {
  // Audit Phase 7: the lift stays still when the phone asks for less motion.
  const rm = motionMode(useReduceMotion());
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(focused ? -1 : 0, { ...motion.spring, reduceMotion: rm }) }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} new ${badge === 1 ? 'message' : 'messages'}` : label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLayout={onLayout}
      style={{ flex: 1, alignItems: 'center', gap: 3, minHeight: 48 }}
    >
      <View style={{ width: 54, height: PILL_H, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={lift}>
          {'glyph' in icon ? (
            <Glyph name={icon.glyph} size={21} color={focused ? color.accent : color.inkMuted} />
          ) : (
            <Icon name={icon.icon} size={21} color={focused ? color.accent : color.inkMuted} />
          )}
        </Animated.View>
        {badge > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -3,
              right: 4,
              minWidth: 18,
              paddingHorizontal: 4,
              borderRadius: radius.pill,
              backgroundColor: color.accent,
              alignItems: 'center',
            }}
          >
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: type.bodyBold, fontSize: 11, color: color.onAccent }}>
              {badge > 9 ? '9+' : String(badge)}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Audit Phase 7 (SH-21): labels share one row — grow less, and shrink to fit rather than split. */}
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
 * R-78 (owner, 22 Oct 2026): one highlight for the whole bar that slides to the tapped tab, its
 * front edge quick and its back edge following (lib/tabPill.ts), so it stretches as it travels and
 * settles to its size. On the UI thread (Reanimated). With "Remove animations" it simply moves.
 * The bar itself moving (a font change) moves it with no stretch.
 */
function SlidingPill({ tabKey, center, top }: { tabKey: string | null; center: number | null; top: number }) {
  const reduced = useReduceMotion();
  const left = useSharedValue(0);
  const right = useSharedValue(0);
  const shown = useSharedValue(0);
  const lastKey = useRef<string | null>(null);
  const placed = useRef(false);
  useEffect(() => {
    if (center == null) {
      shown.value = reduced ? 0 : withTiming(0, { duration: motion.fast });
      return;
    }
    const to = pillEdges(center);
    const switched = placed.current && lastKey.current !== tabKey;
    if (!placed.current || reduced) {
      left.value = to.left;
      right.value = to.right;
    } else if (switched) {
      const springs = edgeSprings(left.value, to.left);
      left.value = withSpring(to.left, springs.left);
      right.value = withSpring(to.right, springs.right);
    } else {
      // The same tab, moved by the bar itself (a tab came or went): glide, no stretch.
      left.value = withTiming(to.left, { duration: motion.fast });
      right.value = withTiming(to.right, { duration: motion.fast });
    }
    placed.current = true;
    lastKey.current = tabKey;
    shown.value = reduced ? 1 : withTiming(1, { duration: motion.fast });
  }, [tabKey, center, reduced, left, right, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    width: pillWidth(left.value, right.value),
    transform: [{ translateX: left.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top, left: 0, height: PILL_H, borderRadius: radius.pill, backgroundColor: color.accentSoft, ...shadow.glow },
        style,
      ]}
    />
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
    } catch (e) {
      // Audit H1: never a silent failure — the member is told, and can tap Remove again.
      console.warn('[ForgeErr] remove demo failed', e);
      thud();
      setBusy(false);
      void askConfirm({
        title: 'Could not remove the demo',
        body: 'Nothing was changed. Please try again.',
        confirmLabel: 'OK',
        notice: true,
      });
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
  // Gym messages: unread messages from the member's gym badge the Gym tab.
  const memberId = useGymShop((s) => s.link?.memberId ?? null);
  const unread = useGymInbox((s) => unreadCount(inboxFor(s, memberId)));
  // R-78: each tab's place in the bar (its left edge and width), for the sliding highlight.
  const [places, setPlaces] = useState<Record<string, { x: number; w: number }>>({});
  const place = (key: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setPlaces((p) => (p[key]?.x === x && p[key]?.w === width ? p : { ...p, [key]: { x, w: width } }));
  };
  const focusedRoute = state.routes[state.index];
  const tabShown = (name: string) => !HIDDEN.has(name) && isShownTab(name);
  const focusedPlace = focusedRoute && tabShown(focusedRoute.name) ? places[focusedRoute.key] : undefined;
  if (typing) return null;
  return (
    <View>
    {/* Phase 1: a workout left open shows here until finished — on every tab but Workout,
        whose Up next card says "Workout in progress" (redesign R1). */}
    {showsMiniBar({ tab: state.routes[state.index]?.name }) ? <WorkoutMiniBar /> : null}
    <DemoStrip />
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: color.glass,
        borderTopWidth: 1,
        borderTopColor: color.border,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingTop: TAB_ROW_TOP,
      }}
    >
      <SlidingPill tabKey={focusedRoute?.key ?? null} center={focusedPlace ? focusedPlace.x + focusedPlace.w / 2 : null} top={TAB_ROW_TOP} />
      {state.routes.map((route, index) => {
        if (!tabShown(route.name)) return null;
        const { options } = descriptors[route.key];
        const label = tabTitle(route.name) ?? options.title ?? route.name;
        const focused = state.index === index;
        return (
          <TabItem
            key={route.key}
            label={label}
            icon={ROUTE_ICON[route.name] ?? { icon: 'sparkle' }}
            focused={focused}
            badge={route.name === 'shop' ? unread : 0}
            onLayout={place(route.key)}
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
