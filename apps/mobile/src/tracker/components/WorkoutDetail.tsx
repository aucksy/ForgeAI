/**
 * Redesign R5 — the body of a saved workout's page, as Hevy's Workout Detail (PLAN §4.5): the
 * stats row (Time · Kg lifted · Sets · Records), the workout's note, the muscle split, then every
 * exercise with its sets — W / 1 / 2 / D / F, weight × reps, RPE, the exercise's note — and its
 * records: named under the exercise, and a medal on the set that holds each one. Tap an exercise
 * → its page. The words are `services/workoutDetail` (PURE, tested).
 */
import { Pressable, Text, View } from 'react-native';

import { HBarList } from '@/components/charts';
import { Badge, Card } from '@/components/ui';
import { liftedWords, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, space, type } from '@/theme/tokens';

import { MUSCLE_LABEL } from '../catalog/muscles';
import { repsPerSide, weightIsEach } from '../engine/logTypes';
import { RECORD_LABEL } from '../engine/records';
import { setsText } from '../engine/volume';
import { shownNotes } from '../lib/workoutText';
import { supersetLabel } from '../lib/superset';
import type { SessionSummaryData } from '../services/finishSummary';
import { groupByExercise, recordValueText } from '../services/recordText';
import { detailSetRows, detailStats, recordSets } from '../services/workoutDetail';
import { ExerciseThumb } from './ExerciseThumb';
import { SetTable } from './SetTable';

const label = { fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted } as const;

export function WorkoutDetail({ data, onOpenExercise }: { data: SessionSummaryData; onOpenExercise: (exerciseId: string) => void }) {
  const units = useUnits();
  const wu = weightUnitOf(units);
  const { session, setMeta, kinds, muscles } = data;
  const records = data.records ?? [];
  const stats = detailStats(data, units);
  const note = shownNotes(session.title, session.notes);
  const byExercise = new Map(groupByExercise(records).map((g) => [g.exerciseId, g.rows]));
  // A lift done as two cards (heavy, back-off) names its records once, on the first card.
  const named = new Set<string>();

  return (
    <View style={{ gap: space.lg }}>
      {/* Time · Kg lifted · Sets · Records */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.sm }}>
        {stats.map((st) => (
          <View key={st.label} accessible accessibilityLabel={`${st.label}: ${st.value}`}>
            <Text style={label}>{st.label}</Text>
            <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>{st.value}</Text>
          </View>
        ))}
      </View>

      {data.needsBodyweight ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
          Log your body weight so pull-ups and dips count in your {liftedWords(units)}.
        </Text>
      ) : null}

      {/* HI-04: the workout's note (the name is the page's title). */}
      {note ? <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.ink, lineHeight: 21 }}>{note}</Text> : null}

      {/* Muscle split — working sets per muscle (a bench set = 1 chest, ½ triceps). Each number
          says "sets" (12 Oct 2026: a bare "2" beside Chest never said what it counted). */}
      {muscles.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            Muscle split
          </Text>
          <Card>
            <HBarList data={muscles.map((m) => ({ label: MUSCLE_LABEL[m.muscle], value: m.sets }))} valueFormat={(v) => setsText(v)} />
          </Card>
        </View>
      ) : null}

      {/* Every exercise with its sets. */}
      <View style={{ gap: space.md }}>
        {session.exercises.map((g, gi) => {
          const kind = kinds[g.exercise.id];
          const lt = kind?.logType ?? 'weight_reps';
          const mode = kind?.loadMode ?? 'one';
          const firstMeta = g.sets.length > 0 ? setMeta[g.sets[0].id] : undefined;
          const ssg = firstMeta?.supersetGroup ?? null;
          const exNote = g.sets.map((s) => setMeta[s.id]?.note).find((n) => !!n && n.trim().length > 0) ?? null;
          const counting =
            lt === 'weight_reps' && weightIsEach(mode)
              ? repsPerSide(mode)
                ? `${wu} each · reps per side`
                : `${wu} each`
              : lt === 'weight_reps' && repsPerSide(mode)
                ? 'reps per side'
                : null;
          const exRecords = named.has(g.exercise.id) ? [] : (byExercise.get(g.exercise.id) ?? []);
          named.add(g.exercise.id);
          const held = recordSets(g.sets, setMeta, byExercise.get(g.exercise.id) ?? []);
          const rows = detailSetRows(g.sets, setMeta, kind, units, held);
          return (
            // LW-28: the same lift can be two cards (heavy, back-off) — the key keeps them apart.
            <Card key={`${g.exercise.id}:${gi}`} style={{ gap: space.sm }}>
              <Pressable
                onPress={() => onOpenExercise(g.exercise.id)}
                accessibilityRole="button"
                accessibilityLabel={`${g.exercise.name}. Open the exercise`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: color.surfaceRaised }}>
                  <ExerciseThumb catalogKey={kind?.catalogKey ?? null} name={g.exercise.name} size={40} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>{g.exercise.name}</Text>
                  {counting ? <Text style={label}>{counting}</Text> : null}
                </View>
                {ssg != null ? <Badge label={`Superset ${supersetLabel(ssg)}`} tone="neutral" /> : null}
              </Pressable>

              {exNote ? <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>{exNote}</Text> : null}

              {exRecords.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {exRecords.map((r) => (
                    <Badge key={r.kind} label={`${RECORD_LABEL[r.kind]} · ${recordValueText(r, r.info)}`} tone="accent" />
                  ))}
                </View>
              ) : null}

              <SetTable rows={rows} logType={lt} />
            </Card>
          );
        })}
      </View>
    </View>
  );
}
