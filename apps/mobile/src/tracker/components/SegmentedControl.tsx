/**
 * 12 Oct 2026 design pass — one look for "pick ONE of a few ranges / periods" (3 months · Year ·
 * All time, Week · Month), the same pill track as Calendar's Month · Year switch. It replaces
 * rows of orange chips there: chips are kept for things you can pick SEVERAL of (muscle groups),
 * so a range no longer looks like a filter, and two orange rows never stack.
 *
 * One row, always: equal parts (`flex: 1`), each label on one line that shrinks to fit at a large
 * phone font instead of wrapping or breaking a word. `compact` is the small version that sits on
 * a section's title row (Week · Month): it hugs its words instead of filling the width.
 */
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { color, radius, type } from '@/theme/tokens';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  compact = false,
  large = false,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  /** What the control picks, for a screen reader ("Range"). */
  label: string;
  compact?: boolean;
  /** 15 Oct 2026 (share sheet): a full 48-point-high tap target, taller still at a large font. */
  large?: boolean;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignSelf: compact ? 'flex-start' : 'stretch',
        padding: 3,
        borderRadius: radius.pill,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              if (on) return;
              tap();
              onChange(o.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            hitSlop={compact ? { top: 6, bottom: 6 } : undefined}
            style={({ pressed }) => ({
              flex: compact ? undefined : 1,
              minWidth: compact ? 60 : 0,
              minHeight: compact ? 32 : large ? 48 : 40,
              paddingHorizontal: compact ? 12 : 4,
              paddingVertical: large ? 8 : 0,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? color.surfaceRaised : 'transparent',
              borderWidth: 1,
              borderColor: on ? color.borderStrong : 'transparent',
              opacity: pressed && !on ? 0.7 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: on ? color.ink : color.inkSecondary }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
