/**
 * A short confetti burst for a new record (15 Oct 2026, owner: "for the PR achievement
 * notification, I want some confetti on the screen"). ~28 small pieces fall from the top over
 * about 1.8 s, spinning, then fade; they never take a touch (pointerEvents none) and are skipped
 * when the phone asks for less motion. Pure reanimated: no new native code.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/components/ui/useReduceMotion';
import { color } from '@/theme/tokens';

const PIECES = 28;
export const CONFETTI_MS = 1800;

/** A small, repeatable spread (no Math.random in render: the same burst draws the same way). */
function spread(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function Confetti({ burst }: { burst: number }) {
  const reduced = useReduceMotion();
  const { width, height } = useWindowDimensions();
  // Read when drawn: gym branding repaints the tokens.
  const palette = [color.accent, color.accentBright, color.goodText, color.warning, color.ink];
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: spread(burst, i) * width,
        drift: (spread(burst, i + 100) - 0.5) * 120,
        fall: height * (0.45 + spread(burst, i + 200) * 0.35),
        delay: Math.round(spread(burst, i + 300) * 250),
        spin: (spread(burst, i + 400) - 0.5) * 720,
        w: 6 + Math.round(spread(burst, i + 500) * 5),
        h: 10 + Math.round(spread(burst, i + 600) * 6),
        tint: palette[i % palette.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst, width, height],
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Piece key={`${burst}-${i}`} {...p} />
      ))}
    </View>
  );
}

function Piece({ x, drift, fall, delay, spin, w, h, tint }: { x: number; drift: number; fall: number; delay: number; spin: number; w: number; h: number; tint: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: CONFETTI_MS - delay, easing: Easing.out(Easing.quad) }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.75 ? 1 : 1 - (t.value - 0.75) / 0.25,
    transform: [{ translateX: x + drift * t.value }, { translateY: -20 + fall * t.value }, { rotate: `${spin * t.value}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: 2, backgroundColor: tint }, style]} />;
}
