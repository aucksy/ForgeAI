/**
 * One exercise in a list (library and mid-workout picker). Phase 2: a small still picture —
 * tap it for the moving demo — then the name and "Muscle · Equipment". Tapping the rest of
 * the row does the list's job (open the exercise, or add it to the workout).
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <ExerciseThumb
        catalogKey={ex.catalogKey}
        name={ex.name}
        size={44}
        media={{ uri: ex.mediaUri, type: ex.mediaType }}
        onPress={() => onDemo(ex)}
      />
      <Pressable
        onPress={() => onPress(ex)}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} ${ex.name}`}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 }}
      >
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
            {ex.name}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {muscle} · {cap(ex.equipment)}
          </Text>
        </View>
        <Icon name={trailing} size={18} color={trailing === 'plus' ? color.accent : color.inkMuted} />
      </Pressable>
    </View>
  );
});
