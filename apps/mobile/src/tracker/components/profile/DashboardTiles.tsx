/**
 * Redesign R2 — the Profile's "Dashboard": 4 tiles, 2 × 2, as Hevy's — Statistics · Exercises ·
 * Measures · Calendar. Each is a 56 dp button with an icon and its name; at large text the name
 * wraps inside the tile instead of being cut.
 */
import { Pressable, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

export type DashboardTile = 'statistics' | 'exercises' | 'measures' | 'calendar';

const TILES: readonly { id: DashboardTile; label: string; icon: IconName }[] = [
  { id: 'statistics', label: 'Statistics', icon: 'chart' },
  { id: 'exercises', label: 'Exercises', icon: 'dumbbell' },
  { id: 'measures', label: 'Measures', icon: 'ruler' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
];

export function DashboardTiles({ onOpen }: { onOpen: (tile: DashboardTile) => void }) {
  return (
    <View style={{ gap: space.md }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.inkMuted }}>
        Dashboard
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {TILES.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              tap();
              onOpen(t.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexBasis: '45%',
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderRadius: radius.md,
              backgroundColor: pressed ? color.surfaceRaised : color.surface,
              borderWidth: 1,
              borderColor: color.border,
            })}
          >
            <Icon name={t.icon} size={22} color={color.ink} />
            <Text style={{ flexShrink: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
