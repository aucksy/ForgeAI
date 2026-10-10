/**
 * A routine, read-only — audit Phase 4. Tapping a routine opens this calm preview (as in Hevy):
 * each exercise with its sets × reps, warm-ups and drop sets, its rest, superset and note; a big
 * Start at the bottom; Edit sits behind a button.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { EmptyState, GhostButton, LoadError, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { START_FAILED, runGuarded } from '@/lib/guardedAction';
import { goBack } from '@/lib/goBack';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';

import { showWU } from '@/tracker/components/unitText';
import { folderOfRoutine, type RoutineExercise, type RoutineFull } from '@/tracker/db/folderRepo';
import { getTrackerExercisesByIds } from '@/tracker/db/exerciseInfo';
import { getRoutine } from '@/tracker/db/routineRepo';
import { hasReps, type LogType } from '@/tracker/engine/logTypes';
import { setsOf, setsSummary } from '@/tracker/plans/routineSets';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { fmtRest } from '@/tracker/services/restRules';
import { askAboutOpenWorkout, showActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

/** "3 sets · 6–8 reps", with warm-ups / drops / failure sets and any per-set targets. */
function setsLine(pe: RoutineExercise, logType: LogType): string {
  const sets = setsOf(pe);
  const parts = [setsSummary(sets)];
  if (hasReps(logType)) parts.push(pe.repRangeMin === pe.repRangeMax ? `${pe.repRangeMin} reps` : `${pe.repRangeMin}–${pe.repRangeMax} reps`);
  return parts.join(' · ');
}

function targetsLine(pe: RoutineExercise): string | null {
  const t = (pe.sets ?? []).filter((s) => s.type !== 'warmup' && (s.reps != null || s.weightKg != null || s.durationSec != null));
  if (t.length === 0) return null;
  // Audit IM-12: a timed set copied from Hevy shows its time ("60 s", "1 min 30 s").
  const time = (sec: number): string => (sec < 60 ? `${sec} s` : sec % 60 === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)} min ${sec % 60} s`);
  return t
    .map((s) =>
      s.durationSec != null
        ? s.weightKg != null
          ? `${showWU(s.weightKg)} × ${time(s.durationSec)}`
          : time(s.durationSec)
        : s.weightKg != null && s.reps != null
          ? `${showWU(s.weightKg)} × ${s.reps}`
          : s.weightKg != null
            ? showWU(s.weightKg)
            : `${s.reps} reps`,
    )
    .join(', ');
}

export default function RoutinePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startFromPlanDay = useActiveWorkout((s) => s.startFromPlanDay);
  const starting = useRef(false);

  const [routine, setRoutine] = useState<RoutineFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [logTypes, setLogTypes] = useState<Map<string, LogType>>(new Map());

  const reload = useCallback(() => {
    let alive = true;
    if (!id) {
      setLoading(false);
      return () => undefined;
    }
    Promise.all([getRoutine(id), folderOfRoutine(id).catch(() => null)])
      .then(([r, f]) => {
        if (!alive) return;
        setRoutine(r);
        setFolderName(f ? (f.following ? `${f.name} (your plan)` : f.name) : null);
        setLoading(false);
        setLoadFailed(false);
        if (r) {
          void getTrackerExercisesByIds(r.exercises.map((pe) => pe.exerciseId))
            .then((infos) => {
              if (alive) setLogTypes(new Map([...infos].map(([k, v]) => [k, v.logType])));
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useFocusEffect(reload);

  const onStart = async (): Promise<void> => {
    if (!id) return;
    await runGuarded(
      starting,
      async () => {
        setStartError(null);
        await hydrate();
        if ((await askAboutOpenWorkout()) === 'resume') {
          showActiveWorkout(router);
          return 'left' as const;
        }
        await startFromPlanDay(id);
        showActiveWorkout(router);
        return 'left' as const;
      },
      () => setStartError(START_FAILED),
    );
  };

  const back = (): void => goBack(router, '/workout');

  if (loading) {
    return (
      <Screen title="Routine" onBack={back}>
        <View style={{ gap: space.md }}>
          <Skeleton width="100%" height={64} radius={radius.lg} />
          <Skeleton width="100%" height={160} radius={radius.lg} />
        </View>
      </Screen>
    );
  }
  if (!routine) {
    return (
      <Screen title="Routine" onBack={back}>
        {loadFailed ? (
          <LoadError what="this routine" onRetry={() => { setLoading(true); reload(); }} />
        ) : (
          <EmptyState icon="dumbbell" title="Routine not found" body="This routine may have been deleted." />
        )}
      </Screen>
    );
  }

  const facts = [dayTypeLabel(routine.dayType), countWord(routine.exercises.length, 'exercise'), folderName].filter(Boolean).join(' · ');

  return (
    <Screen scroll={false} title={routine.name} subtitle={facts} onBack={back}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}>
        {routine.exercises.length === 0 ? (
          <EmptyState icon="dumbbell" title="No exercises yet" body="Edit the routine to add exercises." />
        ) : (
          <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, overflow: 'hidden' }}>
            {routine.exercises.map((pe, i) => {
              const prev = routine.exercises[i - 1];
              const inSuperset = pe.supersetGroup != null && routine.exercises.filter((x) => x.supersetGroup === pe.supersetGroup).length > 1;
              const startsSuperset = inSuperset && prev?.supersetGroup !== pe.supersetGroup;
              const targets = targetsLine(pe);
              return (
                <View
                  key={pe.id}
                  style={{
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: color.border,
                    borderLeftWidth: inSuperset ? 3 : 0,
                    borderLeftColor: color.accent,
                    paddingVertical: space.md,
                    paddingHorizontal: space.md,
                    gap: 4,
                  }}
                >
                  {startsSuperset ? (
                    <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accent, letterSpacing: 0.4 }}>SUPERSET</Text>
                  ) : null}
                  <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.ink }}>{pe.exercise.name}</Text>
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
                    {setsLine(pe, logTypes.get(pe.exerciseId) ?? 'weight_reps')}
                    {pe.restSec != null ? ` · Rest ${fmtRest(pe.restSec)}` : ''}
                  </Text>
                  {targets ? (
                    <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>Targets: {targets}</Text>
                  ) : null}
                  {pe.note ? (
                    <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 18 }}>{pe.note}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        <GhostButton label="Edit routine" icon="settings" onPress={() => router.push(`/routines/${routine.id}`)} />
      </ScrollView>
      {/* the main button, pinned above the gesture bar */}
      <View style={{ gap: space.sm, paddingTop: space.sm, paddingBottom: space.md }}>
        <PrimaryButton label="Start routine" icon="dumbbell" disabled={routine.exercises.length === 0} onPress={() => void onStart()} />
        <InlineError message={startError} />
      </View>
    </Screen>
  );
}
