/**
 * Edit-mode header — Phase W4. Only rendered when the logging screen is CORRECTING
 * a saved workout, so a normal session keeps its uncluttered "just log sets" layout.
 *
 * Phase 1: the date opens a month calendar (any past day — log a workout you
 * forgot), and the duration can be corrected in minutes. Both are plain JS; no
 * native date-picker module.
 *
 * Phase 3 packet C: the date carries its year when it isn't this year (HI-15, no doubled day
 * name); the start time can be edited (hour : minute, keeping the length); Minutes says why
 * it can't use 0 or more than 600 instead of silently ignoring or clamping them (HI-18) —
 * blank means "unchanged". Also the header of "Log a past workout".
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Chip, Icon } from '@/components/ui';
import { dateWithYear } from '@/lib/date';

import { checkMinutes, parseClock } from '../services/editFields';
import { shownStart } from '../services/historyCard';

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
  /** "Editing a saved workout" / "Logging a past workout". */
  title?: string;
  dateISO: string;
  dayType: DayType;
  notes: string;
  /** Whole minutes, or null when the workout has no recorded end. */
  durationMin: number | null;
  onDateChange: (dateISO: string) => void;
  onDurationChange: (minutes: number) => void;
  onDayTypeChange: (dayType: DayType) => void;
  onNotesChange: (notes: string) => void;
  /** The workout's start (epoch ms) and the day it is stored under — for the Start field. */
  startedAt?: number | null;
  storedDateISO?: string;
  /** Set the start time; returns why it was refused, or null. */
  onStartTimeChange?: (hour: number, minute: number) => string | null;
}

const two = (n: number): string => String(n).padStart(2, '0');

export const EditSessionHeader = memo(function EditSessionHeader({
  title = 'Editing a saved workout',
  dateISO,
  dayType,
  notes,
  durationMin,
  onDateChange,
  onDurationChange,
  onDayTypeChange,
  onNotesChange,
  startedAt,
  storedDateISO,
  onStartTimeChange,
}: EditSessionHeaderProps) {
  const [picking, setPicking] = useState(false);
  const [minText, setMinText] = useState(durationMin == null ? '' : String(durationMin));
  const [minError, setMinError] = useState<string | null>(null);
  useEffect(() => {
    if (durationMin != null && Number(minText) !== durationMin && !minError) setMinText(String(durationMin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMin]);

  // The start as the member saw it on the clock (an imported start is clock time kept as UTC).
  const shown = startedAt != null ? new Date(shownStart(startedAt, storedDateISO || dateISO)) : null;
  const [hText, setHText] = useState(shown ? two(shown.getHours()) : '');
  const [mText, setMText] = useState(shown ? two(shown.getMinutes()) : '');
  const [startError, setStartError] = useState<string | null>(null);
  const shownKey = shown ? `${shown.getHours()}:${shown.getMinutes()}` : '';
  useEffect(() => {
    if (!shown) return;
    setHText(two(shown.getHours()));
    setMText(two(shown.getMinutes()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);
  const commitStart = (): void => {
    if (!onStartTimeChange || !shown) return;
    const c = parseClock(hText, mText);
    if (!c) {
      setStartError('Type the start time, like 18:05.');
      return;
    }
    if (c.hour === shown.getHours() && c.minute === shown.getMinutes()) {
      setStartError(null);
      return;
    }
    const why = onStartTimeChange(c.hour, c.minute);
    setStartError(why);
  };

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
          {title}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 3 }}>
          <Text style={overline}>Date</Text>
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`Date, ${dateISO ? dateWithYear(dateISO) : 'not set'}. Change`}
            style={fieldBox}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
              {dateISO ? dateWithYear(dateISO) : '—'}
            </Text>
            <Icon name="calendar" size={16} color={color.accent} />
          </Pressable>
        </View>
        {shown && onStartTimeChange ? (
          <View style={{ flex: 2 }}>
            <Text style={overline}>Start</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TextInput
                value={hText}
                onChangeText={(t) => setHText(t.replace(/[^0-9]/g, '').slice(0, 2))}
                onEndEditing={commitStart}
                onSubmitEditing={commitStart}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Start hour, 0 to 23"
                style={[fieldBox, { flex: 1, paddingHorizontal: 0, textAlign: 'center', fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }]}
              />
              <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>:</Text>
              <TextInput
                value={mText}
                onChangeText={(t) => setMText(t.replace(/[^0-9]/g, '').slice(0, 2))}
                onEndEditing={commitStart}
                onSubmitEditing={commitStart}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Start minute, 0 to 59"
                style={[fieldBox, { flex: 1, paddingHorizontal: 0, textAlign: 'center', fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }]}
              />
            </View>
          </View>
        ) : null}
      </View>

      <View>
        <Text style={overline}>Minutes</Text>
        <TextInput
          value={minText}
          onChangeText={(t) => {
            const clean = t.replace(/[^0-9]/g, '').slice(0, 4);
            setMinText(clean);
            // HI-18: blank = unchanged; 0 or over 600 says why and changes nothing.
            const c = checkMinutes(clean);
            setMinError(c.error);
            if (c.minutes != null) onDurationChange(c.minutes);
          }}
          onEndEditing={() => {
            // Left blank: show what is kept.
            if (minText === '' && durationMin != null) setMinText(String(durationMin));
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder="—"
          placeholderTextColor={color.inkFaint}
          accessibilityLabel="Workout length in minutes, 1 to 600"
          style={[fieldBox, { fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }]}
        />
        {minError || startError ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ marginTop: space.sm, fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.criticalText }}
          >
            {startError ?? minError}
            {minError && durationMin != null ? ` It stays ${durationMin} min.` : ''}
          </Text>
        ) : null}
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
