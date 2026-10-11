/**
 * Redesign R5 — Hevy's tabs under a page's header (the exercise page: Summary · History · How to).
 * One row of equal parts, the chosen one underlined in the accent; each part is a 48 dp target
 * and wraps its words at large text instead of cutting them.
 */
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

export function SegmentedTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.border, marginBottom: space.lg }}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              if (on) return;
              tap();
              onChange(t.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            style={{
              flex: 1,
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space.xs,
              borderBottomWidth: 2,
              borderBottomColor: on ? color.accent : 'transparent',
              marginBottom: -1,
            }}
          >
            <Text style={{ fontFamily: on ? type.bodySemi : type.bodyMedium, fontSize: type.size.body, color: on ? color.ink : color.inkMuted, textAlign: 'center' }}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
