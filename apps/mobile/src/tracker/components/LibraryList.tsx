/**
 * The exercise library list. Audit Phase 4 (EX-06): it IS the one exercise list
 * (`ExercisePickerList`) — the same search, Recent, muscle and gear filters and "Create
 * “<typed>”" as in a workout — with rows that open the exercise, a "New exercise" button and,
 * when the member hid some, a way back to them ("Hidden exercises · 3").
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GhostButton, Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import type { Exercise } from '@/types/models';

import { getHiddenExerciseIds } from '../db/exerciseManage';
import { useExerciseList } from '../store/exerciseListStore';
import { ExercisePickerList } from './ExercisePickerList';

export function LibraryList({
  onSelectExercise,
  onCreateNew,
  onCreateNamed,
  onOpenHidden,
}: {
  onSelectExercise: (ex: Exercise) => void;
  onCreateNew: () => void;
  /** EX-06: "Create “<typed>”" — the form opens with that name filled in. */
  onCreateNamed?: (typed: string) => void;
  /** EX-02: opens the "Hidden exercises" list. */
  onOpenHidden?: () => void;
}) {
  const version = useExerciseList((s) => s.version);
  const [hiddenCount, setHiddenCount] = useState(0);
  useEffect(() => {
    let alive = true;
    getHiddenExerciseIds()
      .then((ids) => {
        if (alive) setHiddenCount(ids.size);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [version]);

  return (
    <ExercisePickerList
      onSelect={onSelectExercise}
      actionLabel="View"
      trailing="chevron-right"
      placeholderCount
      onCreate={onCreateNamed}
      header={
        <View style={{ gap: space.sm }}>
          <GhostButton label="New exercise" icon="plus" onPress={onCreateNew} />
          {hiddenCount > 0 && onOpenHidden ? (
            <Pressable
              onPress={onOpenHidden}
              accessibilityRole="button"
              accessibilityLabel={`Hidden exercises, ${hiddenCount}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}
            >
              <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>
                Hidden exercises · {hiddenCount}
              </Text>
              <Icon name="chevron-right" size={18} color={color.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}
