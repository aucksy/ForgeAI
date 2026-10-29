/**
 * F63 — 1-rep max and % calculator (phone only). Type a weight and reps: the estimated 1-rep max
 * (the same estimate as the exercise chart's "Estimated 1-rep max"), then 95 % down to 50 % of it,
 * each rounded to a weight the member's bar and plates can make (Settings → Plates and bars).
 *
 * Opens from an exercise page's chart (`exerciseId`: weight and reps start on the best set of the
 * last few workouts) and from the plate calculator (`kg`: the weight it had).
 * Pure rules: `tracker/services/oneRepMax.ts`.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Card, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { cleanTyped, kgToTyped, parseTyped, showW, typedToKg } from '@/tracker/components/unitText';
import { getBoundedExerciseHistory } from '@/tracker/db/exerciseHistory';
import { getTrackerExercise } from '@/tracker/db/exerciseInfo';
import { bestRecentSet, checkOneRep, MAX_REPS, percentRows, RECENT_WORKOUTS, ROUGH_REPS_ABOVE } from '@/tracker/services/oneRepMax';
import { gymBarKg, gymPlatesKg } from '@/tracker/services/plateMath';
import { usePlateSetupFor } from '@/tracker/store/plateSetupStore';

const one = (v: string | string[] | undefined): string | undefined => (typeof v === 'string' ? v : v?.[0]);

export default function OneRepMaxScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ exerciseId?: string | string[]; kg?: string | string[] }>();
  const exerciseId = one(params.exerciseId);
  const startKg = Number(one(params.kg));
  const units = useUnits();
  const unit = weightUnitOf(units);
  const setup = usePlateSetupFor(units);
  const gym = useMemo(() => ({ barKg: gymBarKg(setup, units), platesKg: gymPlatesKg(setup, units) }), [setup, units]);

  const [weightText, setWeightText] = useState(() => (Number.isFinite(startKg) && startKg > 0 ? kgToTyped(startKg, units) : ''));
  const [repsText, setRepsText] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // From an exercise: its name, and the best set of its last few workouts in the boxes.
  useEffect(() => {
    if (!exerciseId) return;
    let alive = true;
    getTrackerExercise(exerciseId)
      .then((ex) => {
        if (alive && ex) setName(ex.name);
      })
      .catch((e) => console.warn('[ForgeErr] 1-rep max: exercise name not read', e));
    getBoundedExerciseHistory(exerciseId, RECENT_WORKOUTS, { skipEasy: true })
      .then((history) => {
        const best = bestRecentSet(history);
        if (!alive || !best) return;
        // Only boxes the member has not typed in yet.
        setWeightText((t) => (t === '' ? kgToTyped(best.weightKg, units) : t));
        setRepsText((t) => (t === '' ? String(best.reps) : t));
        setPrefilled(true);
      })
      .catch((e) => console.warn('[ForgeErr] 1-rep max: recent sets not read, boxes left empty', e));
    return () => {
      alive = false;
    };
    // Units are read once for the prefill; a later unit switch keeps what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId]);

  const check = checkOneRep(typedToKg(weightText, units), parseTyped(repsText, true));
  const e1rmKg = check.ok ? check.e1rmKg : 0;
  const rows = useMemo(() => percentRows(e1rmKg, gym), [e1rmKg, gym]);

  const message = check.ok
    ? null
    : check.why === 'empty'
      ? 'Type a weight and reps to see your 1-rep max.' // member-words
      : check.why === 'weight'
        ? 'Weight must be more than 0.' // member-words
        : `Reps must be a whole number from 1 to ${MAX_REPS}.`; // member-words

  return (
    <Screen title="1-rep max" subtitle={name ?? undefined} onBack={() => goBack(router, '/progress')}>
      <Card style={{ gap: space.md, marginBottom: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Box
            label={`Weight (${unit})`} // member-words
            value={weightText}
            onChange={(t) => {
              setWeightText(cleanTyped(t));
              setPrefilled(false);
            }}
            keyboard="decimal-pad"
            a11y={unit === 'lb' ? 'Weight in pounds' : 'Weight in kilograms'} // member-words
          />
          <Box
            label="Reps" // member-words
            value={repsText}
            onChange={(t) => {
              setRepsText(cleanTyped(t, { integer: true, maxInt: 3 }));
              setPrefilled(false);
            }}
            keyboard="number-pad"
            a11y="Reps" // member-words
          />
        </View>
        {prefilled ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
            {'Filled in from your best recent set.' /* member-words */}
          </Text>
        ) : null}
        {check.ok ? (
          <View style={{ gap: 2 }}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>
              {'Your estimated 1-rep max' /* member-words */}
            </Text>
            <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.accent }}>
              {showW(check.e1rmKg, units)} {unit}
            </Text>
            {check.rough ? (
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.warning }}>
                {`Over ${ROUGH_REPS_ABOVE} reps the estimate is less exact.` /* member-words */}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: check.why === 'empty' ? color.inkMuted : color.warning }}>
            {message}
          </Text>
        )}
      </Card>

      {rows.length > 0 ? (
        <Card style={{ gap: 0, marginBottom: space.lg }}>
          <View style={{ flexDirection: 'row', paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: color.border }}>
            <Text style={[headCell(), { width: 56 }]}>{'% of max' /* member-words */}</Text>
            <Text style={[headCell(), { width: 88 }]}>{'Weight' /* member-words */}</Text>
            <Text style={[headCell(), { flex: 1 }]}>{'Plates per side' /* member-words */}</Text>
          </View>
          {rows.map((r) => {
            const plates =
              r.perSide.length > 0
                ? r.perSide.map((p) => showW(p, units)).join(' + ')
                : Math.abs(r.loadKg - gym.barKg) < 1e-6
                  ? 'Bar only' // member-words
                  : '';
            return (
              <View
                key={r.pct}
                accessible
                accessibilityLabel={`${r.pct} percent: ${showW(r.loadKg, units)} ${unit}${plates ? `, ${plates}${r.perSide.length > 0 ? ' per side' : ''}` : ''}`} // member-words
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderBottomColor: color.border }}
              >
                <Text style={[cell(), { width: 56, color: color.inkSecondary }]}>{r.pct}%</Text>
                <Text style={[cell(), { width: 88, fontFamily: type.monoBold, color: color.ink }]}>
                  {showW(r.loadKg, units)} {unit}
                </Text>
                <Text style={[cell(), { flex: 1, color: color.inkMuted }]} numberOfLines={2}>
                  {plates}
                </Text>
              </View>
            );
          })}
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.md }}>
            {`Weights are rounded to what your ${showW(gym.barKg, units)} ${unit} bar and your plates can load.` /* member-words */}
          </Text>
          <Pressable
            onPress={() => router.push('/settings/plates' as Href)}
            accessibilityRole="link"
            accessibilityLabel="Change plates and bars" // member-words
            style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent, textDecorationLine: 'underline' }}>
              {'Change plates' /* member-words */}
            </Text>
          </Pressable>
        </Card>
      ) : null}
    </Screen>
  );
}

function Box({
  label,
  value,
  onChange,
  keyboard,
  a11y,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  keyboard: 'decimal-pad' | 'number-pad';
  a11y: string;
}) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        selectTextOnFocus
        accessibilityLabel={a11y}
        placeholderTextColor={color.inkMuted}
        style={{
          height: 48,
          borderRadius: radius.md,
          backgroundColor: color.surfaceSunken,
          borderWidth: 1,
          borderColor: color.border,
          textAlign: 'center',
          fontFamily: type.monoBold,
          fontSize: type.size.h3,
          color: color.ink,
          paddingVertical: 0,
        }}
      />
    </View>
  );
}

/** Read when drawn: gym branding repaints the tokens. */
const headCell = () => ({ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }) as const;
const cell = () => ({ fontFamily: type.body, fontSize: type.size.sub }) as const;
