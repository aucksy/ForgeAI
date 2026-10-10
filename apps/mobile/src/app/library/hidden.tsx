/**
 * Hidden exercises (audit Phase 4, EX-02): the library exercises the member hid from every
 * list, each with "Show" to bring it back.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { EmptyState, LoadError, Screen, Skeleton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { runGuarded } from '@/lib/guardedAction';
import { goBack } from '@/lib/goBack';
import { color, radius, space, type } from '@/theme/tokens';

import { getTrackerExercisesByIds, type TrackerExercise } from '@/tracker/db/exerciseInfo';
import { getHiddenExerciseIds, setExerciseHidden } from '@/tracker/db/exerciseManage';
import { exercisesChanged, useExerciseList } from '@/tracker/store/exerciseListStore';

export default function HiddenExercisesScreen() {
  const router = useRouter();
  const version = useExerciseList((s) => s.version);
  const [rows, setRows] = useState<TrackerExercise[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    getHiddenExerciseIds()
      .then(async (ids) => {
        const byId = await getTrackerExercisesByIds([...ids]);
        if (!alive) return;
        setRows([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [version, attempt]);

  const show = useCallback((ex: TrackerExercise) => {
    void runGuarded(
      busy,
      async () => {
        setError(null);
        await setExerciseHidden(ex.id, false);
        exercisesChanged();
      },
      () => setError("Couldn't show it again. Try again."),
    );
  }, []);

  return (
    <Screen
      scroll={false}
      title="Hidden exercises"
      subtitle="Hidden from every exercise list. Show one to bring it back."
      onBack={() => goBack(router, '/workout')}
    >
      <InlineError message={error} />
      {rows == null && failed ? (
        <LoadError what="your hidden exercises" onRetry={() => setAttempt((n) => n + 1)} />
      ) : rows == null ? (
        <View style={{ gap: space.sm }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={56} radius={radius.md} />
          ))}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ gap: space.sm, paddingBottom: space.xxl }}
          ListEmptyComponent={<EmptyState icon="dumbbell" title="Nothing hidden" body="Every exercise shows in your lists." />}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 56,
                paddingLeft: space.md,
                borderRadius: radius.md,
                backgroundColor: color.surface,
                borderWidth: 1,
                borderColor: color.border,
              }}
            >
              <Text numberOfLines={2} style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                {item.name}
              </Text>
              <Pressable
                onPress={() => show(item)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${item.name} again`}
                style={{ minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md }}
              >
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Show</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
