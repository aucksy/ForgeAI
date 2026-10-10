/**
 * One month as a Monday-first grid (Phase 3 packet C) — History's calendar (a dot on each day
 * with a workout) and "Log a past workout" (pick the day). Plain JS, no native date picker.
 * Future days are shown but can't be picked.
 */
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { dateWithYear, monthTitle, todayISO } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';

import { monthGrid } from '../lib/calendar';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** "2026-10" moved by `delta` months. PURE. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface MonthCalendarProps {
  /** The month shown, "2026-10". */
  ym: string;
  onMonth: (ym: string) => void;
  /** Earliest month that can be shown (null = no limit). The latest is this month. */
  firstYm?: string | null;
  selected?: string | null;
  onPick: (iso: string) => void;
  /** Workouts per day: a dot under each day that has any. */
  marks?: Record<string, number>;
}

export const MonthCalendar = memo(function MonthCalendar({ ym, onMonth, firstYm, selected, onPick, marks }: MonthCalendarProps) {
  const today = todayISO();
  const thisYm = today.slice(0, 7);
  const canPrev = !firstYm || ym > firstYm;
  const canNext = ym < thisYm;
  const [y, m] = ym.split('-').map(Number);
  const cells = monthGrid(y, m - 1);
  const arrow = (dir: -1 | 1, enabled: boolean) => (
    <Pressable
      onPress={() => enabled && onMonth(shiftMonth(ym, dir))}
      disabled={!enabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      accessibilityLabel={dir < 0 ? 'Previous month' : 'Next month'}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={dir < 0 ? 'chevron-left' : 'chevron-right'} size={20} color={enabled ? color.ink : color.inkDisabled} />
    </Pressable>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {arrow(-1, canPrev)}
        <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
          {monthTitle(ym)}
        </Text>
        {arrow(1, canNext)}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={i}
            importantForAccessibility="no"
            style={{ flex: 1, textAlign: 'center', fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}
          >
            {w}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((iso, i) => {
          if (!iso) return <View key={i} style={{ width: `${100 / 7}%`, height: 48 }} />;
          const future = iso > today;
          const isSel = iso === selected;
          const n = marks?.[iso] ?? 0;
          const label = `${dateWithYear(iso)}${n > 0 ? `, ${n === 1 ? '1 workout' : `${n} workouts`}` : ''}`;
          return (
            <View key={iso} style={{ width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Pressable
                onPress={() => onPick(iso)}
                disabled={future}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel, disabled: future }}
                accessibilityLabel={label}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSel ? color.accent : 'transparent',
                  borderWidth: iso === today && !isSel ? 1 : 0,
                  borderColor: color.borderStrong,
                }}
              >
                <Text
                  style={{
                    fontFamily: isSel || n > 0 ? type.bodyBold : type.bodyMedium,
                    fontSize: type.size.sub,
                    color: isSel ? '#1F0D05' : future ? color.inkFaint : color.ink,
                  }}
                >
                  {Number(iso.slice(8, 10))}
                </Text>
                {n > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 5,
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: isSel ? '#1F0D05' : color.accent,
                    }}
                  />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
});
