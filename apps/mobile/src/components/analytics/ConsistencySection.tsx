import { Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import type { ConsistencyCell } from '@/types/models';

export interface ConsistencySectionProps {
  cells: ConsistencyCell[];
  rangeDays: number;
  /** THE streak (D9): weeks in a row with at least one workout. */
  streak: number;
}

/** Days with a workout in the range (PG-24: rest days are cells too — count the trained ones). */
export function trainedDays(cells: readonly ConsistencyCell[]): number {
  return cells.reduce((n, c) => n + (c.level > 0 ? 1 : 0), 0);
}

/**
 * Audit Phase 5: one compact line — History owns the calendar, so Progress no longer repeats
 * it. "12 days trained in 30 days · 5 weeks in a row" (D9).
 */
export function ConsistencySection({ cells, rangeDays, streak }: ConsistencySectionProps) {
  const days = trainedDays(cells);
  const weeks = streak > 0 ? ` · ${streak} ${streak === 1 ? 'week' : 'weeks'} in a row` : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xl, minHeight: 32 }}>
      <Icon name="flame" size={16} color={color.accent} />
      <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>
        {days === 0 ? `No workouts in the last ${rangeDays} days` : `${days} ${days === 1 ? 'day' : 'days'} trained in ${rangeDays} days${weeks}`}
      </Text>
    </View>
  );
}
