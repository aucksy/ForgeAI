/** History tab — reverse-chronological list of logged workouts. */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { EmptyState, Screen, Skeleton } from '@/components/ui';
import { getRecentSessionDetails } from '@/db/repos/workoutRepo';
import { radius, space } from '@/theme/tokens';
import type { SessionDetail } from '@/types/models';

import { WorkoutCard } from '@/tracker/components/WorkoutCard';

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDetail[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getRecentSessionDetails(50)
        .then((rows) => {
          if (alive) setSessions(rows);
        })
        .catch(() => {
          if (alive) setSessions([]);
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <Screen title="History" subtitle="Every workout you've logged.">
      {sessions === null ? (
        <View style={{ gap: space.md }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={74} radius={radius.lg} />
          ))}
        </View>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="dumbbell"
          title="No workouts yet"
          body="Head to the Workout tab and log your first session — it'll show up here."
        />
      ) : (
        <View style={{ gap: space.md }}>
          {sessions.map((s) => (
            <WorkoutCard key={s.id} session={s} onPress={() => router.push(`/session/${s.id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
