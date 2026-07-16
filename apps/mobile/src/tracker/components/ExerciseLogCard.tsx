/** One exercise inside the active workout: header, set-table, warm-up + plate tools. */
import { memo, useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Badge, GhostButton, Icon, IconButton } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { trimNum } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';
import type { OverloadTarget } from '@/types/models';

import { supersetLabel } from '../lib/superset';
import { computeWarmups } from '../services/warmupMath';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import type { DraftExercise } from '../store/activeWorkoutStore';
import { PlateCalcSheet } from './PlateCalcSheet';
import { SetRow } from './SetRow';
import { SupersetSheet } from './SupersetSheet';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

// Same action → badge mapping as the Coach tab's WorkoutPlanCard (consistent voice).
const ACTION_BADGE: Record<OverloadTarget['action'], { label: string; tone: BadgeProps['tone'] }> = {
  increase: { label: 'Progress', tone: 'accent' },
  hold: { label: 'Hold', tone: 'neutral' },
  deload: { label: 'Deload', tone: 'warn' },
  start: { label: 'Start', tone: 'good' },
};

const repRange = (min: number, max: number): string => (min === max ? `${min}` : `${min}–${max}`);

/**
 * Memoised: the store rebuilds only the edited exercise (`list.map(e => e.key === exKey
 * ? {...e} : e)`), so editing one card leaves the other five with identical props and they
 * skip reconciliation entirely. This only holds while the caller keeps `existingGroups`
 * and `target` referentially stable (active.tsx memoises the array and reads `target` from
 * a state-held Map) — a freshly-allocated prop would silently make this a no-op.
 */
export const ExerciseLogCard = memo(function ExerciseLogCard({
  exercise,
  existingGroups,
  target,
}: {
  exercise: DraftExercise;
  /** Distinct superset groups in the whole workout (for the chooser). */
  existingGroups: number[];
  /** Progressive-overload prescription for this exercise (Phase C1); null when
   *  the exercise isn't part of the plan day (Start-Empty / ad-hoc add). */
  target?: OverloadTarget | null;
}) {
  const addSet = useActiveWorkout((s) => s.addSet);
  const removeExercise = useActiveWorkout((s) => s.removeExercise);
  const insertWarmupSets = useActiveWorkout((s) => s.insertWarmupSets);
  const setSupersetGroup = useActiveWorkout((s) => s.setSupersetGroup);
  const setExerciseNote = useActiveWorkout((s) => s.setExerciseNote);
  const [showPlates, setShowPlates] = useState(false);
  const [showSuperset, setShowSuperset] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const group = exercise.supersetGroup ?? null;
  const otherGroups = existingGroups.filter((g) => g !== group);
  const nextGroup = (existingGroups.length > 0 ? Math.max(...existingGroups) : 0) + 1;

  // Per-exercise note — local text state (push to store), synced back on external change.
  const [noteText, setNoteText] = useState(exercise.note ?? '');
  const [noteOpen, setNoteOpen] = useState(!!exercise.note?.trim());
  useEffect(() => {
    if ((exercise.note ?? '') !== noteText) setNoteText(exercise.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.note]);

  // Working weight = first entered working set, else last session's first working set.
  const firstWorking = exercise.sets.find((s) => !s.isWarmup && s.weightKg != null);
  const workingWeight = firstWorking?.weightKg ?? exercise.previousSets[0]?.weightKg ?? null;

  const confirmRemove = (): void => {
    Alert.alert('Remove exercise?', `Remove ${exercise.name} and its sets from this workout.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeExercise(exercise.key) },
    ]);
  };

  const onWarmup = (): void => {
    if (workingWeight == null || workingWeight <= 0) {
      Alert.alert('Set a working weight first', 'Enter a weight on a working set, then add warm-up sets.');
      return;
    }
    const rows = computeWarmups(workingWeight, exercise.incrementKg ?? 2.5);
    if (rows.length > 0) insertWarmupSets(exercise.key, rows);
  };

  const onNote = (t: string): void => {
    setNoteText(t);
    setExerciseNote(exercise.key, t);
  };

  let working = 0;
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: color.border,
        borderLeftWidth: group != null ? 3 : 1,
        borderLeftColor: group != null ? color.accent : color.border,
        padding: space.lg,
        gap: space.sm,
      }}
    >
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}
          >
            {exercise.name}
          </Text>
          <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Badge label={cap(exercise.muscleGroup)} tone="accent" />
            {group != null ? (
              <Pressable onPress={() => setShowSuperset(true)} accessibilityRole="button" accessibilityLabel="Edit superset">
                <Badge label={`Superset ${supersetLabel(group)}`} tone="neutral" />
              </Pressable>
            ) : null}
          </View>
        </View>
        {exercise.equipment === 'barbell' ? (
          <IconButton
            icon="scale"
            size={34}
            tint={color.accent}
            onPress={() => setShowPlates(true)}
            accessibilityLabel="Plate calculator"
          />
        ) : null}
        <IconButton
          icon="close"
          size={34}
          tint={color.inkMuted}
          onPress={confirmRemove}
          accessibilityLabel={`Remove ${exercise.name}`}
        />
      </View>

      {/* per-exercise note */}
      {noteOpen ? (
        <TextInput
          value={noteText}
          onChangeText={onNote}
          placeholder="Note for this exercise…"
          placeholderTextColor={color.inkFaint}
          multiline
          style={{
            minHeight: 38,
            borderRadius: radius.sm,
            backgroundColor: color.surfaceSunken,
            borderWidth: 1,
            borderColor: color.border,
            paddingHorizontal: space.md,
            paddingTop: 8,
            paddingBottom: 8,
            fontFamily: type.body,
            fontSize: type.size.sub,
            color: color.ink,
          }}
        />
      ) : null}

      {/* coach target (Phase C1) — inline prescription, tap for the why */}
      {target ? (
        <Pressable
          onPress={() => setShowWhy((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Coach target ${trimNum(target.targetWeightKg)} kg by ${repRange(
            target.targetRepsMin,
            target.targetRepsMax,
          )} reps. Tap for why.`}
          style={{
            gap: 4,
            borderRadius: radius.sm,
            backgroundColor: color.surfaceSunken,
            borderWidth: 1,
            borderColor: color.border,
            paddingHorizontal: space.md,
            paddingVertical: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Icon name="target" size={14} color={color.accentBright} />
            <Text
              style={{
                flex: 1,
                fontFamily: type.bodySemi,
                fontSize: type.size.sub,
                color: color.accentBright,
              }}
              numberOfLines={1}
            >
              {`Target ${trimNum(target.targetWeightKg)} kg × ${repRange(
                target.targetRepsMin,
                target.targetRepsMax,
              )}`}
            </Text>
            <Badge label={ACTION_BADGE[target.action].label} tone={ACTION_BADGE[target.action].tone} />
            <Icon name="chevron-right" size={14} color={showWhy ? color.accent : color.inkMuted} />
          </View>
          {showWhy && target.reason ? (
            <Text
              style={{
                fontFamily: type.body,
                fontSize: type.size.sub,
                fontStyle: 'italic',
                color: color.inkSecondary,
                lineHeight: 18,
              }}
            >
              {target.reason}
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      {/* column header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs }}>
        <Text style={[colHead, { width: 34, textAlign: 'center' }]}>SET</Text>
        <Text style={[colHead, { width: 74 }]}>PREV</Text>
        <Text style={[colHead, { flex: 1, textAlign: 'center' }]}>KG</Text>
        <Text style={[colHead, { flex: 1, textAlign: 'center' }]}>REPS</Text>
        <View style={{ width: 34 }} />
      </View>

      {exercise.sets.map((s) => {
        // PREVIOUS aligns by WORKING-set ordinal (previousSets excludes warm-ups),
        // matching prevForSet() in the store so display + auto-fill agree.
        let label: string;
        let previous: { weightKg: number; reps: number } | null;
        if (s.isWarmup) {
          label = 'W';
          previous = null;
        } else {
          previous = exercise.previousSets[working] ?? null;
          label = String(working + 1);
          working += 1;
        }
        return (
          <SetRow key={s.key} exKey={exercise.key} set={s} label={label} previous={previous} />
        );
      })}

      <View style={{ marginTop: space.xs, flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <GhostButton label="Add set" icon="plus" onPress={() => addSet(exercise.key)} />
        </View>
        <View style={{ flex: 1 }}>
          <GhostButton label="Warm-up" icon="flame" onPress={onWarmup} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <GhostButton
            label={group != null ? `Superset ${supersetLabel(group)}` : 'Superset'}
            icon="zap"
            onPress={() => setShowSuperset(true)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <GhostButton
            label={noteOpen ? 'Hide note' : 'Add note'}
            icon="chat"
            onPress={() => setNoteOpen((o) => !o)}
          />
        </View>
      </View>

      <PlateCalcSheet
        visible={showPlates}
        initialKg={workingWeight ?? 0}
        onClose={() => setShowPlates(false)}
      />
      <SupersetSheet
        visible={showSuperset}
        currentGroup={group}
        otherGroups={otherGroups}
        nextGroup={nextGroup}
        onChoose={(g) => {
          setSupersetGroup(exercise.key, g);
          setShowSuperset(false);
        }}
        onClose={() => setShowSuperset(false)}
      />
    </View>
  );
});

const colHead = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 0.4,
} as const;
