import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fmtInt } from '@/lib/format';
import { color, motion, type } from '@/theme/tokens';

import { motionMode, useReduceMotion } from './useReduceMotion';

export interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
  /**
   * What a screen reader says (default: the final number, formatted). Pass the number WITH
   * its unit when the unit is not read next to it ("82 kg").
   */
  accessibilityLabel?: string;
}

/**
 * Count-up numeral: eases to `value` on mount and whenever it changes.
 * Phase 7: a screen reader always hears the final number, never one mid-count; with "reduce
 * motion" on, the number simply appears.
 */
export function AnimatedNumber({ value, format, style, accessibilityLabel }: AnimatedNumberProps) {
  const fmtRef = useRef(format ?? fmtInt);
  fmtRef.current = format ?? fmtInt;
  const reduced = useReduceMotion();

  const sv = useSharedValue(reduced ? value : 0);
  const [text, setText] = useState(() => fmtRef.current(reduced ? value : 0));

  const update = useCallback((n: number) => {
    setText(fmtRef.current(n));
  }, []);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(sv);
      sv.value = value;
      setText(fmtRef.current(value));
      return;
    }
    sv.value = withTiming(value, {
      duration: motion.slow * 2,
      easing: Easing.out(Easing.cubic),
      reduceMotion: motionMode(false),
    });
  }, [value, sv, reduced]);

  useAnimatedReaction(
    () => sv.value,
    (v, prev) => {
      if (v !== prev) runOnJS(update)(v);
    },
    [update],
  );

  return (
    <Text
      accessibilityLabel={accessibilityLabel ?? fmtRef.current(value)}
      style={[
        { fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink },
        style,
      ]}
    >
      {text}
    </Text>
  );
}
