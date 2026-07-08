import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, SectionHeader } from '@/components/ui';
import { shortDate } from '@/lib/date';
import { fmtCompact, kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { color, motion, radius, space, type } from '@/theme/tokens';
import type { ExerciseStats, SetEntry, UnitSystem } from '@/types/models';

export interface SessionHistoryProps {
  history: ExerciseStats['history'];
  units: UnitSystem;
  /** How many sessions to render (newest first). Default 15. */
  maxSessions?: number;
}

/** Index of the top working set (heaviest, then most reps) for emphasis. */
function topSetIndex(sets: SetEntry[]): number {
  let top = -1;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    if (s.isWarmup) continue;
    if (
      top === -1 ||
      s.weightKg > sets[top].weightKg ||
      (s.weightKg === sets[top].weightKg && s.reps > sets[top].reps)
    ) {
      top = i;
    }
  }
  return top;
}

function SetChip({ set, units, top }: { set: SetEntry; units: UnitSystem; top: boolean }) {
  const label = `${trimNum(kgToDisplay(set.weightKg, units))} × ${set.reps}`;
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
export function SessionHistory({ history, units, maxSessions = 15 }: SessionHistoryProps) {
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
          const top = topSetIndex(h.sets);
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
              <Text
                style={{
                  fontFamily: type.mono,
                  fontSize: type.size.sub,
                  color: color.inkSecondary,
                }}
              >
                {fmtCompact(kgToDisplay(h.volumeKg, units))} {unit} vol
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {h.sets.map((s, si) => (
                <SetChip key={s.id} set={s} units={units} top={si === top} />
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
