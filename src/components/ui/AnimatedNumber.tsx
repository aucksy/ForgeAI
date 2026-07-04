import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fmtInt } from '@/lib/format';
import { color, motion, type } from '@/theme/tokens';

export interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
}

/** Count-up numeral: eases to `value` on mount and whenever it changes. */
export function AnimatedNumber({ value, format, style }: AnimatedNumberProps) {
  const fmtRef = useRef(format ?? fmtInt);
  fmtRef.current = format ?? fmtInt;

  const sv = useSharedValue(0);
  const [text, setText] = useState(() => fmtRef.current(0));

  const update = useCallback((n: number) => {
    setText(fmtRef.current(n));
  }, []);

  useEffect(() => {
    sv.value = withTiming(value, {
      duration: motion.slow * 2,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, sv]);

  useAnimatedReaction(
    () => sv.value,
    (v, prev) => {
      if (v !== prev) runOnJS(update)(v);
    },
    [update],
  );

  return (
    <Text
      style={[
        { fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink },
        style,
      ]}
    >
      {text}
    </Text>
  );
}
