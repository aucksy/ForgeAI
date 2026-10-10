import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Text } from 'react-native';

import { gradients, radius, shadow, space, type } from '@/theme/tokens';

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  /** Spoken name when the label alone is not enough (default: the label). */
  accessibilityLabel?: string;
}

/** Ink color on the ember gradient — near-black for a forged, high-contrast look. */
const INK_ON_EMBER = '#1F0D05';

/**
 * The one primary action (the orange pill).
 * Phase 7 (SH-21): at least 54 dp tall and grows when the label wraps at large text — it used
 * to be a fixed 54 dp that cut "Start training" in half. Says "busy" while loading.
 */
export function PrimaryButton({ label, onPress, loading, disabled, icon, accessibilityLabel }: PrimaryButtonProps) {
  const inactive = Boolean(disabled || loading);
  return (
    <PressScale
      onPress={onPress}
      disabled={inactive}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={loading ? { busy: true } : undefined}
      style={{
        borderRadius: radius.pill,
        opacity: disabled ? 0.45 : 1,
        ...(inactive ? null : shadow.glow),
      }}
    >
      <LinearGradient
        colors={gradients.ember}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          minHeight: 54,
          paddingVertical: space.sm,
          borderRadius: radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          paddingHorizontal: space.xxl,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={INK_ON_EMBER} />
        ) : icon ? (
          <Icon name={icon} size={19} color={INK_ON_EMBER} />
        ) : null}
        <Text
          style={{
            fontFamily: type.bodyBold,
            fontSize: 16,
            color: INK_ON_EMBER,
            letterSpacing: 0.2,
            textAlign: 'center',
            flexShrink: 1,
          }}
        >
          {label}
        </Text>
      </LinearGradient>
    </PressScale>
  );
}
