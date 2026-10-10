import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, gradients, motion, space, type } from '@/theme/tokens';

import { IconButton } from './IconButton';
import { useReduceMotion } from './useReduceMotion';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Node rendered on the right of the header row. */
  right?: ReactNode;
  /**
   * Audit Phase 7 (one way to leave a page): a pushed page passes its "leave" here and gets the
   * one back arrow, top-left beside the title, spoken "Go back". × is only for sheets and create
   * forms (they pass their own × as `right`).
   */
  onBack?: () => void;
  /** Remove horizontal screen padding (edge-to-edge content). */
  noPad?: boolean;
  children?: ReactNode;
}

/**
 * Page shell: backdrop gradient wash + ember glow, safe area, animated header, and a solid
 * strip behind the status bar so nothing scrolls under the clock.
 */
export function Screen({ title, subtitle, scroll = true, right, onBack, noPad, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const hasHeader = Boolean(title || subtitle || right || onBack);

  const header = hasHeader ? (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.slow)}
      style={{
        flexDirection: 'row',
        // With a back arrow the row lines up on the title's first line (as the exercise page).
        alignItems: onBack ? 'flex-start' : 'flex-end',
        justifyContent: 'space-between',
        gap: onBack ? space.md : 0,
        marginBottom: space.xl,
        paddingHorizontal: noPad ? space.screenX : 0,
      }}
    >
      {onBack ? <IconButton icon="chevron-left" onPress={onBack} accessibilityLabel="Go back" /> : null}
      <View style={{ flex: 1, paddingRight: right ? space.md : 0, paddingTop: onBack ? 4 : 0 }}>
        {title ? (
          // Phase 7: the page title is the first heading a screen reader can jump to.
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: type.display,
              fontSize: type.size.h1,
              color: color.ink,
              letterSpacing: -0.5,
            }}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.sub,
              color: color.inkSecondary,
              marginTop: 3,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Animated.View>
  ) : null;

  const padTop = insets.top + space.lg;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Backdrop />
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: padTop,
            paddingHorizontal: noPad ? 0 : space.screenX,
            paddingBottom: space.xxl,
          }}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View
          style={{
            flex: 1,
            paddingTop: padTop,
            paddingHorizontal: noPad ? 0 : space.screenX,
          }}
        >
          {header}
          {children}
        </View>
      )}
      {/*
        SH-28 / PG-29: the status bar is see-through, so scrolled text used to slide under the
        clock. This strip covers the top inset with an exact copy of the backdrop behind it —
        invisible at rest, solid once content scrolls beneath it.
      */}
      {insets.top > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, overflow: 'hidden', backgroundColor: color.bg }}
        >
          <Backdrop />
        </View>
      ) : null}
    </View>
  );
}

/** The page wash + ember glow, pinned to the top of the screen. */
function Backdrop() {
  return (
    <>
      <LinearGradient
        colors={gradients.backdrop}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 340 }}
      />
      <LinearGradient
        colors={gradients.emberSubtle}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          position: 'absolute',
          top: -70,
          right: -70,
          width: 220,
          height: 220,
          borderRadius: 110,
          opacity: 0.55,
        }}
      />
    </>
  );
}
