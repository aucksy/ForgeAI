/**
 * Month calendar in a bottom sheet (Phase 1) — pick any past day for a workout.
 * Plain JS (no native date-picker module). Future days are shown but disabled:
 * a workout cannot have happened tomorrow.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { fromISO, todayISO } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';

import { monthGrid } from '../lib/calendar';
import { TrackerSheet } from './TrackerSheet';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function DatePickerSheet({
  visible,
  value,
  onChoose,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChoose: (iso: string) => void;
  onClose: () => void;
}) {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = fromISO(value || today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  useEffect(() => {
    if (!visible) return;
    const d = fromISO(value || today);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }, [visible, value, today]);

  const t = fromISO(today);
  const atCurrentMonth = cursor.y === t.getFullYear() && cursor.m === t.getMonth();
  const step = (delta: number): void => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const cells = monthGrid(cursor.y, cursor.m);

  return (
    <TrackerSheet visible={visible} title="Workout date" onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" style={{ padding: space.sm }}>
          <Icon name="chevron-left" size={20} color={color.ink} />
        </Pressable>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
          {MONTHS[cursor.m]} {cursor.y}
        </Text>
        <Pressable
          onPress={() => !atCurrentMonth && step(1)}
          disabled={atCurrentMonth}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={{ padding: space.sm }}
        >
          <Icon name="chevron-right" size={20} color={atCurrentMonth ? color.inkFaint : color.ink} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={i}
            style={{ flex: 1, textAlign: 'center', fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}
          >
            {w}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((iso, i) => {
          if (!iso) return <View key={i} style={{ width: `${100 / 7}%`, height: 44 }} />;
          const future = iso > today;
          const selected = iso === value;
          const day = Number(iso.slice(8, 10));
          return (
            <View key={iso} style={{ width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Pressable
                onPress={() => onChoose(iso)}
                disabled={future}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: future }}
                accessibilityLabel={iso}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? color.accent : 'transparent',
                  borderWidth: iso === today && !selected ? 1 : 0,
                  borderColor: color.borderStrong,
                }}
              >
                <Text
                  style={{
                    fontFamily: selected ? type.bodyBold : type.bodyMedium,
                    fontSize: type.size.sub,
                    color: selected ? '#1F0D05' : future ? color.inkFaint : color.ink,
                  }}
                >
                  {day}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </TrackerSheet>
  );
}
