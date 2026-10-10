/**
 * Read-only workout recap: stat tiles, new records, muscle split, per-exercise sets.
 * Phase 2 (LW-21, R2): every long list folds shut under a highlighted heading with its count;
 * the finish screen leads with its own one-line answer, so it hides the tiles (`showTotals`).
 */
import { Text, View } from 'react-native';

import { HBarList } from '@/components/charts';
import { Badge, Card, FoldSection, StatTile } from '@/components/ui';
import { trimNum } from '@/lib/format';
import { kgToShown, liftedWords, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';

import { MUSCLE_LABEL } from '../catalog/muscles';
import { fmtSetCompact, fmtTotalDistance, typedWeight, weightIsEach, repsPerSide } from '../engine/logTypes';
import { RECORD_LABEL } from '../engine/records';
import { fmtSets } from '../engine/volume';
import { supersetLabel } from '../lib/superset';
import { formatDuration, workoutDistanceM } from '../services/finishSummary';
import type { SessionSummaryData } from '../services/finishSummary';
import { groupByExercise, recordValueText } from '../services/recordText';
import { showW } from './unitText';

export function SessionSummary({
  data,
  showTotals = true,
  exercisesOpen = false,
}: {
  data: SessionSummaryData;
  /** The four tiles (time, kg lifted, sets, exercises). Off where the screen already leads with them. */
  showTotals?: boolean;
  /** Start with the exercises open (a workout's own page, where they are the point). */
  exercisesOpen?: boolean;
}) {
  const { session, durationSec, totalVolumeKg, workingSetCount, exerciseCount, muscles, setMeta, kinds, needsBodyweight } = data;
  const records = data.records ?? [];
  // v0.27.0: kg or lb.
  const units = useUnits();
  const wu = weightUnitOf(units);

  return (
    <View style={{ gap: space.lg }}>
      {/* stat tiles */}
      {showTotals ? (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Duration" value={durationSec > 0 ? formatDuration(durationSec) : '—'} icon="clock" />
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          {/* v0.25.1 review: a run read "Volume 0 kg" — with no kilos, its distance. */}
          {totalVolumeKg <= 0 && workoutDistanceM(data) > 0 ? (
            <StatTile label="Distance" value={fmtTotalDistance(workoutDistanceM(data))} icon="route" />
          ) : (
            <StatTile label={liftedWords(units, true)} value={Math.round(kgToShown(totalVolumeKg, units))} unit={wu} icon="dumbbell" />
          )}
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Sets" value={workingSetCount} icon="check" />
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Exercises" value={exerciseCount} icon="dumbbell" />
        </View>
      </View>
      ) : null}
      {needsBodyweight ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, marginTop: -space.sm }}>
          Log your body weight so pull-ups and dips count in your {liftedWords(units)}.
        </Text>
      ) : null}

      {/* new records (Phase 3: all seven kinds), one row per exercise */}
      {records.length > 0 ? (
        // D10: the count is the LIFTS that beat a best; each kind shows on its lift below.
        <FoldSection title="New records" count={groupByExercise(records).length} noun="lift">
        <Card>
          <View style={{ gap: space.md }}>
            {groupByExercise(records).map((g) => (
              <View key={g.exerciseId} style={{ gap: 6 }}>
                <Text numberOfLines={2} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                  {g.exerciseName}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {g.rows.map((r) => (
                    <Badge key={r.kind} label={`${RECORD_LABEL[r.kind]} · ${recordValueText(r, r.info)}`} tone="accent" />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </Card>
        </FoldSection>
      ) : null}

      {/* muscle split — working sets per muscle (a bench set = 1 chest, ½ triceps) */}
      {muscles.length > 0 ? (
        <FoldSection title="Sets per muscle" count={muscles.length} noun="muscle">
          <Card>
            <HBarList
              data={muscles.map((m) => ({ label: MUSCLE_LABEL[m.muscle], value: m.sets }))}
              valueFormat={(v) => fmtSets(v)}
            />
          </Card>
        </FoldSection>
      ) : null}

      {/* per-exercise breakdown */}
      <FoldSection title="Exercises" count={exerciseCount} noun="exercise" defaultOpen={exercisesOpen}>
        <View style={{ gap: space.sm }}>
          {session.exercises.map((g, gi) => {
            // superset_group + note are shared across the card's sets (note lives on its first set).
            const firstMeta = g.sets.length > 0 ? setMeta[g.sets[0].id] : undefined;
            const ssg = firstMeta?.supersetGroup ?? null;
            const exNote =
              g.sets.map((s) => setMeta[s.id]?.note).find((n) => !!n && n.trim().length > 0) ?? null;
            const kind = kinds[g.exercise.id];
            const lt = kind?.logType ?? 'weight_reps';
            const mode = kind?.loadMode ?? 'one';
            const counting =
              lt === 'weight_reps' && weightIsEach(mode)
                ? repsPerSide(mode)
                  ? `${wu} each · reps per side`
                  : `${wu} each`
                : lt === 'weight_reps' && repsPerSide(mode)
                  ? 'reps per side'
                  : lt === 'assisted'
                    ? `${wu} of help`
                    : null;
            return (
            // LW-28: the same lift can be two cards (heavy, back-off) — the key keeps them apart.
            <Card key={`${g.exercise.id}:${gi}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                  {g.exercise.name}
                </Text>
                {ssg != null ? <Badge label={`Superset ${supersetLabel(ssg)}`} tone="neutral" /> : null}
                {counting ? (
                  <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>{counting}</Text>
                ) : null}
              </View>
              {exNote ? (
                <Text
                  style={{
                    fontFamily: type.body,
                    fontSize: type.size.caption,
                    color: color.inkMuted,
                    marginTop: 4,
                    lineHeight: 15,
                  }}
                >
                  {exNote}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
                {g.sets.map((s) => {
                  const meta = setMeta[s.id];
                  // Type prefix: warm-up wins (authoritative isWarmup), else drop/failure.
                  const prefix = s.isWarmup
                    ? 'W '
                    : meta?.setType === 'drop'
                      ? 'D '
                      : meta?.setType === 'failure'
                        ? 'F '
                        : '';
                  const rpe = !s.isWarmup && meta?.rpe != null ? ` @${trimNum(meta.rpe)}` : '';
                  const body =
                    lt === 'assisted'
                      ? `${showW(typedWeight(lt, s.weightKg), units)} ${wu} × ${s.reps}`
                      : fmtSetCompact(
                          { weightKg: s.weightKg, reps: s.reps, durationSec: meta?.durationSec, distanceM: meta?.distanceM },
                          lt,
                          kind?.distUnit ?? 'km',
                        );
                  return (
                    <View
                      key={s.id}
                      style={{
                        paddingHorizontal: space.sm,
                        paddingVertical: 4,
                        borderRadius: radius.sm,
                        backgroundColor: s.isWarmup ? color.surfaceRaised : color.surfaceSunken,
                        borderWidth: 1,
                        borderColor: color.border,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: type.mono,
                          fontSize: type.size.caption,
                          color: s.isWarmup ? color.inkMuted : color.inkSecondary,
                        }}
                      >
                        {prefix}
                        {body}
                        {rpe}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
            );
          })}
        </View>
      </FoldSection>
    </View>
  );
}
