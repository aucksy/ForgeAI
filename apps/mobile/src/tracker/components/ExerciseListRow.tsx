/**
 * One exercise in a list (the one exercise list — library, Add exercise, Swap). A small still
 * picture — tap it for the demo — then the name and "Muscle · Equipment". The WHOLE row is the
 * button for the list's job (open the exercise, or add it): no dead padding (EX-17, at least
 * 48 dp), and a long name wraps to two lines instead of being cut (EX-12) — "Single-Arm
 * Dumbbell Preacher Curl" and "Single-Arm Dumbbell Curl" must not look the same.
 */
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { MUSCLE_LABEL } from '../catalog/muscles';
import type { TrackerExercise } from '../db/exerciseInfo';
import { ExerciseThumb } from './ExerciseThumb';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

export const ExerciseListRow = memo(function ExerciseListRow({
  ex,
  trailing,
  actionLabel,
  onPress,
  onDemo,
}: {
  ex: TrackerExercise;
  trailing: IconName;
  /** Screen-reader verb for the row: "View" / "Add". */
  actionLabel: string;
  onPress: (ex: TrackerExercise) => void;
  onDemo: (ex: TrackerExercise) => void;
}) {
  const muscle = MUSCLE_LABEL[ex.muscles.primary[0]] ?? cap(ex.muscleGroup);
  return (
    <Pressable
      onPress={() => onPress(ex)}
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel} ${ex.name}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 64,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.md,
        backgroundColor: pressed ? color.surfaceRaised : color.surface,
        borderWidth: 1,
        borderColor: color.border,
      })}
    >
      <ExerciseThumb
        catalogKey={ex.catalogKey}
        name={ex.name}
        size={44}
        media={{ uri: ex.mediaUri, type: ex.mediaType }}
        onPress={() => onDemo(ex)}
      />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
          {ex.name}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
          {muscle} · {cap(ex.equipment)}
          {ex.catalogKey ? '' : ' · Yours'}
        </Text>
      </View>
      <Icon name={trailing} size={18} color={trailing === 'plus' || trailing === 'check' ? color.accent : color.inkMuted} />
    </Pressable>
  );
});
