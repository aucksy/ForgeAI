/** History tab — week streak, a calendar heatmap, and the workout feed. */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Heatmap } from '@/components/charts';
import { Card, EmptyState, Screen, SectionHeader, Skeleton, StatTile } from '@/components/ui';
import { getConsistency, getRecentSessionDetails } from '@/db/repos/workoutRepo';
import { radius, space } from '@/theme/tokens';
import type { ConsistencyCell, SessionDetail } from '@/types/models';

import { WorkoutCard } from '@/tracker/components/WorkoutCard';
import { getWeekStreak } from '@/tracker/services/history';
import type { WeekStreak } from '@/tracker/services/history';

const CAL_WEEKS = 13;

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDetail[] | null>(null);
  const [cells, setCells] = useState<ConsistencyCell[]>([]);
  const [streak, setStreak] = useState<WeekStreak | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // Fetch each independently so a streak/heatmap read failing can't blank the feed.
      Promise.all([
        getRecentSessionDetails(50).catch(() => [] as SessionDetail[]),
        getConsistency(CAL_WEEKS * 7).catch(() => [] as ConsistencyCell[]),
        getWeekStreak().catch(() => ({ weeks: 0, restDays: 0 }) as WeekStreak),
      ]).then(([rows, c, st]) => {
        if (alive) {
          setSessions(rows);
          setCells(c);
          setStreak(st);
        }
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
        <View style={{ gap: space.lg }}>
          {streak ? (
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <StatTile
                  label="Week streak"
                  value={streak.weeks}
                  unit={streak.weeks === 1 ? 'week' : 'weeks'}
                  icon="flame"
                />
              </View>
              <View style={{ flex: 1 }}>
                <StatTile label="Rest days" value={streak.restDays} icon="clock" />
              </View>
            </View>
          ) : null}

          <View>
            <SectionHeader title="Last 13 weeks" />
            <Card>
              <Heatmap cells={cells} weeks={CAL_WEEKS} />
            </Card>
          </View>

          <View>
            <SectionHeader title="Recent workouts" />
            <View style={{ gap: space.md }}>
              {sessions.map((s) => (
                <WorkoutCard key={s.id} session={s} onPress={() => router.push(`/session/${s.id}`)} />
              ))}
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}
