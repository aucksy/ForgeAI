/** A month as a calendar, Monday first, with the days trained filled in (Phase 3 report). */
import { Text, View } from 'react-native';

import { countWord } from '@/lib/words';
import { color, space, type } from '@/theme/tokens';

import { daysInMonth, firstWeekday } from '../lib/months';

const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function MonthGrid({ month, trained, today }: { month: string; trained: readonly string[]; today: string }) {
  const days = daysInMonth(month);
  const lead = firstWeekday(month);
  const set = new Set(trained);
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={{ gap: 6 }} accessibilityLabel={`${countWord(trained.length, 'day')} trained this month`}>
      <View style={{ flexDirection: 'row' }}>
        {HEAD.map((h, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((d, c) => {
            if (d == null) return <View key={c} style={{ flex: 1, height: 34 }} />;
            const iso = `${month}-${String(d).padStart(2, '0')}`;
            const on = set.has(iso);
            const isToday = iso === today;
            return (
              <View key={c} style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? color.accent : 'transparent',
                    borderWidth: isToday && !on ? 1 : 0,
                    borderColor: color.borderStrong,
                  }}
                >
                  <Text style={{ fontFamily: on ? type.monoBold : type.mono, fontSize: type.size.caption, color: on ? '#1F0D05' : color.inkSecondary }}>
                    {d}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ height: space.xs }} />
    </View>
  );
}
