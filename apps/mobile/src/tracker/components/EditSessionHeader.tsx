/**
 * Edit-mode header — Phase W4. Only rendered when the logging screen is CORRECTING
 * a saved workout, so a normal session keeps its uncluttered "just log sets" layout.
 *
 * Phase 1: the date opens a month calendar (any past day — log a workout you
 * forgot), and the duration can be corrected in minutes. Both are plain JS; no
 * native date-picker module.
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Chip, Icon } from '@/components/ui';
import { dayName, shortDate } from '@/lib/date';

import { DatePickerSheet } from './DatePickerSheet';
import { color, radius, space, type } from '@/theme/tokens';
import type { DayType } from '@/types/models';

/** 'rest' is excluded: a logged workout with sets is by definition not a rest day. */
const DAY_TYPES: { id: DayType; label: string }[] = [
  { id: 'push', label: 'Push' },
  { id: 'pull', label: 'Pull' },
  { id: 'legs', label: 'Legs' },
  { id: 'upper', label: 'Upper' },
  { id: 'lower', label: 'Lower' },
  { id: 'full', label: 'Full body' },
];

const overline = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
} as const;

export interface EditSessionHeaderProps {
  dateISO: string;
  dayType: DayType;
  notes: string;
  /** Whole minutes, or null when the workout has no recorded end. */
  durationMin: number | null;
  onDateChange: (dateISO: string) => void;
  onDurationChange: (minutes: number) => void;
  onDayTypeChange: (dayType: DayType) => void;
  onNotesChange: (notes: string) => void;
}

export const EditSessionHeader = memo(function EditSessionHeader({
  dateISO,
  dayType,
  notes,
  durationMin,
  onDateChange,
  onDurationChange,
  onDayTypeChange,
  onNotesChange,
}: EditSessionHeaderProps) {
  const [picking, setPicking] = useState(false);
  const [minText, setMinText] = useState(durationMin == null ? '' : String(durationMin));
  useEffect(() => {
    if (durationMin != null && Number(minText) !== durationMin) setMinText(String(durationMin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMin]);

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.lg,
        gap: space.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="calendar" size={16} color={color.accent} />
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Editing a saved workout
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 3 }}>
          <Text style={overline}>Date</Text>
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`Date, ${dayName(dateISO)} ${shortDate(dateISO)}. Change`}
            style={fieldBox}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
              {dayName(dateISO)}, {shortDate(dateISO)}
            </Text>
            <Icon name="calendar" size={16} color={color.accent} />
          </Pressable>
        </View>
        <View style={{ flex: 2 }}>
          <Text style={overline}>Minutes</Text>
          <TextInput
            value={minText}
            onChangeText={(t) => {
              const clean = t.replace(/[^0-9]/g, '').slice(0, 3);
              setMinText(clean);
              const n = parseInt(clean, 10);
              if (Number.isFinite(n) && n > 0) onDurationChange(n);
            }}
            keyboardType="number-pad"
            selectTextOnFocus
            placeholder="—"
            placeholderTextColor={color.inkFaint}
            accessibilityLabel="Workout length in minutes"
            style={[fieldBox, { fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }]}
          />
        </View>
      </View>

      <View>
        <Text style={overline}>Type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {DAY_TYPES.map((d) => (
            <Chip
              key={d.id}
              label={d.label}
              selected={d.id === dayType}
              onPress={() => {
                if (d.id !== dayType) onDayTypeChange(d.id);
              }}
            />
          ))}
        </View>
      </View>

      <View>
        <Text style={overline}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={onNotesChange}
          placeholder="How did it go?"
          placeholderTextColor={color.inkFaint}
          multiline
          style={{
            backgroundColor: color.surfaceSunken,
            borderWidth: 1,
            borderColor: color.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: 10,
            minHeight: 56,
            color: color.ink,
            fontFamily: type.body,
            fontSize: type.size.sub,
            textAlignVertical: 'top',
          }}
        />
      </View>
      <DatePickerSheet
        visible={picking}
        value={dateISO}
        onChoose={(iso) => {
          onDateChange(iso);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
});

const fieldBox = {
  height: 44,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: space.md,
  borderRadius: radius.md,
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.borderStrong,
};
