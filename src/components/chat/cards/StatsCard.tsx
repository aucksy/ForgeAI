import { Text, View } from 'react-native';

import { color, space, type } from '@/theme/tokens';

import type { StatRowView } from '../payload';
import { CardShell } from './CardShell';

/** Generic label/value rows — weekly summaries, progress checks. */
export function StatsCard({ rows }: { rows: StatRowView[] }) {
  return (
    <CardShell icon="sparkle" title="Snapshot" subtitle="Straight from your training log">
      <View style={{ marginTop: space.sm }}>
        {rows.map((r, i) => (
          <View
            key={`${r.label}-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.md,
              paddingVertical: space.sm + 1,
              borderBottomWidth: i === rows.length - 1 ? 0 : 1,
              borderBottomColor: color.border,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: type.bodyMedium,
                fontSize: type.size.sub,
                color: color.inkSecondary,
              }}
            >
              {r.label}
            </Text>
            <Text
              style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: color.ink }}
            >
              {r.value}
            </Text>
          </View>
        ))}
      </View>
    </CardShell>
  );
}
