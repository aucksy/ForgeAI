/**
 * Log today's measurements (Phase 3). Fill in any of them; blanks are skipped. Each box
 * shows the last value as a grey hint. Logging the same day again replaces that day's value.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Card, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { success } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';
import { getMeasurements, logMeasurements } from '@/tracker/db/measurementRepo';
import { MEASURES, MEASURE_LABEL, measureUnit, measurementsToSave, summarize, type MeasureKind } from '@/tracker/engine/measurements';

export default function LogMeasurementsScreen() {
  const router = useRouter();
  const [typed, setTyped] = useState<Partial<Record<MeasureKind, string>>>({});
  const [last, setLast] = useState<Partial<Record<MeasureKind, number>>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    getMeasurements()
      .then((entries) => {
        if (!alive) return;
        const hints: Partial<Record<MeasureKind, number>> = {};
        for (const s of summarize(entries)) hints[s.kind] = s.latest;
        setLast(hints);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onSave = async (): Promise<void> => {
    if (savingRef.current) return;
    const { values, bad } = measurementsToSave(typed);
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
      await logMeasurements(todayISO(), values);
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
      subtitle="Today. Fill in any you like."
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <View style={{ gap: space.lg }}>
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
                  placeholder={last[kind] != null ? trimNum(last[kind] as number) : '—'}
                  placeholderTextColor={color.inkFaint}
                  accessibilityLabel={`${MEASURE_LABEL[kind]} in ${measureUnit(kind) === '%' ? 'percent' : 'centimetres'}`}
                  style={{ flex: 1, fontFamily: type.mono, fontSize: type.size.body, color: color.ink, paddingVertical: 0, textAlign: 'right' }}
                />
                <Text style={{ width: 24, fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{measureUnit(kind)}</Text>
              </View>
            </View>
          ))}
        </Card>
        <PrimaryButton label="Save measurements" icon="check" loading={saving} onPress={() => void onSave()} />
      </View>
    </Screen>
  );
}
