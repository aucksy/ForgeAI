/**
 * F198 "follow the dots" (R-389/R-390): one small dot (8 dp) in the accent colour (the gym's own colour when
 * the app wears the gym's look: gym branding repaints the tokens, read here when drawn). Never a number.
 * Screen readers hear "New". Found by QA flows by its test id (lib/newDots.ts dotTestId).
 */
import { View, type ViewStyle } from 'react-native';

import { dotTestId, type DotSpot } from '@/lib/newDots';
import { color } from '@/theme/tokens';

export const NEW_DOT_SIZE = 8;
/** What screen readers say for a dot (member-words: one plain word). */
export const NEW_DOT_SPOKEN = 'New';

export function NewDot({ spot, style }: { spot: DotSpot; style?: ViewStyle }) {
  return (
    <View
      testID={dotTestId(spot)}
      accessible
      accessibilityLabel={NEW_DOT_SPOKEN}
      pointerEvents="none"
      style={[{ width: NEW_DOT_SIZE, height: NEW_DOT_SIZE, borderRadius: NEW_DOT_SIZE / 2, backgroundColor: color.accent }, style]}
    />
  );
}
