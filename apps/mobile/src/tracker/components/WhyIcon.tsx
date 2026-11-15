/**
 * R-576 (owner, 15 Nov 2026: "if there's an unusual calculation, there is a reason behind it, and we take them
 * to the reason"): the exercise card's "i".
 *   plain    a normal day: grey, as before (accent while its panel is open);
 *   standout a reason the member has not opened yet: the accent colour on a soft accent disc, with a short,
 *            gentle pulse (three beats, then still; never with the phone's "Remove animations" on);
 *   seen     the reason was opened: the accent colour on its disc, still.
 * Which state: kgTarget `whyIcon` (tested). The card's whole target box is the button that opens the reason.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useReduceMotion } from '@/components/ui/useReduceMotion';
import { color, radius } from '@/theme/tokens';

import { Glyph } from './TrackerGlyph';

/** How many gentle beats the "i" gives before it keeps still. */
const BEATS = 3;

export function WhyIcon({ state, open, testID }: { state: 'plain' | 'standout' | 'seen'; open: boolean; testID?: string }) {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = state === 'standout' && !reduceMotion;
  useEffect(() => {
    if (!pulse) {
      scale.setValue(1);
      return;
    }
    const beat = Animated.sequence([
      Animated.timing(scale, { toValue: 1.3, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(260),
    ]);
    const run = Animated.sequence([Animated.delay(400), Animated.loop(beat, { iterations: BEATS })]);
    run.start();
    return () => run.stop();
  }, [pulse, scale]);
  if (state === 'plain') return <Glyph name="info" size={16} color={open ? color.accent : color.inkMuted} />;
  return (
    <Animated.View testID={testID} style={{ transform: [{ scale }] }}>
      <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accentSoft, borderWidth: 1, borderColor: color.accent }}>
        <Glyph name="info" size={16} color={color.accent} />
      </View>
    </Animated.View>
  );
}
