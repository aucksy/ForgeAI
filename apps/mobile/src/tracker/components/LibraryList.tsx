/**
 * Profile → Exercises (redesign R5, Hevy's Exercises screen; the old Exercise library merged in).
 * Audit Phase 4 (EX-06): it IS the one exercise list (`ExercisePickerList`) — the same forgiving
 * search (any order, plurals, a typo, Hindi and other names), "Did you mean…" and "Create
 * “<typed>”" as in a workout — laid out like Hevy's:
 *  - Equipment and Muscle as two buttons, each opening its list;
 *  - Recent (done before, newest first, "Last: 12 Oct") · Made by you · All exercises;
 *  - when the member hid some, "Hidden exercises · 3" at the bottom.
 * "Create" sits top right on the screen itself.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import type { Exercise } from '@/types/models';

import { getHiddenExerciseIds } from '../db/exerciseManage';
import { getLastDoneDates } from '../db/recentExercises';
import type { LastDone } from '../lib/exercisesView';
import { useExerciseList } from '../store/exerciseListStore';
import { ExercisePickerList } from './ExercisePickerList';

export function LibraryList({
  onSelectExercise,
  onCreateNamed,
  onOpenHidden,
}: {
  onSelectExercise: (ex: Exercise) => void;
  /** EX-06: "Create “<typed>”" — the form opens with that name filled in. */
  onCreateNamed?: (typed: string) => void;
  /** EX-02: opens the "Hidden exercises" list. */
  onOpenHidden?: () => void;
}) {
  const version = useExerciseList((s) => s.version);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [lastDone, setLastDone] = useState<ReadonlyMap<string, LastDone>>(new Map());
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
  // Read on every visit: a workout finished since moves its exercises up ("Last: today").
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getLastDoneDates()
        .then((m) => {
          if (alive) setLastDone(m);
        })
        // A failed read keeps what is shown (the list itself still works, A→Z).
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [version]),
  );

  return (
    <ExercisePickerList
      onSelect={onSelectExercise}
      actionLabel="View"
      trailing="chevron-right"
      placeholderCount
      filterMenus
      lastDone={lastDone}
      onCreate={onCreateNamed}
      footer={
        hiddenCount > 0 && onOpenHidden ? (
          <Pressable
            onPress={onOpenHidden}
            accessibilityRole="button"
            accessibilityLabel={`Hidden exercises, ${hiddenCount}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, marginTop: space.sm }}
          >
            <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>
              Hidden exercises · {hiddenCount}
            </Text>
            <Icon name="chevron-right" size={18} color={color.inkMuted} />
          </Pressable>
        ) : null
      }
    />
  );
}
