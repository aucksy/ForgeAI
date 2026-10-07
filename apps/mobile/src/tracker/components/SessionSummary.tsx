/** Read-only session recap: stat tiles, new records, muscle split, per-exercise sets. */
import { Text, View } from 'react-native';

import { HBarList } from '@/components/charts';
import { Badge, Card, Icon, SectionHeader, StatTile } from '@/components/ui';
import { trimNum } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';

import { MUSCLE_LABEL } from '../catalog/muscles';
import { fmtSetCompact, typedWeight, weightIsEach, repsPerSide } from '../engine/logTypes';
import { RECORD_LABEL } from '../engine/records';
import { fmtSets } from '../engine/volume';
import { supersetLabel } from '../lib/superset';
import { formatDuration } from '../services/finishSummary';
import type { SessionSummaryData } from '../services/finishSummary';
import { groupByExercise, recordValueText } from '../services/recordText';

export function SessionSummary({ data }: { data: SessionSummaryData }) {
  const { session, durationSec, totalVolumeKg, workingSetCount, exerciseCount, muscles, setMeta, kinds, needsBodyweight } = data;
  const records = data.records ?? [];

  return (
    <View style={{ gap: space.lg }}>
      {/* stat tiles */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Duration" value={durationSec > 0 ? formatDuration(durationSec) : '—'} icon="clock" />
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Volume" value={Math.round(totalVolumeKg)} unit="kg" icon="dumbbell" />
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Sets" value={workingSetCount} icon="check" />
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Exercises" value={exerciseCount} icon="target" />
        </View>
      </View>
      {needsBodyweight ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, marginTop: -space.sm }}>
          Log your body weight so pull-ups and dips count in your volume.
        </Text>
      ) : null}

      {/* new records (Phase 3: all seven kinds), one row per exercise */}
      {records.length > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
            <Icon name="trophy" size={18} color={color.accent} />
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
              {records.length === 1 ? 'New personal record' : `${records.length} new personal records`}
            </Text>
          </View>
          <View style={{ gap: space.md }}>
            {groupByExercise(records).map((g) => (
              <View key={g.exerciseId} style={{ gap: 6 }}>
                <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
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
      ) : null}

      {/* muscle split — working sets per muscle (a bench set = 1 chest, ½ triceps) */}
      {muscles.length > 0 ? (
        <View>
          <SectionHeader title="Sets per muscle" />
          <Card>
            <HBarList
              data={muscles.map((m) => ({ label: MUSCLE_LABEL[m.muscle], value: m.sets }))}
              valueFormat={(v) => fmtSets(v)}
            />
          </Card>
        </View>
      ) : null}

      {/* per-exercise breakdown */}
      <View>
        <SectionHeader title="Exercises" />
        <View style={{ gap: space.sm }}>
          {session.exercises.map((g) => {
            // superset_group + note are shared across the exercise's sets (note lives on set 1).
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
                  ? 'kg each · reps per side'
                  : 'kg each'
                : lt === 'weight_reps' && repsPerSide(mode)
                  ? 'reps per side'
                  : lt === 'assisted'
                    ? 'kg of help'
                    : null;
            return (
            <Card key={g.exercise.id}>
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
                      ? `${trimNum(typedWeight(lt, s.weightKg))}×${s.reps}`
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
      </View>
    </View>
  );
}
