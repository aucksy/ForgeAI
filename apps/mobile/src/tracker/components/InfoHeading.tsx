/**
 * A section heading with a small "i" (v0.25.1). A sentence that explains how to read a
 * section — not the answer itself — waits behind the i, one tap away, instead of sitting on
 * the screen every visit. The whole heading row is the tap target (48 dp tall), not the i.
 *
 * One component for every such sentence, so they all open and look the same.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

import { Glyph } from './TrackerGlyph';

export function InfoHeading({ title, info }: { title: string; info: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: space.sm }}>
      <Pressable
        onPress={() => {
          tap();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}, more information`}
        accessibilityState={{ expanded: open }}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
      >
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{title}</Text>
        <Glyph name="info" size={18} color={open ? color.accent : color.inkMuted} />
      </Pressable>
      {open ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19, marginBottom: space.sm }}>
          {info}
        </Text>
      ) : null}
    </View>
  );
}
