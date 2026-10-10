import { Text } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';

export interface GhostButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  /** Spoken name when the label alone is not enough (default: the label). */
  accessibilityLabel?: string;
}

/**
 * Quiet secondary action: transparent surface + hairline pill.
 * Phase 7: at least 50 dp tall, and grows (never clips) when the label wraps at large text.
 */
export function GhostButton({ label, onPress, icon, accessibilityLabel }: GhostButtonProps) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={{
        minHeight: 50,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: color.borderStrong,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        paddingHorizontal: space.xl,
      }}
    >
      {icon ? <Icon name={icon} size={18} color={color.accent} /> : null}
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink, textAlign: 'center', flexShrink: 1 }}>
        {label}
      </Text>
    </PressScale>
  );
}
