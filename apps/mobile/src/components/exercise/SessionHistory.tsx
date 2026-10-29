import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, Card, Icon } from '@/components/ui';
import { dateWithYear } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';
import { StatsRow } from '@/tracker/components/StatsRow';
import type { ExerciseHistoryEntry, TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import { machineText } from '@/tracker/engine/cardioMachine';
import { type DistUnit, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import { exerciseWorkoutStats, historySetText as setText, topSetIndex } from '@/tracker/services/exerciseWorkoutStats';
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
  /** R-141: the exercise's counting (two dumbbells count both in "Kg lifted"); absent = one weight. */
  loadMode?: LoadMode;
}

/**
 * Redesign R5 — the exercise page's History tab, as Hevy's: every workout with this exercise,
 * newest first, open (never folded), a page at a time ("Show more"), so five years of bench are
 * all there. Each card: the workout's name and date (tap → the workout), then its sets — "1",
 * "2", or D / F for a drop or failure set — the top set embered.
 * R-141 (27 Oct 2026): under the name, the profile feed's stats row with THIS exercise's numbers in
 * that workout — Kg lifted (or Reps / Time / Distance), Sets, Best set — the open workout's too.
 */
export function SessionHistory({
  history,
  units,
  maxSessions = 15,
  logType = 'weight_reps',
  distUnit = 'km',
  names,
  onOpen,
  current,
  loadMode = 'one',
}: SessionHistoryProps) {
  const [pages, setPages] = useState(1);
  const shown = history.slice(0, maxSessions * pages);
  const left = history.length - shown.length;

  return (
    <View style={{ gap: space.md }}>
      {current ? <CurrentCard sets={current} units={units} logType={logType} distUnit={distUnit} loadMode={loadMode} /> : null}
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
            <View style={{ paddingHorizontal: space.sm, paddingBottom: space.xs }}>
              <StatsRow stats={exerciseWorkoutStats(h.sets, logType, units, distUnit, loadMode)} />
            </View>
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
                  <SetLine s={s} isTop={isTop} logType={logType} units={units} distUnit={distUnit} />
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

/**
 * One set's words. F64: a machine set adds its speed / incline / level on a muted second line;
 * every other set renders exactly the single line it always did.
 */
function SetLine({
  s,
  isTop,
  logType,
  units,
  distUnit,
}: {
  s: TrackedSetEntry;
  isTop: boolean;
  logType: LogType;
  units: UnitSystem;
  distUnit: DistUnit;
}) {
  const main = (
    <Text style={{ flex: 1, fontFamily: isTop ? type.monoBold : type.mono, fontSize: type.size.sub, color: isTop ? color.accentBright : color.ink }}>
      {setText(s, logType, units, distUnit)}
    </Text>
  );
  const extra = machineText(s.machine, units);
  if (!extra) return main;
  return (
    <View style={{ flex: 1 }}>
      {main}
      <Text style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}>{extra}</Text>
    </View>
  );
}

/** The workout in progress: an accent-edged card headed "This workout · in progress". */
function CurrentCard({
  sets,
  units,
  logType,
  distUnit,
  loadMode,
}: {
  sets: TrackedSetEntry[];
  units: UnitSystem;
  logType: LogType;
  distUnit: DistUnit;
  loadMode: LoadMode;
}) {
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
        <>
        <View style={{ paddingHorizontal: space.sm, paddingBottom: space.xs }}>
          <StatsRow stats={exerciseWorkoutStats(sets, logType, units, distUnit, loadMode)} />
        </View>
        {sets.map((s, i) => {
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
              <SetLine s={s} isTop={isTop} logType={logType} units={units} distUnit={distUnit} />
            </View>
          );
        })}
        </>
      )}
    </Card>
  );
}
