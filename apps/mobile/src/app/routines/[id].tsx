/**
 * Routine editor — rename, retype, add/reorder/tune/remove exercises, start or delete.
 * Phase 4: swap an exercise for good (one that fits the plan's equipment and sore areas),
 * and from the menu share the routine, move it to another folder, duplicate or delete it.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  Badge,
  Chip,
  EmptyState,
  GhostButton,
  Icon,
  IconButton,
  PrimaryButton,
  Screen,
  Skeleton,
} from '@/components/ui';
import type { PlanDayFull } from '@/db/repos/planRepo';
import { tap } from '@/lib/haptics';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';
import type { DayType } from '@/types/models';

import { ShareRoutineSheet } from '@/tracker/components/ShareRoutineSheet';
import { SwapSheet } from '@/tracker/components/SwapSheet';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import { exerciseIdsForKeys, folderOfRoutine, listFolders, moveRoutine, type Folder } from '@/tracker/db/folderRepo';
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
} from '@/tracker/db/routineRepo';
import { getTrackerExercisesByIds } from '@/tracker/db/exerciseInfo';
import { hasReps, type LogType } from '@/tracker/engine/logTypes';
import { alternativesFor, type Alternative } from '@/tracker/plans/builder';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { swapContextFor } from '@/tracker/services/plansService';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export default function RoutineEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const hydrate = useActiveWorkout((s) => s.hydrate);
  const startFromPlanDay = useActiveWorkout((s) => s.startFromPlanDay);
  const starting = useRef(false);

  const [routine, setRoutine] = useState<PlanDayFull | null>(null);
  const [loading, setLoading] = useState(true);
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
          if (alive) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [id]);

  useFocusEffect(reload);

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
      void updateRoutine(id, { name: trimmed });
      setRoutine({ ...routine, name: trimmed });
    }
    if (trimmed !== name) setName(trimmed);
  };

  const onDayType = (dayType: DayType): void => {
    if (!routine || dayType === routine.dayType) return;
    void updateRoutine(id, { dayType });
    setRoutine({ ...routine, dayType });
  };

  const patchExercise = (
    peId: string,
    patch: { targetSets?: number; repRangeMin?: number; repRangeMax?: number },
  ): void => {
    if (!routine) return;
    void updateRoutineExercise(peId, patch);
    setRoutine({
      ...routine,
      exercises: routine.exercises.map((pe) =>
        pe.id === peId
          ? {
              ...pe,
              targetSets: patch.targetSets ?? pe.targetSets,
              repRangeMin: patch.repRangeMin ?? pe.repRangeMin,
              repRangeMax: patch.repRangeMax ?? pe.repRangeMax,
            }
          : pe,
      ),
    });
  };

  const onRemove = (peId: string, exName: string): void => {
    Alert.alert('Remove exercise?', `Remove ${exName} from this routine.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (!routine) return;
          void removeRoutineExercise(peId);
          setRoutine({ ...routine, exercises: routine.exercises.filter((pe) => pe.id !== peId) });
        },
      },
    ]);
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
    Alert.alert('Delete routine?', 'This removes the routine and its exercise list. History is unaffected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteRoutine(id)
            .then(() => router.back())
            .catch(() => Alert.alert('Delete failed', 'Could not delete this routine. Please try again.'));
        },
      },
    ]);
  };

  const onDuplicate = (): void => {
    void duplicateRoutine(id)
      .then((newId) => router.replace(`/routines/${newId}`))
      .catch(() => Alert.alert('Duplicate failed', 'Could not duplicate this routine. Please try again.'));
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
      Alert.alert('Could not swap', 'Please try again.');
    }
  };

  const onMoveMenu = (): void => {
    after(() => {
      void listFolders()
        .then((all) => {
          const others = all.filter((f) => !f.routines.some((r) => r.id === id));
          if (others.length === 0) Alert.alert('No other folder', 'Make a folder on the Routines screen first.');
          else setMoveTo(others);
        })
        .catch(() => Alert.alert('Could not load folders', 'Please try again.'));
    });
  };

  const onMoveTo = (f: Folder): void => {
    setMoveTo(null);
    void moveRoutine(id, f.id)
      .then(() => setFolderName(f.name))
      .catch(() => Alert.alert('Could not move', 'Please try again.'));
  };

  const onStart = async (): Promise<void> => {
    if (starting.current) return;
    starting.current = true;
    await hydrate();
    if (useActiveWorkout.getState().active) {
      starting.current = false;
      Alert.alert('Finish your current workout first', 'You already have a workout in progress.');
      return;
    }
    try {
      await startFromPlanDay(id);
      router.replace('/session/active');
    } finally {
      starting.current = false;
    }
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
          <IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />
        </View>
      }
    >
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={64} radius={radius.lg} />
          <Skeleton width="100%" height={120} radius={radius.lg} />
        </View>
      ) : !routine ? (
        <EmptyState icon="dumbbell" title="Routine not found" body="This routine may have been deleted." />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: space.lg, paddingBottom: space.xxl }}
        >
          {/* name */}
          <TextInput
            value={name}
            onChangeText={setName}
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
                      icon="close"
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
                      onChange={(v) => patchExercise(pe.id, { targetSets: clamp(v, 1, 12) })}
                      min={1}
                      max={12}
                    />
                    {hasReps(logTypes.get(pe.exerciseId) ?? 'weight_reps') ? (
                      <>
                        <Stepper
                          label="Rep min"
                          value={pe.repRangeMin}
                          onChange={(v) =>
                            patchExercise(pe.id, {
                              repRangeMin: clamp(v, 1, 50),
                              repRangeMax: Math.max(pe.repRangeMax, clamp(v, 1, 50)),
                            })
                          }
                          min={1}
                          max={50}
                        />
                        <Stepper
                          label="Rep max"
                          value={pe.repRangeMax}
                          onChange={(v) =>
                            patchExercise(pe.id, { repRangeMax: clamp(v, pe.repRangeMin, 50) })
                          }
                          min={pe.repRangeMin}
                          max={50}
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
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 2 }}>
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
        <Icon name="chevron-right" size={20} color={disabled ? color.inkFaint : color.inkMuted} />
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
          color: disabled ? color.inkFaint : color.accent,
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}
