/**
 * Edit-mode header — Phase W4. Only rendered when the logging screen is CORRECTING
 * a saved workout, so a normal session keeps its uncluttered "just log sets" layout.
 *
 * The date is a ±1-day stepper rather than a calendar: fixing a workout logged on
 * the wrong day is a one- or two-day correction in practice, and a real date picker
 * would mean a new native module (which forces an android/ regen — see the Phase-2
 * notes on expo-notifications).
 */
import { memo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Chip, Icon, IconButton } from '@/components/ui';
import { addDays, dayName, shortDate, todayISO } from '@/lib/date';
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
  onDateChange: (dateISO: string) => void;
  onDayTypeChange: (dayType: DayType) => void;
  onNotesChange: (notes: string) => void;
}

export const EditSessionHeader = memo(function EditSessionHeader({
  dateISO,
  dayType,
  notes,
  onDateChange,
  onDayTypeChange,
  onNotesChange,
}: EditSessionHeaderProps) {
  // A workout can't have happened tomorrow.
  const canGoForward = dateISO < todayISO();

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

      <View>
        <Text style={overline}>Date</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton
            icon="chevron-left"
            onPress={() => onDateChange(addDays(dateISO, -1))}
            accessibilityLabel="Previous day"
          />
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
            {dayName(dateISO)}, {shortDate(dateISO)}
          </Text>
          {canGoForward ? (
            <IconButton
              icon="chevron-right"
              onPress={() => onDateChange(addDays(dateISO, 1))}
              accessibilityLabel="Next day"
            />
          ) : (
            // Today: render the glyph inert rather than a greyed-but-tappable
            // button that a screen reader still announces as available.
            <View style={{ padding: space.sm }} accessibilityElementsHidden importantForAccessibility="no">
              <Icon name="chevron-right" size={20} color={color.inkFaint} />
            </View>
          )}
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
    </View>
  );
});
