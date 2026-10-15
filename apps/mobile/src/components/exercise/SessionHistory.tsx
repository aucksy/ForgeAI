import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, Card, Icon } from '@/components/ui';
import { dateWithYear } from '@/lib/date';
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';
import type { ExerciseHistoryEntry, TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import { type DistUnit, type LogType } from '@/tracker/engine/logTypes';
import { setLabel } from '@/tracker/services/exerciseHeadline';
import type { UnitSystem } from '@/types/models';

export interface SessionHistoryProps {
  history: ExerciseHistoryEntry[];
  units: UnitSystem;
  /** How many workouts one page shows (newest first); "Show more" adds the next page. Default 15. */
  maxSessions?: number;
  /** Phase 2: how the exercise is logged (absent = weight × reps). */
  logType?: LogType;
  distUnit?: DistUnit;
  /** Redesign R5: each workout's name (absent = the date alone heads the card). */
  names?: ReadonlyMap<string, string>;
  /** Redesign R5: tap a workout → its page. */
  onOpen?: (sessionId: string) => void;
  /**
   * 15 Oct 2026 (owner, mid-workout): the workout in progress — its ticked sets of this exercise
   * (tracker/services/currentInHistory.ts) — shown FIRST, highlighted, so it sits right above the
   * last time to compare. Null/absent = no workout open with this exercise.
   */
  current?: TrackedSetEntry[] | null;
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

/** "60 kg × 8" for weight × reps and assisted (with the unit, as Hevy's table), else the type's own words. */
function setText(s: TrackedSetEntry, lt: LogType, units: UnitSystem, distUnit: DistUnit): string {
  if (lt === 'weight_reps' || lt === 'assisted') return `${trimNum(kgToDisplay(Math.abs(s.weightKg), units))} ${weightUnit(units)} × ${s.reps}`;
  return setLabel(s, lt, units, distUnit);
}

/**
 * Redesign R5 — the exercise page's History tab, as Hevy's: every workout with this exercise,
 * newest first, open (never folded), a page at a time ("Show more"), so five years of bench are
 * all there. Each card: the workout's name and date (tap → the workout), then its sets — "1",
 * "2", or D / F for a drop or failure set — the top set embered.
 */
export function SessionHistory({ history, units, maxSessions = 15, logType = 'weight_reps', distUnit = 'km', names, onOpen, current }: SessionHistoryProps) {
  const [pages, setPages] = useState(1);
  const shown = history.slice(0, maxSessions * pages);
  const left = history.length - shown.length;

  return (
    <View style={{ gap: space.md }}>
      {current ? <CurrentCard sets={current} units={units} logType={logType} distUnit={distUnit} /> : null}
      {shown.map((h) => {
        const top = topSetIndex(h.sets, logType);
        const name = names?.get(h.sessionId) ?? null;
        const when = dateWithYear(h.dateISO);
        let n = 0;
        const head = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{name ?? when}</Text>
              {name ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{when}</Text> : null}
            </View>
            {h.easyWeek ? <Badge label="Easy week" tone="neutral" /> : null}
            {onOpen ? <Icon name="chevron-right" size={18} color={color.inkMuted} /> : null}
          </View>
        );
        return (
          <Card key={h.sessionId} style={{ gap: space.xs }}>
            {onOpen ? (
              <Pressable onPress={() => onOpen(h.sessionId)} accessibilityRole="button" accessibilityLabel={`${name ? `${name}, ` : ''}${when}. Open the workout`}>
                {head}
              </Pressable>
            ) : (
              head
            )}
            {h.sets.map((s, i) => {
              const mark = s.setType === 'drop' ? 'D' : s.setType === 'failure' ? 'F' : String(++n);
              const isTop = i === top;
              return (
                <View
                  key={s.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingVertical: 4,
                    paddingHorizontal: space.sm,
                    borderRadius: radius.sm,
                    backgroundColor: isTop ? color.accentSoft : 'transparent',
                  }}
                >
                  <Text style={{ width: 20, fontFamily: type.monoBold, fontSize: type.size.sub, color: mark === 'D' || mark === 'F' ? color.accent : color.inkMuted }}>{mark}</Text>
                  <Text style={{ flex: 1, fontFamily: isTop ? type.monoBold : type.mono, fontSize: type.size.sub, color: isTop ? color.accentBright : color.ink }}>
                    {setText(s, logType, units, distUnit)}
                  </Text>
                </View>
              );
            })}
          </Card>
        );
      })}
      {left > 0 ? (
        <Pressable
          onPress={() => setPages((p) => p + 1)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${Math.min(left, maxSessions)} more workouts, ${left} left`}
          style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
            Show {Math.min(left, maxSessions)} more · {left} left
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The workout in progress: an accent-edged card headed "This workout · in progress". */
function CurrentCard({ sets, units, logType, distUnit }: { sets: TrackedSetEntry[]; units: UnitSystem; logType: LogType; distUnit: DistUnit }) {
  const top = topSetIndex(sets, logType);
  let n = 0;
  return (
    <Card style={{ gap: space.xs, borderWidth: 2, borderColor: color.accent }}>
      <View
        accessible
        accessibilityLabel={`This workout, in progress. ${sets.length === 0 ? 'No sets ticked yet' : `${sets.length} sets ticked`}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>This workout</Text>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>Today · ticked sets so far</Text>
        </View>
        <Badge label="In progress" tone="accent" />
      </View>
      {sets.length === 0 ? (
        <Text style={{ paddingHorizontal: space.sm, fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
          No sets ticked yet. They show here as you tick them.
        </Text>
      ) : (
        sets.map((s, i) => {
          const mark = s.setType === 'drop' ? 'D' : s.setType === 'failure' ? 'F' : String(++n);
          const isTop = i === top;
          return (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingVertical: 4,
                paddingHorizontal: space.sm,
                borderRadius: radius.sm,
                backgroundColor: isTop ? color.accentSoft : 'transparent',
              }}
            >
              <Text style={{ width: 20, fontFamily: type.monoBold, fontSize: type.size.sub, color: mark === 'D' || mark === 'F' ? color.accent : color.inkMuted }}>{mark}</Text>
              <Text style={{ flex: 1, fontFamily: isTop ? type.monoBold : type.mono, fontSize: type.size.sub, color: isTop ? color.accentBright : color.ink }}>
                {setText(s, logType, units, distUnit)}
              </Text>
            </View>
          );
        })
      )}
    </Card>
  );
}
