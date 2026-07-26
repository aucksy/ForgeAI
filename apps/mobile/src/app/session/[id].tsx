/** Detail of a past workout (from History) — edit, repeat or delete it. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { EmptyState, GhostButton, IconButton, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { deleteSessionAndReconcile } from '@/tracker/services/prRebuild';
import { shortDate } from '@/lib/date';
import { useDashboard } from '@/store/dashboardStore';
import { radius, space } from '@/theme/tokens';

import { getSessionSetMeta } from '@/tracker/db/trackerSets';
import { uneditableReason } from '@/tracker/services/editDraft';
import { SessionSummary } from '@/tracker/components/SessionSummary';
import { dayTypeLabel, getSessionSummary } from '@/tracker/services/finishSummary';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

export default function SessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const startFromSession = useActiveWorkout((s) => s.startFromSession);
  const startEditingSession = useActiveWorkout((s) => s.startEditingSession);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  // ONE guard for both actions: they share the single draft slot, so a fast
  // Edit-then-Repeat could otherwise start both before either sets `active`.
  const busy = useRef(false);

  const [data, setData] = useState<SessionSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (id) {
      getSessionSummary(id)
        .then((d) => {
          if (alive) {
            setData(d);
            setLoading(false);
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

  const onRepeat = async (): Promise<void> => {
    if (!data || busy.current) return;
    busy.current = true;
    // Hydrate first: a persisted in-progress draft may exist but not yet be in memory
    // (it only loads on the Workout tab), and startFromSession would overwrite it.
    await hydrate();
    if (useActiveWorkout.getState().active) {
      busy.current = false;
      Alert.alert('Finish your current workout first', 'You already have a workout in progress.');
      return;
    }
    await startFromSession(data.session);
    router.replace('/session/active');
  };

  const onEdit = async (): Promise<void> => {
    if (!data || busy.current) return;
    busy.current = true;
    // Same guard as Repeat: a persisted in-progress draft only loads on the Workout
    // tab, so hydrate first or editing would silently overwrite it.
    await hydrate();
    if (useActiveWorkout.getState().active) {
      busy.current = false;
      Alert.alert(
        'Finish your current workout first',
        'You have a workout in progress. Finish or discard it before editing an older one.',
      );
      return;
    }
    try {
      // Saving REPLACES every set, so refuse the cases the editor cannot represent
      // faithfully rather than quietly merging them away.
      const blocked = uneditableReason(data.session, await getSessionSetMeta(data.session.id));
      if (blocked) {
        busy.current = false;
        Alert.alert("Can't edit this one", blocked);
        return;
      }
      await startEditingSession(data.session);
      router.replace('/session/active');
    } catch {
      busy.current = false;
      Alert.alert('Could not open the editor', 'Something went wrong. Please try again.');
    }
  };

  const onDelete = (): void => {
    if (!id) return;
    Alert.alert('Delete workout?', 'This permanently removes this workout and its sets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteSessionAndReconcile(id)
            .then(() => {
              void useDashboard.getState().refresh();
              router.back();
            })
            .catch(() => Alert.alert('Delete failed', 'Could not delete this workout. Please try again.'));
        },
      },
    ]);
  };

  return (
    <Screen
      title={data ? dayTypeLabel(data.session.dayType) : 'Workout'}
      subtitle={data ? shortDate(data.session.dateISO) : undefined}
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={180} radius={radius.lg} />
          <Skeleton width="100%" height={160} radius={radius.lg} />
        </View>
      ) : data ? (
        <View style={{ gap: space.lg }}>
          <SessionSummary data={data} />
          <View style={{ gap: space.md }}>
            <PrimaryButton label="Repeat this workout" icon="dumbbell" onPress={() => void onRepeat()} />
            <GhostButton label="Edit this workout" icon="check" onPress={() => void onEdit()} />
            <GhostButton label="Delete workout" icon="close" onPress={onDelete} />
          </View>
        </View>
      ) : (
        <EmptyState icon="dumbbell" title="Workout not found" body="This session may have been deleted." />
      )}
    </Screen>
  );
}
