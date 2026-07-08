/** Read-only detail of a past workout (from History) — repeat or delete it. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { EmptyState, GhostButton, IconButton, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { deleteSession } from '@/db/repos/workoutRepo';
import { shortDate } from '@/lib/date';
import { useDashboard } from '@/store/dashboardStore';
import { radius, space } from '@/theme/tokens';

import { SessionSummary } from '@/tracker/components/SessionSummary';
import { dayTypeLabel, getSessionSummary } from '@/tracker/services/finishSummary';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

export default function SessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const startFromSession = useActiveWorkout((s) => s.startFromSession);
  const hydrate = useActiveWorkout((s) => s.hydrate);
  const repeating = useRef(false);

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
    if (!data || repeating.current) return;
    repeating.current = true;
    // Hydrate first: a persisted in-progress draft may exist but not yet be in memory
    // (it only loads on the Workout tab), and startFromSession would overwrite it.
    await hydrate();
    if (useActiveWorkout.getState().active) {
      repeating.current = false;
      Alert.alert('Finish your current workout first', 'You already have a workout in progress.');
      return;
    }
    await startFromSession(data.session);
    router.replace('/session/active');
  };

  const onDelete = (): void => {
    if (!id) return;
    Alert.alert('Delete workout?', 'This permanently removes this workout and its sets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteSession(id)
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
            <GhostButton label="Delete workout" icon="close" onPress={onDelete} />
          </View>
        </View>
      ) : (
        <EmptyState icon="dumbbell" title="Workout not found" body="This session may have been deleted." />
      )}
    </Screen>
  );
}
