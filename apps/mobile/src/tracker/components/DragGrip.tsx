/**
 * The small bar at the top of a card that can be dragged (17 Oct 2026, owner: "a small bar handle
 * at the top of each exercise card or routine card, which shows they can press, hold and drag;
 * without it it's hard to know"). The same mark a pull-up sheet carries, so it reads as "this
 * moves". Drawn only where a drag is possible (two cards or more). Decoration: screen readers skip
 * it (Move up / Move down in the card's ⋯ menu do the same for them), and it takes no touch of its
 * own, so the card's press-and-hold reaches it.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { color } from '@/theme/tokens';

export const GRIP_WIDTH = 36;
export const GRIP_HEIGHT = 4;

export function DragGrip({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        { alignSelf: 'center', width: GRIP_WIDTH, height: GRIP_HEIGHT, borderRadius: GRIP_HEIGHT / 2, backgroundColor: color.inkFaint },
        style,
      ]}
    />
  );
}
