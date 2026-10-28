/**
 * R-141 (owner, 27 Oct 2026: "same view as the profile section so it is consistent everywhere"):
 * the row of small numbers under a workout — a muted label over a bold value ("Kg lifted" /
 * "12,480"), wrapping on a narrow phone. ONE component for the profile feed card and the
 * exercise History cards, so the two never drift apart.
 */
import { Text, View } from 'react-native';

import { color, space, type } from '@/theme/tokens';

export interface StatsRowStat {
  label: string;
  value: string;
}

export function StatsRow({ stats }: { stats: readonly StatsRowStat[] }) {
  if (stats.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.sm }}>
      {stats.map((st) => (
        <View key={st.label}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{st.label}</Text>
          <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>{st.value}</Text>
        </View>
      ))}
    </View>
  );
}
