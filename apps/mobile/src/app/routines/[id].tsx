/**
 * Routine editor — rename, retype, add/reorder/tune/remove exercises, start or delete.
 * Phase 4: swap an exercise for good (one that fits the plan's equipment and sore areas),
 * and from the menu share the routine, move it to another folder, duplicate or delete it.
 *
 * Audit Phase 4: every save is awaited and a failed one says so, keeping the change on screen
 * with "Try again" (RP-15); a rename is saved when leaving the editor any way (RP-24); no 12-set
 * or 50-rep caps — an unusual number is asked about once (RP-23); each exercise keeps its
 * warm-up sets, its rest in this routine, a superset with the next one and a note (RP-19); a
 * duplicate asks where it goes (RP-08).
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  Badge,
  Chip,
  EmptyState,
  GhostButton,
  Icon,
  IconButton,
  LoadError,
  PrimaryButton,
  Screen,
  Skeleton,
  askConfirm,
} from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { START_FAILED, runGuarded } from '@/lib/guardedAction';
import { goBack } from '@/lib/goBack';
import { tap } from '@/lib/haptics';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';
import type { DayType } from '@/types/models';

import { FolderPickerSheet } from '@/tracker/components/FolderPickerSheet';
import { RestPickerSheet } from '@/tracker/components/RestPickerSheet';
import { ShareRoutineSheet } from '@/tracker/components/ShareRoutineSheet';
import { SwapSheet } from '@/tracker/components/SwapSheet';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import { exerciseIdsForKeys, folderOfRoutine, listFolders, moveRoutine, type Folder, type RoutineFull } from '@/tracker/db/folderRepo';
import {
  ROUTINE_DAY_TYPES,
  deleteRoutine,
  duplicateRoutine,
  getRoutine,
  removeRoutineExercise,
  reorderRoutineExercises,
  replaceRoutineExercise,
  updateRoutine,
  updateRoutineExercise,
  type RoutineExercisePatch,
} from '@/tracker/db/routineRepo';
import { getTrackerExercisesByIds } from '@/tracker/db/exerciseInfo';
import { hasReps, type LogType } from '@/tracker/engine/logTypes';
import { alternativesFor, type Alternative } from '@/tracker/plans/builder';
import { ROUTINE_NAME_MAX } from '@/tracker/plans/routineFile';
import {
  MAX_ROUTINE_REPS,
  MAX_ROUTINE_SETS,
  USUAL_MAX_REPS,
  USUAL_MAX_SETS,
  setsOf,
  withWarmups,
} from '@/tracker/plans/routineSets';
import { DEFAULT_REST_SEC, fmtRest } from '@/tracker/services/restRules';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { swapContextFor } from '@/tracker/services/plansService';
import { askAboutOpenWorkout, showActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { tell } from '@/lib/tell';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export default function RoutineEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startFromPlanDay = useActiveWorkout((s) => s.startFromPlanDay);
  const starting = useRef(false);

  const [routine, setRoutine] = useState<RoutineFull | null>(null);
  const [loading, setLoading] = useState(true);
  // RP-13: a failed read says "Couldn't load this routine", not "Routine not found".
  const [loadFailed, setLoadFailed] = useState(false);
  // A failed Start says so under the button, which works again (no pop-up).
  const [startError, setStartError] = useState<string | null>(null);
  const [name, setName] = useState('');
  /** Phase 2: how each exercise is logged — timed and distance rows have no rep range. */
  const [logTypes, setLogTypes] = useState<Map<string, LogType>>(new Map());
  /** Phase 4: each exercise's library key (null for the member's own) — only library ones swap. */
  const [catalogKeys, setCatalogKeys] = useState<Map<string, string | null>>(new Map());
  const [folderName, setFolderName] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [moveTo, setMoveTo] = useState<Folder[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [swapping, setSwapping] = useState<{ peId: string; name: string; options: Alternative[] } | null>(null);
  /** RP-15: the last change that could not be saved (still on screen), and its retry. */
  const [saveError, setSaveError] = useState<{ retry: () => void } | null>(null);
  /** RP-08: Duplicate asks where the copy goes. */
  const [dupTo, setDupTo] = useState<Folder[] | null>(null);
  /** RP-19: the exercise whose rest in this routine is being picked. */
  const [restFor, setRestFor] = useState<string | null>(null);
  /** Notes being typed, by routine row (saved when the field is left). */
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Seed the name field once per routine id — refocus (e.g. returning from
  // Add-exercise) must NOT clobber an in-progress, not-yet-committed rename.
  // Keyed by id so a duplicate (router.replace to a new id) reseeds correctly.
  const seededId = useRef<string | null>(null);

  const reload = useCallback(() => {
    let alive = true;
    if (id) {
      getRoutine(id)
        .then((r) => {
          if (!alive) return;
          setRoutine(r);
          if (r && seededId.current !== r.id) {
            setName(r.name);
            seededId.current = r.id;
          }
          setLoading(false);
          setLoadFailed(false);
          if (r) {
            void getTrackerExercisesByIds(r.exercises.map((pe) => pe.exerciseId))
              .then((infos) => {
                if (!alive) return;
                setLogTypes(new Map([...infos].map(([k, v]) => [k, v.logType])));
                setCatalogKeys(new Map([...infos].map(([k, v]) => [k, v.catalogKey])));
              })
              .catch(() => undefined);
            void folderOfRoutine(r.id)
              .then((f) => {
                if (alive) setFolderName(f?.name ?? null);
              })
              .catch(() => undefined);
          }
        })
        .catch(() => {
          if (!alive) return;
          setLoading(false);
          setLoadFailed(true);
        });
    } else {
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [id]);

  useFocusEffect(reload);

  /** RP-15: run a save; a failure says so and keeps the change on screen, with Try again. */
  const save = (job: () => Promise<void>): void => {
    setSaveError(null);
    job().catch(() => setSaveError({ retry: () => save(job) }));
  };

  // RP-24: a rename still in the field is saved however the editor is left (back gesture,
  // Android back, a tab switch) — not only through Close.
  const pendingName = useRef<{ typed: string; saved: string | null }>({ typed: '', saved: null });
  pendingName.current = { typed: name, saved: routine?.name ?? null };
  useEffect(
    () => () => {
      const { typed, saved } = pendingName.current;
      const trimmed = typed.trim();
      if (id && saved != null && trimmed && trimmed !== saved) void updateRoutine(id, { name: trimmed }).catch(() => undefined);
    },
    [id],
  );

  const retryLoad = (): void => {
    setLoadFailed(false);
    setLoading(true);
    reload();
  };

  if (!id) {
    return (
      <Screen title="Routine">
        <EmptyState icon="dumbbell" title="Routine not found" body="This routine may have been deleted." />
      </Screen>
    );
  }

  const commitName = (): void => {
    const trimmed = name.trim() || 'Routine';
    if (routine && trimmed !== routine.name) {
      setRoutine({ ...routine, name: trimmed });
      save(() => updateRoutine(id, { name: trimmed }));
    }
    if (trimmed !== name) setName(trimmed);
  };

  const onDayType = (dayType: DayType): void => {
    if (!routine || dayType === routine.dayType) return;
    setRoutine({ ...routine, dayType });
    save(() => updateRoutine(id, { dayType }));
  };

  const patchExercise = (peId: string, patch: RoutineExercisePatch): void => {
    if (!routine) return;
    setRoutine({
      ...routine,
      exercises: routine.exercises.map((pe) => {
        if (pe.id !== peId) return pe;
        const next = { ...pe };
        if (patch.sets !== undefined) {
          next.sets = patch.sets;
          next.targetSets = patch.sets ? Math.max(1, setsOf({ targetSets: 1, sets: patch.sets }).filter((x) => x.type === 'normal' || x.type === 'failure').length) : pe.targetSets;
        }
        if (patch.targetSets != null) next.targetSets = patch.targetSets;
        if (patch.repRangeMin != null) next.repRangeMin = patch.repRangeMin;
        if (patch.repRangeMax != null) next.repRangeMax = patch.repRangeMax;
        if (patch.restSec !== undefined) next.restSec = patch.restSec;
        if (patch.supersetGroup !== undefined) next.supersetGroup = patch.supersetGroup;
        if (patch.note !== undefined) next.note = patch.note;
        return next;
      }),
    });
    save(() => updateRoutineExercise(peId, patch));
  };

  /** RP-23: no caps, but an unusual number is asked about once. */
  const patchCounted = async (peId: string, kind: 'sets' | 'reps', from: number, to: number, patch: RoutineExercisePatch): Promise<void> => {
    const usual = kind === 'sets' ? USUAL_MAX_SETS : USUAL_MAX_REPS;
    if (to > usual && from <= usual) {
      const ok = await askConfirm({
        title: kind === 'sets' ? `${to} sets?` : `${to} reps?`,
        body: kind === 'sets' ? 'That is more sets than most routines use.' : 'That is more reps than most sets use.',
        confirmLabel: kind === 'sets' ? `Keep ${to} sets` : `Keep ${to} reps`,
      });
      if (!ok) return;
    }
    patchExercise(peId, patch);
  };

  /** RP-19: superset with the next exercise (or out of it). */
  const toggleSuperset = (index: number): void => {
    if (!routine) return;
    const pe = routine.exercises[index];
    const next = routine.exercises[index + 1];
    if (!pe || !next) return;
    if (pe.supersetGroup != null && pe.supersetGroup === next.supersetGroup) {
      // Out: this one leaves the group (the rest stay together when two or more remain).
      patchExercise(pe.id, { supersetGroup: null });
      return;
    }
    const used = routine.exercises.map((x) => x.supersetGroup ?? 0);
    const group = pe.supersetGroup ?? next.supersetGroup ?? Math.max(0, ...used) + 1;
    setRoutine({
      ...routine,
      exercises: routine.exercises.map((x) => (x.id === pe.id || x.id === next.id ? { ...x, supersetGroup: group } : x)),
    });
    save(async () => {
      await updateRoutineExercise(pe.id, { supersetGroup: group });
      await updateRoutineExercise(next.id, { supersetGroup: group });
    });
  };

  const onRemove = (peId: string, exName: string): void => {
    void askConfirm({ title: 'Remove exercise?', body: `Remove ${exName} from this routine.`, confirmLabel: 'Remove', destructive: true }).then((ok) => {
      if (!ok || !routine) return;
      // RP-15: removed from the screen only once it is removed for real.
      removeRoutineExercise(peId)
        .then(() => setRoutine((r) => (r ? { ...r, exercises: r.exercises.filter((pe) => pe.id !== peId) } : r)))
        .catch(() => void tell('Could not remove', `${exName} is still in the routine. Please try again.`));
    });
  };

  const onMove = (index: number, dir: -1 | 1): void => {
    if (!routine) return;
    const next = index + dir;
    if (next < 0 || next >= routine.exercises.length) return;
    const reordered = [...routine.exercises];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    tap();
    setRoutine({ ...routine, exercises: reordered });
    void reorderRoutineExercises(id, reordered.map((pe) => pe.id)).catch(() => reload());
  };

  const onDelete = (): void => {
    void askConfirm({
      title: 'Delete routine?',
      body: 'This removes the routine and its exercise list. History is unaffected.',
      confirmLabel: 'Delete',
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      void deleteRoutine(id)
        .then(() => router.back())
        .catch(() => void tell('Delete failed', 'Could not delete this routine. Please try again.'));
    });
  };

  /** RP-08: the copy goes where the member picks ("My routines" first, the plan last). */
  const onDuplicate = (): void => {
    void listFolders()
      .then(setDupTo)
      .catch(() => void tell('Could not load folders', 'Please try again.'));
  };

  const onDuplicateTo = (folderId: string | null): void => {
    setDupTo(null);
    commitName();
    setTimeout(() => {
      void duplicateRoutine(id, folderId)
        .then((newId) => router.replace(`/routines/${newId}`))
        .catch(() => void tell('Duplicate failed', 'Could not duplicate this routine. Please try again.'));
    }, 260);
  };

  // Two RN Modals swapping in the same frame can drop the second on Android.
  const after = (fn: () => void): void => {
    setMenu(false);
    setTimeout(fn, 260);
  };

  /** Swap for good: the choices fit this routine's plan (equipment, sore areas, "never" list). */
  const onSwap = async (peId: string): Promise<void> => {
    const pe = routine?.exercises.find((x) => x.id === peId);
    const key = pe ? catalogKeys.get(pe.exerciseId) : null;
    if (!routine || !pe || !key) return;
    const ctx = await swapContextFor(id).catch(() => null);
    const exclude = routine.exercises.flatMap((x) => {
      const k = catalogKeys.get(x.exerciseId);
      return k ? [k] : [];
    });
    setSwapping({
      peId,
      name: pe.exercise.name,
      options: alternativesFor(key, {
        level: ctx?.level ?? 'intermediate',
        exclude,
        equipment: ctx?.equipment ?? 'gym',
        sore: ctx?.sore ?? [],
        avoid: ctx?.avoid ?? [],
      }),
    });
  };

  const onPickSwap = async (a: Alternative): Promise<void> => {
    const w = swapping;
    setSwapping(null);
    if (!w) return;
    try {
      const exerciseId = (await exerciseIdsForKeys([a.key])).get(a.key);
      if (!exerciseId) throw new Error('not in library');
      await replaceRoutineExercise(w.peId, exerciseId);
      reload();
    } catch {
      void tell('Could not swap', 'Please try again.');
    }
  };

  const onMoveMenu = (): void => {
    after(() => {
      void listFolders()
        .then((all) => {
          const others = all.filter((f) => !f.routines.some((r) => r.id === id));
          if (others.length === 0) void tell('No other folder', 'Make a folder on the Routines screen first.');
          else setMoveTo(others);
        })
        .catch(() => void tell('Could not load folders', 'Please try again.'));
    });
  };

  const onMoveTo = (f: Folder): void => {
    setMoveTo(null);
    void moveRoutine(id, f.id)
      .then(() => setFolderName(f.name))
      .catch(() => void tell('Could not move', 'Please try again.'));
  };

  const onStart = async (): Promise<void> => {
    commitName(); // RP-24: a pending rename is saved before the workout opens
    await runGuarded(
      starting,
      async () => {
        setStartError(null);
        await hydrate();
        // LW-24: a workout already open is never a dead end: Resume it, or discard it and start this.
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

  return (
    <Screen
      scroll={false}
      title="Edit routine"
      subtitle={routine ? (folderName ? `${dayTypeLabel(routine.dayType)} · ${folderName}` : dayTypeLabel(routine.dayType)) : undefined}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {routine ? (
            <Pressable
              onPress={() => setMenu(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="More for this routine"
              style={{
                width: 42,
                height: 42,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: color.surfaceRaised,
                borderWidth: 1,
                borderColor: color.border,
              }}
            >
              <Glyph name="more" size={20} color={color.inkSecondary} />
            </Pressable>
          ) : null}
        </View>
      }
      onBack={() => {
        commitName(); // RP-24
        goBack(router, '/workout');
      }}
    >
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={64} radius={radius.lg} />
          <Skeleton width="100%" height={120} radius={radius.lg} />
        </View>
      ) : !routine && loadFailed ? (
        <LoadError what="this routine" onRetry={retryLoad} />
      ) : !routine ? (
        <EmptyState icon="dumbbell" title="Routine not found" body="This routine may have been deleted." />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: space.lg, paddingBottom: space.xxl }}
        >
          {/* RP-15: a change that could not be saved stays on screen with Try again */}
          {saveError ? (
            <View style={{ gap: space.sm }}>
              <InlineError message="Couldn't save your last change. It is still shown here." />
              <GhostButton label="Try again" onPress={saveError.retry} />
            </View>
          ) : null}

          {/* name */}
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={ROUTINE_NAME_MAX}
            onEndEditing={commitName}
            onBlur={commitName}
            placeholder="Routine name"
            placeholderTextColor={color.inkMuted}
            returnKeyType="done"
            style={{
              height: 52,
              paddingHorizontal: space.md,
              borderRadius: radius.md,
              backgroundColor: color.surfaceSunken,
              borderWidth: 1,
              borderColor: color.border,
              fontFamily: type.heading,
              fontSize: type.size.h3,
              color: color.ink,
            }}
          />

          {/* day type */}
          <View style={{ gap: space.sm }}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 0.4 }}>
              DAY TYPE
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {ROUTINE_DAY_TYPES.map((dt) => (
                <Chip
                  key={dt}
                  label={dayTypeLabel(dt)}
                  selected={routine.dayType === dt}
                  onPress={() => onDayType(dt)}
                />
              ))}
            </View>
          </View>

          {/* exercises */}
          {routine.exercises.length === 0 ? (
            <EmptyState
              icon="dumbbell"
              title="No exercises yet"
              body="Add exercises to build this routine."
            />
          ) : (
            <View style={{ gap: space.md }}>
              {routine.exercises.map((pe, index) => (
                <View
                  key={pe.id}
                  style={{
                    backgroundColor: color.surface,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: color.border,
                    padding: space.lg,
                    gap: space.md,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.ink }}
                      >
                        {pe.exercise.name}
                      </Text>
                      <View style={{ marginTop: 4, flexDirection: 'row' }}>
                        <Badge label={cap(pe.exercise.muscleGroup)} tone="neutral" />
                      </View>
                    </View>
                    <MoveBtn
                      dir="up"
                      disabled={index === 0}
                      onPress={() => onMove(index, -1)}
                    />
                    <MoveBtn
                      dir="down"
                      disabled={index === routine.exercises.length - 1}
                      onPress={() => onMove(index, 1)}
                    />
                    {catalogKeys.get(pe.exerciseId) ? (
                      <Pressable
                        onPress={() => void onSwap(pe.id)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Swap ${pe.exercise.name}`}
                        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Glyph name="swap" size={18} color={color.accent} />
                      </Pressable>
                    ) : null}
                    <IconButton
                      icon="trash"
                      size={30}
                      tint={color.inkMuted}
                      onPress={() => onRemove(pe.id, pe.exercise.name)}
                      accessibilityLabel={`Remove ${pe.exercise.name}`}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: space.lg }}>
                    <Stepper
                      label="Sets"
                      value={pe.targetSets}
                      onChange={(v) => void patchCounted(pe.id, 'sets', pe.targetSets, clamp(v, 1, MAX_ROUTINE_SETS), { targetSets: clamp(v, 1, MAX_ROUTINE_SETS) })}
                      min={1}
                      max={MAX_ROUTINE_SETS}
                    />
                    {hasReps(logTypes.get(pe.exerciseId) ?? 'weight_reps') ? (
                      <>
                        <Stepper
                          label="Rep min"
                          value={pe.repRangeMin}
                          onChange={(v) =>
                            void patchCounted(pe.id, 'reps', pe.repRangeMax, Math.max(pe.repRangeMax, clamp(v, 1, MAX_ROUTINE_REPS)), {
                              repRangeMin: clamp(v, 1, MAX_ROUTINE_REPS),
                              repRangeMax: Math.max(pe.repRangeMax, clamp(v, 1, MAX_ROUTINE_REPS)),
                            })
                          }
                          min={1}
                          max={MAX_ROUTINE_REPS}
                        />
                        <Stepper
                          label="Rep max"
                          value={pe.repRangeMax}
                          onChange={(v) =>
                            void patchCounted(pe.id, 'reps', pe.repRangeMax, clamp(v, pe.repRangeMin, MAX_ROUTINE_REPS), {
                              repRangeMax: clamp(v, pe.repRangeMin, MAX_ROUTINE_REPS),
                            })
                          }
                          min={pe.repRangeMin}
                          max={MAX_ROUTINE_REPS}
                        />
                      </>
                    ) : (
                      <Text
                        style={{
                          flex: 1,
                          alignSelf: 'center',
                          fontFamily: type.body,
                          fontSize: type.size.caption,
                          color: color.inkMuted,
                        }}
                      >
                        {logTypes.get(pe.exerciseId) === 'time'
                          ? 'Timed: the hold time grows from your last workouts.'
                          : 'Distance: log how far, and how long.'}
                      </Text>
                    )}
                  </View>

                  {/* RP-19: warm-ups, this routine's rest, a superset with the next, a note */}
                  <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-end' }}>
                    <Stepper
                      label="Warm-up sets"
                      value={setsOf(pe).filter((x) => x.type === 'warmup').length}
                      onChange={(v) => patchExercise(pe.id, { sets: withWarmups(setsOf(pe), clamp(v, 0, 10)) })}
                      min={0}
                      max={10}
                    />
                    <Pressable
                      onPress={() => setRestFor(pe.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Rest for ${pe.exercise.name}: ${pe.restSec != null ? fmtRest(pe.restSec) : 'the exercise\'s own'}`}
                      style={{ flex: 1, gap: 4 }}
                    >
                      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 0.4 }}>REST</Text>
                      <View
                        style={{
                          height: 48,
                          borderRadius: radius.sm,
                          backgroundColor: color.surfaceSunken,
                          borderWidth: 1,
                          borderColor: color.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: pe.restSec != null ? color.ink : color.inkMuted }}>
                          {pe.restSec != null ? fmtRest(pe.restSec) : 'Usual'}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                  {index < routine.exercises.length - 1 ? (
                    <View style={{ flexDirection: 'row' }}>
                      <Chip
                        label={pe.supersetGroup != null && pe.supersetGroup === routine.exercises[index + 1].supersetGroup ? 'Superset with next' : 'Superset with next'}
                        selected={pe.supersetGroup != null && pe.supersetGroup === routine.exercises[index + 1].supersetGroup}
                        onPress={() => toggleSuperset(index)}
                      />
                    </View>
                  ) : null}
                  <TextInput
                    value={notes[pe.id] ?? pe.note ?? ''}
                    onChangeText={(t) => setNotes((n) => ({ ...n, [pe.id]: t }))}
                    onBlur={() => {
                      const typed = notes[pe.id];
                      if (typed == null || typed.trim() === (pe.note ?? '')) return;
                      patchExercise(pe.id, { note: typed.trim() || null });
                    }}
                    placeholder="Note (optional)"
                    placeholderTextColor={color.inkFaint}
                    accessibilityLabel={`Note for ${pe.exercise.name}`}
                    maxLength={500}
                    multiline
                    style={{
                      minHeight: 48,
                      paddingHorizontal: space.md,
                      paddingVertical: space.sm,
                      borderRadius: radius.sm,
                      backgroundColor: color.surfaceSunken,
                      borderWidth: 1,
                      borderColor: color.border,
                      fontFamily: type.body,
                      fontSize: type.size.sub,
                      color: color.ink,
                    }}
                  />
                </View>
              ))}
            </View>
          )}

          <GhostButton
            label="Add exercise"
            icon="plus"
            onPress={() => {
              commitName(); // persist a pending rename before we leave the field
              router.push(`/routines/add-exercise?dayId=${id}`);
            }}
          />

          <View style={{ gap: space.md, marginTop: space.sm }}>
            <PrimaryButton
              label="Start routine"
              icon="dumbbell"
              disabled={routine.exercises.length === 0}
              onPress={() => void onStart()}
            />
            <InlineError message={startError} />
          </View>
        </ScrollView>
      )}

      {/* the routine's menu */}
      <TrackerSheet visible={menu} title={routine?.name ?? 'Routine'} onClose={() => setMenu(false)}>
        <View style={{ gap: 2 }}>
          {routine && routine.exercises.length > 0 ? (
            <SheetRow label="Share routine" leading={<Icon name="send" size={18} color={color.accent} />} onPress={() => after(() => setSharing(true))} />
          ) : null}
          <SheetRow label="Move to folder" leading={<Glyph name="list" size={18} color={color.accent} />} onPress={onMoveMenu} />
          <SheetRow label="Duplicate routine" leading={<Icon name="plus" size={18} color={color.accent} />} onPress={() => after(onDuplicate)} />
          <SheetRow label="Delete routine" danger leading={<Glyph name="trash" size={18} color={color.criticalText} />} onPress={() => after(onDelete)} />
        </View>
      </TrackerSheet>

      {/* move: every other folder, with its routine count */}
      <TrackerSheet visible={moveTo != null} title="Move to folder" onClose={() => setMoveTo(null)}>
        {/* Many folders on a small phone: the list scrolls inside the sheet. */}
        <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled contentContainerStyle={{ gap: 2 }}>
          {(moveTo ?? []).map((f) => (
            <SheetRow
              key={f.id}
              label={f.name}
              value={f.following ? `Your plan · ${countWord(f.routines.length, 'routine')}` : countWord(f.routines.length, 'routine')}
              leading={<Glyph name="list" size={18} color={color.accent} />}
              onPress={() => onMoveTo(f)}
            />
          ))}
        </ScrollView>
      </TrackerSheet>

      <SwapSheet
        visible={swapping != null}
        name={swapping?.name ?? ''}
        options={swapping?.options ?? []}
        note="In this routine from now on. Your sets and reps stay."
        onClose={() => setSwapping(null)}
        onPick={(a) => void onPickSwap(a)}
      />

      <FolderPickerSheet
        visible={dupTo != null}
        title="Where should the copy go?"
        folders={dupTo ?? []}
        onClose={() => setDupTo(null)}
        onPick={onDuplicateTo}
      />

      <RestPickerSheet
        visible={restFor != null}
        title="Rest in this routine"
        subtitle={routine?.exercises.find((x) => x.id === restFor)?.exercise.name}
        value={routine?.exercises.find((x) => x.id === restFor)?.restSec ?? null}
        defaultSec={DEFAULT_REST_SEC}
        onClose={() => setRestFor(null)}
        onChoose={(sec) => {
          const peId = restFor;
          setRestFor(null);
          if (peId) patchExercise(peId, { restSec: sec });
        }}
      />

      <ShareRoutineSheet visible={sharing} folder={null} routines={routine ? [routine] : []} onClose={() => setSharing(false)} />
    </Screen>
  );
}

/** Up/down reorder button — the Icon set has no vertical chevron, so rotate the horizontal one. */
function MoveBtn({ dir, disabled, onPress }: { dir: 'up' | 'down'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={dir === 'up' ? 'Move up' : 'Move down'}
      style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ transform: [{ rotate: dir === 'up' ? '-90deg' : '90deg' }] }}>
        <Icon name="chevron-right" size={20} color={disabled ? color.inkDisabled : color.inkMuted} />
      </View>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 0.4 }}>
        {label.toUpperCase()}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 40,
          borderRadius: radius.sm,
          backgroundColor: color.surfaceSunken,
          borderWidth: 1,
          borderColor: color.border,
          paddingHorizontal: space.xs,
        }}
      >
        <StepBtn glyph="−" disabled={value <= min} onPress={() => onChange(value - 1)} label={`Decrease ${label}`} />
        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>{value}</Text>
        <StepBtn glyph="+" disabled={value >= max} onPress={() => onChange(value + 1)} label={`Increase ${label}`} />
      </View>
    </View>
  );
}

function StepBtn({
  glyph,
  onPress,
  disabled,
  label,
}: {
  glyph: string;
  onPress: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPressIn={() => {
        if (!disabled) tap();
      }}
      onPress={() => {
        if (!disabled) onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text
        style={{
          fontFamily: type.monoBold,
          fontSize: type.size.h3,
          color: disabled ? color.inkDisabled : color.accent,
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}
