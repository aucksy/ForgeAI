/**
 * Profile's folded half (Audit Phase 7, D12): everything that is not "you and your workouts"
 * sits shut under one heading that names what is inside, so the backup, the imports and
 * "Erase all data" are one tap away and never hidden behind a vague "More".
 *
 * Screen reader: the fold is one button ("Gym, backup and data. Your gym · backup · import ·
 * erase, collapsed"). Its title is not marked as a heading — inside a button a heading can
 * never be reached on its own, so the role only promised something that was not there.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

export function ProfileFold({
  title,
  contents,
  children,
}: {
  title: string;
  /** What is inside, in plain words: "Your gym · backup · import · erase". */
  contents: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => {
          tap();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${contents}`}
        accessibilityHint={open ? 'Hides these settings' : 'Shows these settings'}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          minHeight: 64,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: open ? color.borderStrong : color.border,
          backgroundColor: pressed ? color.surfaceRaised : color.surface,
          marginBottom: open ? space.xl : 0,
        })}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            {title}
          </Text>
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 2, lineHeight: 19 }}>
            {contents}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevron-right" size={20} color={color.inkMuted} />
        </View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}
