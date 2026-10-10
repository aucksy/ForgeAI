/**
 * Log measurements (Phase 3). Fill in any of them; blanks are skipped. Each box shows the last
 * value as a grey hint. Logging the same day again replaces that day's value.
 * Audit PG-16: for today or any earlier day (the Day row; never a future day). Review fix
 * (Phase 5): an earlier day that already has any of the typed measurements asks first
 * ("Replace Waist 82 cm on Tue, 3 Oct?") — before, it was replaced without a word.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { askConfirm, Card, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { success } from '@/lib/haptics';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { DayRow } from '@/tracker/components/BodyEntrySheet';
import { DatePickerSheet } from '@/tracker/components/DatePickerSheet';
import { getMeasurements, logMeasurements } from '@/tracker/db/measurementRepo';
import { replaceMeasurementsQuestion, shouldAskReplace } from '@/tracker/engine/bodyCheck';
import {
  MEASURES,
  MEASURE_LABEL,
  measureToShown,
  measureUnit,
  measurementsToSave,
  shownToMeasure,
  summarize,
  type MeasureKind,
  type MeasurementEntry,
} from '@/tracker/engine/measurements';

export default function LogMeasurementsScreen() {
  const router = useRouter();
  // v0.27.0: sizes typed in cm or inches; always stored in cm.
  const units = useUnits();
  const [typed, setTyped] = useState<Partial<Record<MeasureKind, string>>>({});
  const [last, setLast] = useState<Partial<Record<MeasureKind, number>>>({});
  const [entries, setEntries] = useState<MeasurementEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [day, setDay] = useState(todayISO());
  const [pickingDay, setPickingDay] = useState(false);

  useEffect(() => {
    let alive = true;
    getMeasurements()
      .then((entries) => {
        if (!alive) return;
        const hints: Partial<Record<MeasureKind, number>> = {};
        for (const s of summarize(entries)) hints[s.kind] = s.latest;
        setLast(hints);
        setEntries(entries);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onSave = async (): Promise<void> => {
    if (savingRef.current) return;
    const { values: typedValues, bad } = measurementsToSave(typed);
    const values: Partial<Record<MeasureKind, number>> = {};
    for (const k of Object.keys(typedValues) as MeasureKind[]) values[k] = shownToMeasure(k, typedValues[k] as number, units);
    if (bad.length > 0) {
      Alert.alert('Check the numbers', `${bad.map((k) => MEASURE_LABEL[k]).join(', ')}: type a number above 0, like 82.5.`);
      return;
    }
    if (Object.keys(values).length === 0) {
      Alert.alert('Nothing to save', 'Type at least one measurement.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const today = todayISO();
      const over = entries.filter((e) => e.dateISO === day && values[e.kind] != null);
      if (shouldAskReplace(day, today, over.length > 0 ? over : null)) {
        const parts = over.map((e) => `${MEASURE_LABEL[e.kind]} ${trimNum(measureToShown(e.kind, e.value, units))} ${measureUnit(e.kind, units)}`);
        const ok = await askConfirm({
          title: replaceMeasurementsQuestion(parts, day, today),
          body: 'That day already has these. Saving replaces them.',
          confirmLabel: 'Replace',
          destructive: true,
        });
        if (!ok) return;
      }
      await logMeasurements(day, values);
      success();
      router.back();
    } catch {
      Alert.alert('Could not save', 'Something went wrong. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Screen
      title="Log measurements"
      subtitle="Fill in any you like."
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <View style={{ gap: space.lg }}>
        <DayRow dateISO={day} onPress={() => setPickingDay(true)} />
        <Card style={{ gap: space.sm }}>
          {MEASURES.map((kind) => (
            <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 46 }}>
              <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{MEASURE_LABEL[kind]}</Text>
              <View
                style={{
                  width: 120,
                  height: 42,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.xs,
                  paddingHorizontal: space.md,
                  borderRadius: radius.md,
                  backgroundColor: color.surfaceSunken,
                  borderWidth: 1,
                  borderColor: color.border,
                }}
              >
                <TextInput
                  value={typed[kind] ?? ''}
                  onChangeText={(t) => setTyped((cur) => ({ ...cur, [kind]: t }))}
                  keyboardType="decimal-pad"
                  placeholder={last[kind] != null ? trimNum(measureToShown(kind, last[kind] as number, units)) : '—'}
                  placeholderTextColor={color.inkFaint}
                  accessibilityLabel={`${MEASURE_LABEL[kind]} in ${measureUnit(kind, units) === '%' ? 'percent' : measureUnit(kind, units) === 'in' ? 'inches' : 'centimetres'}`}
                  style={{ flex: 1, fontFamily: type.mono, fontSize: type.size.body, color: color.ink, paddingVertical: 0, textAlign: 'right' }}
                />
                <Text style={{ width: 24, fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{measureUnit(kind, units)}</Text>
              </View>
            </View>
          ))}
        </Card>
        <PrimaryButton label="Save measurements" icon="check" loading={saving} onPress={() => void onSave()} />
      </View>
      <DatePickerSheet
        visible={pickingDay}
        title="Measurement date"
        value={day}
        onChoose={(iso) => {
          setDay(iso);
          setPickingDay(false);
        }}
        onClose={() => setPickingDay(false)}
      />
    </Screen>
  );
}
