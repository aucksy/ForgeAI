import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, FoldSection } from '@/components/ui';
import { shortDate } from '@/lib/date';
import { fmtCompact, kgToDisplay, weightUnit } from '@/lib/format';
import { color, motion, radius, space, type } from '@/theme/tokens';
import type { ExerciseHistoryEntry, TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import { type DistUnit, type LogType } from '@/tracker/engine/logTypes';
import { setLabel } from '@/tracker/services/exerciseHeadline';
import type { UnitSystem } from '@/types/models';

export interface SessionHistoryProps {
  history: ExerciseHistoryEntry[];
  units: UnitSystem;
  /** How many sessions one page shows (newest first); "Show more" adds the next page. Default 15. */
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
  const label = setLabel(set, lt, units, distUnit);
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

/**
 * Past sessions: folded shut under a count (audit Phase 4, EX-14 / R2); open, a page of sessions
 * (date, sets as chips — top set embered, warm-ups dimmed) and "Show more" for the next page, so
 * five years of bench are all there, not just the last 15.
 */
export function SessionHistory({ history, units, maxSessions = 15, logType = 'weight_reps', distUnit = 'km' }: SessionHistoryProps) {
  const [pages, setPages] = useState(1);
  const shown = history.slice(0, maxSessions * pages);
  const unit = weightUnit(units);
  const left = history.length - shown.length;

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.slow).delay(320)}
      style={{ marginTop: space.xl }}
    >
      <FoldSection title="Past sessions" count={history.length} noun="session">
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
      {left > 0 ? (
        <Pressable
          onPress={() => setPages((p) => p + 1)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${Math.min(left, maxSessions)} more sessions, ${left} left`}
          style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
            Show {Math.min(left, maxSessions)} more · {left} left
          </Text>
        </Pressable>
      ) : null}
      </FoldSection>
    </Animated.View>
  );
}
