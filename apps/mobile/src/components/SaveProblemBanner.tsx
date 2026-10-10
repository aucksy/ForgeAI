/**
 * One calm app-wide line when saving fails (audit DS-09 / LW-01): "Couldn't save — your
 * phone's storage may be full. Free some space; we'll keep trying." It needs no buttons:
 * the app retries by itself and the banner goes on the next successful save.
 *
 * Mount ONCE at the app root, after the navigator (it floats over every screen, under the
 * status bar):  <SaveProblemBanner />
 */
import { Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, shadow, space, type } from '@/theme/tokens';

import { useSaveProblem } from './saveProblemStore';

export function SaveProblemBanner() {
  const message = useSaveProblem((s) => s.message);
  const insets = useSafeAreaInsets();
  if (!message) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + space.sm, left: space.lg, right: space.lg, zIndex: 1000, elevation: 1000 }}
    >
      <Animated.View
        entering={FadeInUp.duration(200)}
        exiting={FadeOutUp.duration(160)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: 48,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.borderStrong,
          backgroundColor: color.surfaceRaised,
          ...shadow.card,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.warning }} />
        <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink, lineHeight: 19 }}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}
