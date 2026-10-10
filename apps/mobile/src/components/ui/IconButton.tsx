import { color, radius } from '@/theme/tokens';

import { hitSlopFor } from './a11y';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';

export interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  /** Container diameter (default 42). */
  size?: number;
  tint?: string;
  /** Required: an icon alone says nothing to a screen reader ("Back", "Delete set 3"). */
  accessibilityLabel: string;
  disabled?: boolean;
}

/**
 * Round icon-only button. Phase 7: whatever its drawn size, the touch area is at least 48 dp
 * (with a little extra on the 42 dp default, so a sweaty thumb still lands).
 */
export function IconButton({ icon, onPress, size = 42, tint, accessibilityLabel, disabled }: IconButtonProps) {
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.92}
      hitSlop={Math.max(6, hitSlopFor(size))}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={tint ?? color.ink} />
    </PressScale>
  );
}
