import { Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PressScale } from './PressScale';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}

/** Pill chip for filters + suggested prompts. */
export function Chip({ label, selected, onPress, icon }: ChipProps) {
  const fg = selected ? color.accent : color.inkSecondary;
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
      }}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: fg }}>{label}</Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <PressScale onPress={onPress} scaleTo={0.95}>
      {body}
    </PressScale>
  );
}
