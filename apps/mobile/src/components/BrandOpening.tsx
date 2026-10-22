/**
 * Gym branding: the gym's logo, full-screen, for about a second — after joining a branded gym and
 * on every launch while a member of one (theme/gymTheme.ts decides when). It lies over the app
 * (which is already drawn in the gym's colours underneath), eases in — a fade with a slight
 * scale-up — holds, and fades away. With the phone's "Remove animations" on it simply shows and
 * goes. A tap skips it. Without a logo (or when it cannot load offline) the gym's name stands in.
 *
 * D13: the logo is fetched ahead (theme/logoPrefetch.ts, after a join and each check with the
 * gym), and until it has actually loaded the gym's name shows LARGE — a slow logo never leaves
 * the opening empty. The logo loads unseen meanwhile, then takes its place with the name small
 * beneath it.
 *
 * Draws only from its `opening` prop (taken when the look was applied), never from the tokens:
 * it sits outside the re-drawn tree and must not keep a stale colour.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { pictureUrl } from '@/cloud/picture';
import { useReduceMotion } from '@/components/ui/useReduceMotion';
import type { Opening } from '@/theme/gymTheme';
import { type } from '@/theme/tokens';

/** How long the opening stays, in, held and out (ms). */
export const OPENING_MS = { in: 320, hold: 700, out: 260 } as const;
/** R-77: right after joining, the gym's welcome stays this long (the app starting again in its look). */
export const WELCOME_HOLD_MS = 1800;

export function BrandOpening({ opening, onDone }: { opening: Opening; onDone: () => void }) {
  const reduced = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const fade = useSharedValue(reduced ? 1 : 0);
  const grow = useSharedValue(reduced ? 1 : 0.92);
  const out = useSharedValue(1);

  useEffect(() => {
    const ease = Easing.out(Easing.exp);
    const hold = opening.welcome ? WELCOME_HOLD_MS : OPENING_MS.hold;
    if (!reduced) {
      fade.value = withTiming(1, { duration: OPENING_MS.in, easing: ease });
      grow.value = withTiming(1, { duration: OPENING_MS.in + 200, easing: ease });
      out.value = withDelay(OPENING_MS.in + hold, withTiming(0, { duration: OPENING_MS.out, easing: Easing.in(Easing.quad) }));
    }
    const total = reduced ? OPENING_MS.in + hold : OPENING_MS.in + hold + OPENING_MS.out;
    const t = setTimeout(onDone, total);
    return () => clearTimeout(t);
    // One run per opening (the parent keys this component by the opening's id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const veil = useAnimatedStyle(() => ({ opacity: out.value }));
  const mark = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: grow.value }] }));

  const size = Math.round(Math.min(width * 0.56, height * 0.32, 260));
  const wantLogo = opening.logoUrl != null && !logoFailed;
  // The logo takes the stage only once it is on screen; until then the name stands large.
  const showLogo = wantLogo && logoLoaded;
  const italic = opening.heading === 'bold-italic';

  return (
    <Animated.View
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: opening.bg, zIndex: 1000, elevation: 1000 }, veil]}
    >
      <Pressable
        onPress={onDone}
        testID="brand-opening"
        accessibilityRole="image"
        accessibilityLabel={opening.welcome ? `Welcome to ${opening.gymName}` : opening.gymName}
        accessibilityHint="Tap to skip"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
      >
        <Animated.View style={[{ alignItems: 'center', gap: 20 }, mark]}>
          {wantLogo ? (
            <Image
              source={{ uri: pictureUrl(opening.logoUrl) ?? undefined }}
              // Loading: full size but unseen and out of the layout (the name is centred alone).
              style={showLogo ? { width: size, height: size } : { position: 'absolute', width: size, height: size, opacity: 0 }}
              contentFit="contain"
              cachePolicy="memory-disk"
              priority="high"
              accessible={false}
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoFailed(true)}
            />
          ) : null}
          <View style={{ maxWidth: Math.max(size, width * 0.8) }}>
            {opening.welcome ? (
              <Text style={{ fontFamily: type.bodySemi, fontSize: 14, letterSpacing: 1.6, color: opening.ink, opacity: 0.6, textAlign: 'center', textTransform: 'uppercase', marginBottom: 6 }}>
                Welcome to
              </Text>
            ) : null}
            <Text
              numberOfLines={2}
              style={{
                fontFamily: type.display,
                fontSize: showLogo ? 15 : 28,
                letterSpacing: showLogo ? 1.2 : 0.2,
                color: opening.ink,
                textAlign: 'center',
                opacity: showLogo ? 0.72 : 1,
                ...(italic ? { fontStyle: 'italic' as const } : null),
              }}
            >
              {opening.gymName}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
