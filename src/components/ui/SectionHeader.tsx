import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

import { Icon } from './Icon';

export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: space.sm,
        marginBottom: space.md,
      }}
    >
      <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            tap();
            action.onPress();
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
            {action.label}
          </Text>
          <Icon name="chevron-right" size={14} color={color.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}
