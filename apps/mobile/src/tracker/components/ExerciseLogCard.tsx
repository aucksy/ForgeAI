/** One exercise inside the active workout: header, set-table, warm-up + plate tools. */
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Badge, GhostButton, IconButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { computeWarmups } from '../services/warmupMath';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import type { DraftExercise } from '../store/activeWorkoutStore';
import { PlateCalcSheet } from './PlateCalcSheet';
import { SetRow } from './SetRow';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

export function ExerciseLogCard({ exercise }: { exercise: DraftExercise }) {
  const addSet = useActiveWorkout((s) => s.addSet);
  const removeExercise = useActiveWorkout((s) => s.removeExercise);
  const insertWarmupSets = useActiveWorkout((s) => s.insertWarmupSets);
  const [showPlates, setShowPlates] = useState(false);

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

  let working = 0;
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: color.border,
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
          <View style={{ marginTop: 4, flexDirection: 'row' }}>
            <Badge label={cap(exercise.muscleGroup)} tone="accent" />
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

      <PlateCalcSheet
        visible={showPlates}
        initialKg={workingWeight ?? 0}
        onClose={() => setShowPlates(false)}
      />
    </View>
  );
}

const colHead = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 0.4,
} as const;
