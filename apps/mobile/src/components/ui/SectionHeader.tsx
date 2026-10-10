import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

import { Icon } from './Icon';

export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

/**
 * A section heading with an optional link on the right ("See all ›").
 * Phase 7: a screen-reader heading (members can jump section to section); the link is 48 dp
 * to the finger and names its section ("See all, Recent workouts"); the row wraps at large text.
 */
export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        columnGap: space.md,
        marginTop: space.sm,
        marginBottom: space.md,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink, flexShrink: 1 }}
      >
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action.label}, ${title}`}
          hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
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
