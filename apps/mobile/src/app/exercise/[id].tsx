import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ExerciseCharts } from '@/components/exercise/ExerciseCharts';
import { ExerciseHero } from '@/components/exercise/ExerciseHero';
import { SessionHistory } from '@/components/exercise/SessionHistory';
import { Badge, EmptyState, IconButton, Screen, Skeleton } from '@/components/ui';
import { getExerciseStats } from '@/services/analytics';
import { useSettings } from '@/store/settingsStore';
import { color, motion, radius, space, type } from '@/theme/tokens';
import type { ExerciseStats } from '@/types/models';

const cap = (s: string) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

function LoadingSkeleton() {
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Skeleton width={132} height={104} radius={radius.lg} />
        <Skeleton width={118} height={104} radius={radius.lg} />
        <Skeleton width={118} height={104} radius={radius.lg} />
      </View>
      <View style={{ marginTop: space.xl, gap: space.xl }}>
        <Skeleton width="100%" height={230} radius={radius.lg} />
        <Skeleton width="100%" height={230} radius={radius.lg} />
        <Skeleton width="100%" height={260} radius={radius.lg} />
      </View>
    </View>
  );
}

/** Exercise detail: hero stats, progress + e1RM + volume charts, session history. */
export default function ExerciseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const units = useSettings((s) => s.unitSystem);
  const [stats, setStats] = useState<ExerciseStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setStats(null);
    if (id) {
      getExerciseStats(id)
        .then((s) => {
          if (alive) {
            setStats(s);
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

  const hasHistory = stats !== null && stats.history.length > 0;

  return (
    <Screen>
      {/* header: back chevron + name + muscle group + equipment */}
      <Animated.View
        entering={FadeInDown.duration(motion.slow)}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space.md,
          marginBottom: space.xl,
        }}
      >
        <IconButton
          icon="chevron-left"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <View style={{ flex: 1, paddingTop: 2 }}>
          {stats ? (
            <>
              <Text
                style={{
                  fontFamily: type.display,
                  fontSize: type.size.h2,
                  color: color.ink,
                  letterSpacing: -0.4,
                }}
              >
                {stats.exercise.name}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  marginTop: space.sm,
                }}
              >
                <Badge label={cap(stats.exercise.muscleGroup)} tone="accent" />
                <Text
                  style={{
                    fontFamily: type.bodyMedium,
                    fontSize: type.size.caption,
                    color: color.inkMuted,
                  }}
                >
                  {cap(stats.exercise.equipment)} · {stats.sessionsCount}{' '}
                  {stats.sessionsCount === 1 ? 'session' : 'sessions'}
                </Text>
              </View>
            </>
          ) : loading ? (
            <View style={{ gap: space.sm }}>
              <Skeleton width="68%" height={24} />
              <Skeleton width="42%" height={16} />
            </View>
          ) : (
            <Text
              style={{
                fontFamily: type.display,
                fontSize: type.size.h2,
                color: color.ink,
                letterSpacing: -0.4,
              }}
            >
              Exercise
            </Text>
          )}
        </View>
      </Animated.View>

      {loading ? (
        <LoadingSkeleton />
      ) : !stats || !hasHistory ? (
        <EmptyState
          icon="dumbbell"
          title={stats ? 'No sets logged yet' : 'Exercise not found'}
          body={
            stats
              ? 'Tell your coach about your next session and your progress will land here.'
              : 'This exercise is missing from your library — head back and pick another.'
          }
        />
      ) : (
        <>
          <ExerciseHero stats={stats} units={units} />
          <ExerciseCharts progress={stats.progress} units={units} />
          <SessionHistory history={stats.history} units={units} />
        </>
      )}
    </Screen>
  );
}
