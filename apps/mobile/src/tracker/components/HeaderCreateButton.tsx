/**
 * 13 Oct 2026 — the add-exercise pickers' "Create" in the top bar, always there (Hevy's
 * "Create"), not only after a search finds nothing. A word button in the accent colour, 48 dp to
 * the finger, beside the ×. The screen decides where it goes (`onPress`), usually the new-exercise
 * form with the typed search as its name.
 */
import { Pressable, Text } from 'react-native';

import { color, space, type } from '@/theme/tokens';

export function HeaderCreateButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Create a new exercise"
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 48,
        paddingHorizontal: space.sm,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>
        Create
      </Text>
    </Pressable>
  );
}
