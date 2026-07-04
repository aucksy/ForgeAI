import { Text } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';

export interface GhostButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
}

/** Quiet secondary action: transparent surface + hairline pill. */
export function GhostButton({ label, onPress, icon }: GhostButtonProps) {
  return (
    <PressScale
      onPress={onPress}
      style={{
        height: 50,
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
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
        {label}
      </Text>
    </PressScale>
  );
}
