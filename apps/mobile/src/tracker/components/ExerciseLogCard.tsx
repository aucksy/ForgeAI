/** One exercise inside the active workout: header, set-table, and "+ Add set". */
import { Alert, Text, View } from 'react-native';

import { Badge, GhostButton, Icon, IconButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { useActiveWorkout } from '../store/activeWorkoutStore';
import type { DraftExercise } from '../store/activeWorkoutStore';
import { SetRow } from './SetRow';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

export function ExerciseLogCard({ exercise }: { exercise: DraftExercise }) {
  const addSet = useActiveWorkout((s) => s.addSet);
  const removeExercise = useActiveWorkout((s) => s.removeExercise);

  const confirmRemove = (): void => {
    Alert.alert('Remove exercise?', `Remove ${exercise.name} and its sets from this workout.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeExercise(exercise.key) },
    ]);
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

      <View style={{ marginTop: space.xs }}>
        <GhostButton label="Add set" icon="plus" onPress={() => addSet(exercise.key)} />
      </View>
    </View>
  );
}

const colHead = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 0.4,
} as const;
