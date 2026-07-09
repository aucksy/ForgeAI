/** Read-only session recap: stat tiles, new PRs, muscle split, per-exercise sets. */
import { Text, View } from 'react-native';

import { HBarList } from '@/components/charts';
import { Badge, Card, Icon, SectionHeader, StatTile } from '@/components/ui';
import { fmtWeight, trimNum } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';

import { formatDuration } from '../services/finishSummary';
import type { SessionSummaryData } from '../services/finishSummary';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

export function SessionSummary({ data }: { data: SessionSummaryData }) {
  const { session, durationSec, totalVolumeKg, workingSetCount, exerciseCount, prs, muscles, setMeta } =
    data;

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

      {/* new PRs */}
      {prs.length > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
            <Icon name="trophy" size={18} color={color.accent} />
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
              {prs.length === 1 ? 'New personal record' : `${prs.length} new personal records`}
            </Text>
          </View>
          <View style={{ gap: space.sm }}>
            {prs.map((pr, i) => (
              <View
                key={`${pr.exerciseName}-${pr.kind}-${i}`}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}
                >
                  {pr.exerciseName}
                </Text>
                <Badge
                  label={
                    pr.kind === 'weight'
                      ? `${fmtWeight(pr.weightKg)} × ${pr.reps}`
                      : `e1RM ${trimNum(pr.value)} kg`
                  }
                  tone="accent"
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* muscle split */}
      {muscles.length > 0 ? (
        <View>
          <SectionHeader title="Muscles worked" />
          <Card>
            <HBarList data={muscles.map((m) => ({ label: cap(m.muscleGroup), value: m.volumeKg }))} />
          </Card>
        </View>
      ) : null}

      {/* per-exercise breakdown */}
      <View>
        <SectionHeader title="Exercises" />
        <View style={{ gap: space.sm }}>
          {session.exercises.map((g) => (
            <Card key={g.exercise.id}>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                {g.exercise.name}
              </Text>
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
                        {trimNum(s.weightKg)}×{s.reps}
                        {rpe}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ))}
        </View>
      </View>
    </View>
  );
}
