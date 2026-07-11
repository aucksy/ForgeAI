import { useFocusEffect, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  BodyWeightCard,
  DashboardSkeleton,
  GreetingHeader,
  HeroWorkoutCard,
  InsightCard,
  NextUpRow,
  StatGrid,
  StreakRow,
  VolumeCard,
} from '@/components/dashboard';
import { Screen } from '@/components/ui';
import { getProfile } from '@/db/repos/userRepo';
import { getWeeklyVolume } from '@/db/repos/workoutRepo';
import { thud } from '@/lib/haptics';
import { useDashboard } from '@/store/dashboardStore';
import { useSettings } from '@/store/settingsStore';
import { color, motion, space } from '@/theme/tokens';

/** Entrance stagger for each dashboard section. */
function Section({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(70 * index).duration(motion.slow)}>
      {children}
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const data = useDashboard((s) => s.data);
  const refresh = useDashboard((s) => s.refresh);
  const unitSystem = useSettings((s) => s.unitSystem);

  const [firstName, setFirstName] = useState<string | null>(null);
  // DashboardData carries only the current week's total; the 8-week series for
  // the MiniBars comes straight from the repo (foundation gap worked around here).
  const [volumeSeries, setVolumeSeries] = useState<number[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadExtras = useCallback(async () => {
    try {
      const [weeks, profile] = await Promise.all([getWeeklyVolume(8), getProfile()]);
      setVolumeSeries(weeks.map((w) => w.volumeKg));
      const first = profile.name.trim().split(/\s+/)[0];
      setFirstName(first || null);
    } catch {
      // unseeded / transient DB error — greeting and bars degrade gracefully
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadExtras();
    }, [refresh, loadExtras]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadExtras()]);
    setRefreshing(false);
  }, [refresh, loadExtras]);

  const goWorkout = useCallback(() => {
    thud();
    // Manual-tracker pivot: the hero now starts a workout instead of opening chat.
    router.push('/workout');
  }, [router]);

  const goCoach = useCallback(() => {
    thud();
    // Deep-link the coach to present today's session (coach.tsx consumes ?prompt=).
    router.push({ pathname: '/coach', params: { prompt: "Today's Workout" } });
  }, [router]);

  const goInsightCoach = useCallback(() => {
    thud();
    // Phase C4: the Home insight nudge is proactive — tapping asks the coach to
    // expand on today's focus (grounded via tools, richer with a key).
    router.push({ pathname: '/coach', params: { prompt: 'What should I focus on today, and why?' } });
  }, [router]);

  return (
    <Screen scroll={false} noPad>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: space.screenX,
          paddingBottom: space.xxl,
          gap: space.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.accent}
            colors={[color.accent]}
            progressBackgroundColor={color.surfaceRaised}
          />
        }
      >
        <GreetingHeader name={firstName} />

        {data ? (
          <>
            <Section index={0}>
              <HeroWorkoutCard
                workout={data.todaysWorkout}
                unitSystem={unitSystem}
                onPress={goWorkout}
              />
            </Section>
            <Section index={1}>
              <StreakRow streakDays={data.streakDays} workoutsThisWeek={data.workoutsThisWeek} />
            </Section>
            <Section index={2}>
              <StatGrid data={data} />
            </Section>
            <Section index={3}>
              <VolumeCard
                volumeKg={data.weeklyVolumeKg}
                deltaPct={data.weeklyVolumeDeltaPct}
                series={volumeSeries}
                unitSystem={unitSystem}
              />
            </Section>
            {data.bodyWeightKg !== null && data.bodyWeightTrend.length > 0 ? (
              <Section index={4}>
                <BodyWeightCard
                  weightKg={data.bodyWeightKg}
                  trend={data.bodyWeightTrend}
                  unitSystem={unitSystem}
                />
              </Section>
            ) : null}
            <Section index={5}>
              <InsightCard insight={data.insight} onPress={goInsightCoach} />
            </Section>
            <Section index={6}>
              <NextUpRow
                lastWorkout={data.lastWorkout}
                nextName={data.todaysWorkout.dayName}
                onPress={goCoach}
              />
            </Section>
          </>
        ) : (
          <DashboardSkeleton />
        )}
      </ScrollView>
    </Screen>
  );
}
