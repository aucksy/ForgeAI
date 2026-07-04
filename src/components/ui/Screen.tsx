import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, gradients, motion, space, type } from '@/theme/tokens';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Node rendered on the right of the header row. */
  right?: ReactNode;
  /** Remove horizontal screen padding (edge-to-edge content). */
  noPad?: boolean;
  children?: ReactNode;
}

/** Page shell: backdrop gradient wash + ember glow, safe area, animated header. */
export function Screen({ title, subtitle, scroll = true, right, noPad, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const hasHeader = Boolean(title || subtitle || right);

  const header = hasHeader ? (
    <Animated.View
      entering={FadeInDown.duration(motion.slow)}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: space.xl,
        paddingHorizontal: noPad ? space.screenX : 0,
      }}
    >
      <View style={{ flex: 1, paddingRight: right ? space.md : 0 }}>
        {title ? (
          <Text
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
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
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
    </View>
  );
}
