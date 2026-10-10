import { useFocusEffect, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  BodyWeightCard,
  DashboardSkeleton,
  FirstRunCard,
  GreetingHeader,
  HeroWorkoutCard,
  InsightCard,
  NextUpRow,
  StatGrid,
  StreakRow,
  VolumeCard,
} from '@/components/dashboard';
import { Card, LoadError, Screen } from '@/components/ui';
import { getProfile } from '@/db/repos/userRepo';
import { getWeeklyVolumeKg } from '@/tracker/services/volumeService';
import { FEATURES, homeParts } from '@/lib/features';
import { thud } from '@/lib/haptics';
import { takeLinkNotice } from '@/lib/linkNotice';
import { useDashboard } from '@/store/dashboardStore';
import { useSettings } from '@/store/settingsStore';
import { color, motion, space, type } from '@/theme/tokens';
import { runGuarded } from '@/lib/guardedAction';
import { todayLink } from '@/tracker/lib/todayLink';
import { startShownWorkout } from '@/tracker/services/todayStart';
import type { Goal } from '@/types/models';

// D4 = A: the coach, nutrition and their scores stay hidden until their own phase.
const PARTS = new Set(homeParts(FEATURES));

/** How long the "That link didn't work." line stays before it fades on its own. */
const NOTICE_MS = 4000;

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
  // SH-13: a failed read with nothing to show is said, with a retry — never an endless skeleton.
  const loadFailed = useDashboard((s) => s.error);
  const unitSystem = useSettings((s) => s.unitSystem);

  const [firstName, setFirstName] = useState<string | null>(null);
  // PG-10: the body-weight change's colour follows the member's goal.
  const [goal, setGoal] = useState<Goal | null>(null);
  // DashboardData carries only the current week's total; the 8-week series for
  // the MiniBars comes straight from the repo (foundation gap worked around here).
  const [volumeSeries, setVolumeSeries] = useState<number[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // SH-29: a wrong forgeai:// link lands here with one calm line.
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const t = takeLinkNotice();
      if (!t) return undefined;
      setNotice(t);
      const timer = setTimeout(() => setNotice(null), NOTICE_MS);
      return () => clearTimeout(timer);
    }, []),
  );

  const loadExtras = useCallback(async () => {
    try {
      // Phase 2: the same volume rule as every other screen (body weight on pull-ups, both dumbbells…).
      const [weeks, profile] = await Promise.all([getWeeklyVolumeKg(8), getProfile()]);
      setVolumeSeries(weeks.map((w) => w.volumeKg));
      const first = profile.name.trim().split(/\s+/)[0];
      setFirstName(first || null);
      setGoal(profile.goal);
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

  // SH-23: "Start your first workout" really starts one — the plan's routine shown as Today,
  // else an empty workout — instead of opening the Workout tab to choose again.
  const startGuard = useRef(false);
  const nextId = data?.todaysWorkout.today?.nextId ?? null;
  const startNow = useCallback(() => {
    thud();
    void runGuarded(startGuard, () => startShownWorkout(router, nextId), () =>
      Alert.alert('Couldn’t start the workout', 'Please try again.'),
    );
  }, [router, nextId]);

  // v0.28.0: today's routine opens its preview first (every exercise, then Start). Audit
  // Phase 3: with no plan, the routines screen (ready programs, build a plan).
  const link = data ? todayLink(data.todaysWorkout) : '/workout';
  const goToday = useCallback(() => {
    thud();
    router.push(link);
  }, [router, link]);

  const goRoutines = useCallback(() => {
    thud();
    router.push('/routines');
  }, [router]);

  const goCoach = useCallback(() => {
    thud();
    // Opens the coach with this question in the box, unsent (coach.tsx, SH-01).
    router.push({ pathname: '/coach', params: { prompt: "Today's Workout" } });
  }, [router]);

  const goInsightCoach = useCallback(() => {
    thud();
    // Phase C4: the Home insight nudge is proactive — tapping asks the coach to
    // expand on today's focus (grounded via tools, richer with a key).
    router.push({
      pathname: '/coach',
      params: { prompt: 'What should I focus on today, and why?' },
    });
  }, [router]);

  const goNutrition = useCallback(() => {
    // The calorie/protein rings now open a real meal manager (view/add/delete).
    router.push('/nutrition');
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

        {notice ? (
          <Pressable
            onPress={() => setNotice(null)}
            accessibilityRole="button"
            accessibilityLabel={`${notice} Dismiss`}
            accessibilityLiveRegion="polite"
          >
            <Card>
              <Text
                style={{
                  fontFamily: type.bodyMedium,
                  fontSize: type.size.sub,
                  color: color.inkSecondary,
                }}
              >
                {notice}
              </Text>
            </Card>
          </Pressable>
        ) : null}

        {data ? (
          <>
            <Section index={0}>
              {/* Phase O2 (W1): a real member starts with nothing logged — invite
                  them to train instead of showing a plan card over zeros. */}
              {data.lastWorkout === null ? (
                <FirstRunCard
                  name={firstName}
                  onStartWorkout={startNow}
                  onBuildRoutine={goRoutines}
                />
              ) : (
                <HeroWorkoutCard
                  workout={data.todaysWorkout}
                  unitSystem={unitSystem}
                  onPress={goToday}
                />
              )}
            </Section>
            <Section index={1}>
              {/* Phase 3: THE streak (weeks in a row, D9) and the lifts that beat a best this
                  week by the one record rule (D10) — the same numbers Progress shows. */}
              <StreakRow
                streakWeeks={data.streakWeeks}
                workoutsThisWeek={data.workoutsThisWeek}
                liftsUpThisWeek={data.liftsUpThisWeek ?? null}
              />
            </Section>
            {PARTS.has('nutritionRings') || PARTS.has('scores') ? (
              <Section index={2}>
                <StatGrid
                  data={data}
                  onPressNutrition={goNutrition}
                  showRings={PARTS.has('nutritionRings')}
                  showScores={PARTS.has('scores')}
                />
              </Section>
            ) : null}
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
                  goal={goal}
                />
              </Section>
            ) : null}
            {PARTS.has('insight') ? (
              <Section index={5}>
                <InsightCard insight={data.insight} onPress={goInsightCoach} />
              </Section>
            ) : null}
            {PARTS.has('nextUp') ? (
              <Section index={6}>
                <NextUpRow
                  lastWorkout={data.lastWorkout}
                  nextName={data.todaysWorkout.dayName}
                  onPress={goCoach}
                />
              </Section>
            ) : null}
          </>
        ) : loadFailed ? (
          <LoadError what="your summary" onRetry={() => void onRefresh()} />
        ) : (
          <DashboardSkeleton />
        )}
      </ScrollView>
    </Screen>
  );
}
