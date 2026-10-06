import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, SectionHeader } from '@/components/ui';
import { shortDate } from '@/lib/date';
import { fmtCompact, kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { color, motion, radius, space, type } from '@/theme/tokens';
import type { ExerciseHistoryEntry, TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import { fmtSetCompact, typedWeight, type DistUnit, type LogType } from '@/tracker/engine/logTypes';
import type { UnitSystem } from '@/types/models';

export interface SessionHistoryProps {
  history: ExerciseHistoryEntry[];
  units: UnitSystem;
  /** How many sessions to render (newest first). Default 15. */
  maxSessions?: number;
  /** Phase 2: how the exercise is logged (absent = weight × reps). */
  logType?: LogType;
  distUnit?: DistUnit;
}

/** Index of the top working set for emphasis: heaviest then most reps; longest / farthest for time and distance. */
function topSetIndex(sets: TrackedSetEntry[], lt: LogType): number {
  const score = (s: TrackedSetEntry): [number, number] => {
    if (lt === 'time') return [s.durationSec ?? 0, 0];
    if (lt === 'distance' || lt === 'time_distance') return [s.distanceM ?? 0, -(s.durationSec ?? 0)];
    if (lt === 'reps') return [s.reps, s.weightKg];
    return [s.weightKg, s.reps];
  };
  let top = -1;
  for (let i = 0; i < sets.length; i++) {
    if (sets[i].isWarmup) continue;
    if (top === -1) {
      top = i;
      continue;
    }
    const [a1, a2] = score(sets[i]);
    const [b1, b2] = score(sets[top]);
    if (a1 > b1 || (a1 === b1 && a2 > b2)) top = i;
  }
  return top;
}

function SetChip({
  set,
  units,
  top,
  lt,
  distUnit,
}: {
  set: TrackedSetEntry;
  units: UnitSystem;
  top: boolean;
  lt: LogType;
  distUnit: DistUnit;
}) {
  const label =
    lt === 'weight_reps'
      ? `${trimNum(kgToDisplay(set.weightKg, units))} × ${set.reps}`
      : lt === 'assisted'
        ? `${trimNum(typedWeight(lt, set.weightKg))} × ${set.reps}`
        : fmtSetCompact(set, lt, distUnit).replace('×', ' × ');
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radius.sm,
        backgroundColor: top ? color.accentSoft : set.isWarmup ? 'transparent' : color.surfaceRaised,
        borderWidth: 1,
        borderColor: top ? 'rgba(255, 122, 59, 0.45)' : color.border,
        opacity: set.isWarmup ? 0.55 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: set.isWarmup ? type.mono : type.monoBold,
          fontSize: type.size.sub,
          color: top ? color.accentBright : set.isWarmup ? color.inkMuted : color.ink,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Recent sessions: date header, sets as chips (top set embered, warmups dimmed). */
export function SessionHistory({ history, units, maxSessions = 15, logType = 'weight_reps', distUnit = 'km' }: SessionHistoryProps) {
  const shown = history.slice(0, maxSessions);
  const unit = weightUnit(units);

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.slow).delay(320)}
      style={{ marginTop: space.xl }}
    >
      <SectionHeader title="Recent sessions" />
      <Card style={{ paddingVertical: space.xs }}>
        {shown.map((h, i) => {
          const top = topSetIndex(h.sets, logType);
          return (
          <View
            key={h.sessionId}
            style={{
              paddingVertical: space.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: color.border,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: space.sm,
              }}
            >
              <Text
                style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}
              >
                {shortDate(h.dateISO)}
              </Text>
              {h.volumeKg > 0 ? (
                <Text
                  style={{
                    fontFamily: type.mono,
                    fontSize: type.size.sub,
                    color: color.inkSecondary,
                  }}
                >
                  {fmtCompact(kgToDisplay(h.volumeKg, units))} {unit} vol
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {h.sets.map((s, si) => (
                <SetChip key={s.id} set={s} units={units} top={si === top} lt={logType} distUnit={distUnit} />
              ))}
            </View>
          </View>
          );
        })}
      </Card>
      {history.length > shown.length ? (
        <Text
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.caption,
            color: color.inkMuted,
            textAlign: 'center',
            marginTop: space.md,
          }}
        >
          Showing the last {shown.length} of {history.length} sessions
        </Text>
      ) : null}
    </Animated.View>
  );
}
