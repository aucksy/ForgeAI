/**
 * Measures → "+" (R3, PLAN §4.3): ONE form for a day — the date, body weight, any of the ten
 * measurements and a picture, as Hevy's "+". Blank boxes are skipped. An earlier day that
 * already has a value asks before replacing it (as the old body-weight and measurement forms
 * did); a likely body-weight typo gets the same one gentle question.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { askConfirm, Card, GhostButton, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { getBodyWeightHistory } from '@/db/repos/userRepo';
import { logBodyWeight } from '@/db/queuedWrites';
import { todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { success } from '@/lib/haptics';
import { tell } from '@/lib/tell';
import { kgToShown, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, space, type } from '@/theme/tokens';
import { DayRow, FormNote, NumberBox } from '@/tracker/components/BodyEntrySheet';
import { DatePickerSheet } from '@/tracker/components/DatePickerSheet';
import { setPhotoDate } from '@/tracker/db/bodyEntries';
import { getMeasurements, logMeasurements } from '@/tracker/db/measurementRepo';
import { bodyWeightTypo, bodyWeightTypoText, replaceMeasurementsQuestion, replaceWeighInQuestion, shouldAskReplace } from '@/tracker/engine/bodyCheck';
import { MEASURE_LABEL, measureToShown, measureUnit, summarize, type MeasureKind, type MeasurementEntry } from '@/tracker/engine/measurements';
import { MEASURE_CHIPS, entryPlan, openingChip } from '@/tracker/lib/measuresView';
import { refreshPhotoBackup } from '@/tracker/services/photoBackup';
import { addPhotoFromCamera, addPhotoFromGallery } from '@/tracker/services/progressPhotos';
import type { BodyWeightEntry } from '@/types/models';

export default function AddMeasuresScreen() {
  const router = useRouter();
  const units = useUnits();
  const params = useLocalSearchParams<{ kind?: string }>();
  const first = openingChip(params.kind);
  const [day, setDay] = useState(todayISO());
  const [pickingDay, setPickingDay] = useState(false);
  const [weight, setWeight] = useState('');
  const [typed, setTyped] = useState<Partial<Record<MeasureKind, string>>>({});
  const [weights, setWeights] = useState<BodyWeightEntry[]>([]);
  const [entries, setEntries] = useState<MeasurementEntry[]>([]);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([getBodyWeightHistory(), getMeasurements()])
      .then(([w, m]) => {
        if (!alive) return;
        setWeights(w);
        setEntries(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const lastWeight = weights.length > 0 ? weights[weights.length - 1] : null;
  const hints: Partial<Record<MeasureKind, number>> = {};
  for (const s of summarize(entries)) hints[s.kind] = s.latest;
  // The measure the page was opened from goes first, so the box the member wants is on top.
  const order = [first, ...MEASURE_CHIPS.filter((c) => c !== first)];

  const addPicture = async (from: 'camera' | 'gallery'): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setNote(null);
    try {
      const photo = from === 'camera' ? await addPhotoFromCamera() : await addPhotoFromGallery();
      if (photo) {
        if (photo.dateISO !== day) await setPhotoDate(photo.id, day);
        setPhotoIds((ids) => [...ids, photo.id]);
        void refreshPhotoBackup().catch(() => undefined);
      }
    } catch (e) {
      const denied = e instanceof Error && e.message === 'camera-denied';
      setNote(denied ? 'Camera not allowed. Allow the camera for ForgeAI in your phone settings, or choose a photo from the gallery.' : 'Couldn’t add the picture. Please try again.');
    } finally {
      busy.current = false;
    }
  };

  const onSave = async (): Promise<void> => {
    if (busy.current) return;
    const plan = entryPlan(weight, typed, units);
    if (plan.bad.length > 0) {
      void tell('Check the numbers', `${plan.bad.join(', ')}: type a number above 0, like 82.5.`);
      return;
    }
    if (plan.empty) {
      if (photoIds.length > 0) {
        router.back();
        return;
      }
      void tell('Nothing to save', 'Type at least one measure, or add a picture.');
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const today = todayISO();
      if (plan.weightKg != null) {
        const hit = bodyWeightTypo(plan.weightKg, weights, { dateISO: day });
        if (hit && !(await askConfirm({ title: bodyWeightTypoText(hit, plan.weightKg, units), confirmLabel: 'Keep it', cancelLabel: 'Fix it' }))) return;
        const other = weights.find((w) => w.dateISO === day);
        if (other && shouldAskReplace(day, today, other)) {
          const ok = await askConfirm({
            title: replaceWeighInQuestion(other, units, today),
            body: 'That day already has a weigh-in. Saving replaces it.',
            confirmLabel: 'Replace',
            destructive: true,
          });
          if (!ok) return;
        }
      }
      const over = entries.filter((e) => e.dateISO === day && plan.measures[e.kind] != null);
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
      if (plan.weightKg != null) await logBodyWeight(day, plan.weightKg);
      if (Object.keys(plan.measures).length > 0) await logMeasurements(day, plan.measures);
      // Pictures added before the day was changed move to the day saved.
      for (const id of photoIds) await setPhotoDate(id, day).catch(() => undefined);
      success();
      router.back();
    } catch {
      void tell('Could not save', 'Something went wrong. Please try again.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const wUnit = weightUnitOf(units);

  return (
    <Screen
      title="Add measures"
      subtitle="Fill in any you like."
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <View style={{ gap: space.lg }}>
        <DayRow dateISO={day} onPress={() => setPickingDay(true)} label="Date" />
        <Card style={{ gap: space.md }}>
          {order.map((c) => (
            <View key={c} style={{ gap: 6 }}>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>
                {c === 'bodyweight' ? 'Body weight' : MEASURE_LABEL[c]}
              </Text>
              {c === 'bodyweight' ? (
                <NumberBox
                  value={weight}
                  onChangeText={setWeight}
                  unit={wUnit}
                  placeholder={lastWeight ? trimNum(kgToShown(lastWeight.weightKg, units)) : '—'}
                  accessibilityLabel={`Body weight in ${wUnit}`}
                />
              ) : (
                <NumberBox
                  value={typed[c] ?? ''}
                  onChangeText={(t) => setTyped((cur) => ({ ...cur, [c]: t }))}
                  unit={measureUnit(c, units)}
                  placeholder={hints[c] != null ? trimNum(measureToShown(c, hints[c] as number, units)) : '—'}
                  accessibilityLabel={`${MEASURE_LABEL[c]} in ${measureUnit(c, units) === '%' ? 'percent' : measureUnit(c, units) === 'in' ? 'inches' : 'centimetres'}`}
                />
              )}
            </View>
          ))}
        </Card>

        <Card style={{ gap: space.sm }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Add picture</Text>
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
            {photoIds.length > 0 ? `${photoIds.length} ${photoIds.length === 1 ? 'picture' : 'pictures'} added. They stay on your phone.` : 'A progress photo for this day. It stays on your phone.'}
          </Text>
          <GhostButton label="Take a picture" icon="camera" onPress={() => void addPicture('camera')} />
          <GhostButton label="Choose from gallery" onPress={() => void addPicture('gallery')} />
          <FormNote text={note} tone="error" />
        </Card>

        <PrimaryButton label="Save" icon="check" loading={saving} onPress={() => void onSave()} />
      </View>
      <DatePickerSheet
        visible={pickingDay}
        title="Date"
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
