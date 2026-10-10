import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { LoadError, Sheet, SheetRow, Skeleton } from '@/components/ui';
import { addDays, todayISO } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';
import { MUSCLE_LABEL, type Muscle } from '@/tracker/catalog/muscles';
import { lowSetsHint, muscleBreakdown, type MuscleGroupSets } from '@/tracker/engine/bodyMap';
import { setsText } from '@/tracker/engine/volume';
import { getMuscleGroupsBetween } from '@/tracker/services/progressTop';

export interface MuscleSheetProps {
  /** The tapped muscle; null = closed. */
  muscle: Muscle | null;
  onClose: () => void;
  onOpenExercise: (exerciseId: string) => void;
}

/**
 * Tap a muscle on the body map (audit Phase 5): its sets in the last 7 days, the exercises
 * that trained it, and a gentle "under 10 sets" hint — what to train next.
 */
export function MuscleSheet({ muscle, onClose, onOpenExercise }: MuscleSheetProps) {
  const [groups, setGroups] = useState<MuscleGroupSets[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!muscle) return;
    let alive = true;
    setFailed(false);
    const today = todayISO();
    getMuscleGroupsBetween(addDays(today, -6), today)
      .then((g) => {
        if (alive) setGroups(g);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [muscle, attempt]);

  // Review fix (Phase 5): the title stays while the sheet slides away (muscle is already null).
  const lastMuscle = useRef<Muscle | null>(null);
  if (muscle) lastMuscle.current = muscle;
  const shown = muscle ?? lastMuscle.current;
  const detail = shown && groups ? muscleBreakdown(groups, shown) : null;
  const hint = detail ? lowSetsHint(detail.sets) : null;

  return (
    <Sheet
      visible={muscle != null}
      title={shown ? MUSCLE_LABEL[shown] : ''}
      subtitle={detail ? `${setsText(detail.sets)} in the last 7 days` : undefined}
      onClose={onClose}
    >
      {failed ? (
        <LoadError compact what="this muscle" onRetry={() => setAttempt((n) => n + 1)} />
      ) : !detail ? (
        <View style={{ gap: space.sm }}>
          <Skeleton width="100%" height={48} radius={12} />
          <Skeleton width="100%" height={48} radius={12} />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {hint ? <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{hint}</Text> : null}
          {detail.exercises.map((e) => (
            <SheetRow key={e.exerciseId} label={e.name} value={setsText(e.sets)} onPress={() => onOpenExercise(e.exerciseId)} />
          ))}
        </View>
      )}
    </Sheet>
  );
}
