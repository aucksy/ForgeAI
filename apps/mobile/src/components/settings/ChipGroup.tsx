import { Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import type { IconName } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

export interface ChipOption<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
}

export interface ChipGroupProps<T extends string> {
  /** Small overline label above the chips (e.g. "PROVIDER"). */
  label?: string;
  options: readonly ChipOption<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
}

/**
 * Labelled single-select chip row (units, body figure, goal…).
 *
 * Audit Phase 7: each chip is a radio (`Chip role="radio"`) that a screen reader reads with its
 * state ("lb, miles, checked"), the group label is a heading, and the chip's own hit slop makes
 * the touch area 48 dp tall even though the drawn chip is smaller. The row keeps that slop
 * inside its own box (padding, cancelled by a negative margin, so nothing moves on screen):
 * Android ignores a touch outside the parent's box, so the top and bottom rows' slop would
 * otherwise be dead. The spoken name is the chip's
 * own words: device-QA flows tap chips by their exact text.
 */
export function ChipGroup<T extends string>({
  label,
  options,
  selectedId,
  onSelect,
}: ChipGroupProps<T>) {
  return (
    <View>
      {label ? (
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: type.bodySemi,
            fontSize: type.size.caption,
            color: color.inkMuted,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            marginBottom: space.sm,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        accessibilityRole="radiogroup"
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: space.sm,
          rowGap: space.sm,
          paddingVertical: CHIP_TOUCH_SLOP,
          marginVertical: -CHIP_TOUCH_SLOP,
        }}
      >
        {options.map((o) => (
          <Chip
            key={o.id}
            role="radio"
            label={o.label}
            icon={o.icon}
            selected={o.id === selectedId}
            onPress={() => {
              if (o.id !== selectedId) onSelect(o.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}
