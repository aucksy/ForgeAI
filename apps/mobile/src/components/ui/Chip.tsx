import { Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { hitSlopFor } from './a11y';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
  /**
   * What a screen reader calls it: "button" (default — filters, suggested prompts), "radio"
   * for one-of-many groups, "checkbox" for many-of-many. Radio and checkbox say "checked".
   */
  role?: 'button' | 'radio' | 'checkbox';
  /** Spoken name when the label alone is not enough (default: the label). */
  accessibilityLabel?: string;
}

/**
 * The drawn pill at normal text size: 8 dp padding above and below, a 13 sp line (~18 dp) and
 * its 1 dp border — about 36 dp, as it always looked.
 */
const CHIP_DRAWN_H = 36;
/**
 * Review fix: the 48 dp touch area comes from hit slop alone (6 dp above and below), never from
 * making the pill or its padding bigger — the chip looks exactly as before. Android only takes
 * a touch inside the parent's box, so a row of chips should leave this much room inside itself
 * (`ChipGroup` does: padding with a matching negative margin, so nothing moves).
 */
export const CHIP_TOUCH_SLOP = hitSlopFor(CHIP_DRAWN_H);
const CHIP_SLOP = { top: CHIP_TOUCH_SLOP, bottom: CHIP_TOUCH_SLOP, left: 0, right: 0 };

/**
 * Pill chip for filters + suggested prompts.
 * Phase 7: says "selected"/"checked" and "dimmed", 48 dp to the finger, and grows with text.
 */
export function Chip({ label, selected, onPress, icon, disabled, role = 'button', accessibilityLabel }: ChipProps) {
  const fg = disabled ? color.inkDisabled : selected ? color.accent : color.inkSecondary;
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: space.md + 2,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        backgroundColor: selected ? color.accentSoft : color.surfaceRaised,
        borderWidth: 1,
        borderColor: selected ? 'rgba(255, 122, 59, 0.45)' : color.border,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: fg, flexShrink: 1 }}>{label}</Text>
    </View>
  );

  if (!onPress) return body;
  const state =
    role === 'button'
      ? { selected: Boolean(selected), disabled: Boolean(disabled) }
      : { checked: Boolean(selected), disabled: Boolean(disabled) };
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.95}
      hitSlop={CHIP_SLOP}
      accessibilityRole={role}
      accessibilityState={state}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {body}
    </PressScale>
  );
}
