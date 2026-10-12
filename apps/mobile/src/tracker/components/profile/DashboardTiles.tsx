/**
 * Redesign R2 — the Profile's "Dashboard": 4 tiles, 2 × 2, as Hevy's — Statistics · Exercises ·
 * Measures · Calendar. Each is a 56 dp button with an icon and its name.
 *
 * 12 Oct 2026 design pass (owner's phone at its largest font): the name wrapped INSIDE the word
 * ("Statistic / s", "Measure / s"). Now a name is always one line and never broken: the icon sits
 * beside it while it fits there, and above it when it would not (`dashboardTileStacked`), and the
 * line shrinks a little rather than wrap. Two explicit rows of two equal columns, so the tiles of
 * a row are always the same height.
 */
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { dashboardTileStacked } from '../../lib/tileFit';

export type DashboardTile = 'statistics' | 'exercises' | 'measures' | 'calendar';

const TILES: readonly { id: DashboardTile; label: string; icon: IconName }[] = [
  { id: 'statistics', label: 'Statistics', icon: 'chart' },
  { id: 'exercises', label: 'Exercises', icon: 'dumbbell' },
  { id: 'measures', label: 'Measures', icon: 'ruler' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
];

const ROWS = [TILES.slice(0, 2), TILES.slice(2, 4)];

export function DashboardTiles({ onOpen }: { onOpen: (tile: DashboardTile) => void }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = dashboardTileStacked(
    width,
    fontScale,
    TILES.map((t) => t.label),
  );
  return (
    <View style={{ gap: space.md }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        Dashboard
      </Text>
      {ROWS.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: space.md }}>
          {row.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                tap();
                onOpen(t.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                minHeight: 56,
                flexDirection: stacked ? 'column' : 'row',
                alignItems: stacked ? 'flex-start' : 'center',
                justifyContent: stacked ? 'center' : 'flex-start',
                gap: stacked ? space.sm : space.md,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
                borderRadius: radius.md,
                backgroundColor: pressed ? color.surfaceRaised : color.surface,
                borderWidth: 1,
                borderColor: color.border,
              })}
            >
              <Icon name={t.icon} size={22} color={color.ink} />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={{ flexShrink: 1, alignSelf: stacked ? 'stretch' : 'auto', fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
