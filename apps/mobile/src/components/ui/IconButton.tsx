import { color, radius } from '@/theme/tokens';

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';

export interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  /** Container diameter (default 42). */
  size?: number;
  tint?: string;
  accessibilityLabel: string;
}

export function IconButton({ icon, onPress, size = 42, tint, accessibilityLabel }: IconButtonProps) {
  return (
    <PressScale
      onPress={onPress}
      scaleTo={0.92}
      hitSlop={6}
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
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={tint ?? color.ink} />
    </PressScale>
  );
}
