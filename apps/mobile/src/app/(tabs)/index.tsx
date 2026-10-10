import { useFocusEffect, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  AnswerCard,
  DashboardSkeleton,
  GreetingHeader,
  InsightCard,
  NextUpRow,
  StatGrid,
  ThisWeekCard,
} from '@/components/dashboard';
import { Card, LoadError, Screen } from '@/components/ui';
import { getProfile } from '@/db/repos/userRepo';
import { FEATURES, homeParts } from '@/lib/features';
import { runGuarded } from '@/lib/guardedAction';
import { thud } from '@/lib/haptics';
import { takeLinkNotice } from '@/lib/linkNotice';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { useDashboard } from '@/store/dashboardStore';
import { useSettings } from '@/store/settingsStore';
import { color, motion, space, type } from '@/theme/tokens';
import type { WeekVsUsual } from '@/tracker/engine/progressTop';
import { SwitcherCard, takePendingImport, type SwitchApp } from '@/tracker/components/SwitcherCard';
import { homeAnswer, homeBelow, openWorkout, type HomeAction } from '@/tracker/lib/homeAnswer';
import { todayLink } from '@/tracker/lib/todayLink';
import { getWeekVsUsual } from '@/tracker/services/progressTop';
import { startShownWorkout } from '@/tracker/services/todayStart';
import { openActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { tell } from '@/lib/tell';

// D4 = A: the coach, nutrition and their scores stay hidden until their own phase.
const PARTS = new Set(homeParts(FEATURES));

/** How long the "That link didn't work." line stays before it fades on its own. */
const NOTICE_MS = 4000;
/** A second tap this soon after a push is ignored (one tap, one page). */
const PUSH_GUARD_MS = 800;

/** Entrance stagger for each Home section. */
function Section({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(70 * index).duration(motion.slow)}>
      {children}
    </Animated.View>
  );
}

/**
 * Home — audit Phase 7: calm. One answer card (what to do now, from the shared Today answer),
 * then this week's numbers (the same as Progress). Kg lifted per week and body weight live on
 * Progress; the coach's and nutrition's cards stay behind their switches, and even then show
 * only when they have something to say.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const data = useDashboard((s) => s.data);
  const refresh = useDashboard((s) => s.refresh);
  // SH-13: a failed read with nothing to show is said, with a retry — never an endless skeleton.
  const loadFailed = useDashboard((s) => s.error);
  const unitSystem = useSettings((s) => s.unitSystem);
  const demo = useOnboarding((s) => s.demo);

  // A workout already running answers first: "Workout in progress · Continue".
  const active = useActiveWorkout((s) => s.active);
  const editingSessionId = useActiveWorkout((s) => s.editingSessionId);
  const pastLog = useActiveWorkout((s) => s.pastLog);
  const exercises = useActiveWorkout((s) => s.exercises);
  const open = useMemo(
    () => openWorkout({ active, editingSessionId, pastLog, exercises }),
    [active, editingSessionId, pastLog, exercises],
  );

  const [firstName, setFirstName] = useState<string | null>(null);
  // Progress's own "this week" numbers — null until read (or when the read failed).
  const [week, setWeek] = useState<WeekVsUsual | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // SH-29: a wrong forgeai:// link lands here with one calm line.
  const [notice, setNotice] = useState<string | null>(null);

  // Audit Phase 4: a switcher's import (Hevy or Strong) opens from an empty Home, and right after
  // the welcome screen when they picked their app there.
  const openImport = useCallback(
    (app: SwitchApp) => {
      thud();
      router.push(app === 'strong' ? { pathname: '/import', params: { from: 'strong' } } : '/import');
    },
    [router],
  );
  useFocusEffect(
    useCallback(() => {
      const app = takePendingImport();
      if (app) openImport(app);
    }, [openImport]),
  );

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
    const [profile, w] = await Promise.all([
      getProfile().catch(() => null),
      getWeekVsUsual().catch(() => null),
    ]);
    // unseeded / transient DB error — the greeting and the week card degrade gracefully
    if (profile) setFirstName(profile.name.trim().split(/\s+/)[0] || null);
    setWeek(w);
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

  const answer = useMemo(() => homeAnswer({ today: data?.todaysWorkout.today, open }), [data, open]);
  const below = data ? homeBelow({ parts: PARTS, demo, open: open != null, data }) : null;

  // SH-23: Start really starts — the routine shown on the card (by its id, never worked out
  // again at the tap), or an empty workout. A workout already open is resumed, never replaced;
  // an edit of a past workout left open is asked about first (the same question as every Start).
  const startGuard = useRef(false);
  const lastPush = useRef(0);
  const nextId = data?.todaysWorkout.today?.nextId ?? null;
  const link = data ? todayLink(data.todaysWorkout) : '/workout';
  const onAction = useCallback(
    (action: HomeAction) => {
      thud();
      if (action === 'start' || action === 'startEmpty') {
        const id = action === 'start' ? nextId : null;
        void runGuarded(startGuard, () => startShownWorkout(router, id), () =>
          void tell('Couldn’t start the workout', 'Please try again.'),
        );
        return;
      }
      if (action === 'resume') {
        // RP-25: a double tap opens one workout screen, not two.
        openActiveWorkout(router);
        return;
      }
      const now = Date.now();
      if (now - lastPush.current < PUSH_GUARD_MS) return;
      lastPush.current = now;
      // v0.28.0: today's routine opens its preview first (every exercise, then Start).
      router.push(action === 'preview' ? link : '/routines');
    },
    [router, nextId, link],
  );

  const goCoach = useCallback(() => {
    thud();
    // Opens the coach with this question in the box, unsent (coach.tsx, SH-01).
    router.push({ pathname: '/coach', params: { prompt: "Today's workout" } });
  }, [router]);

  const goInsightCoach = useCallback(() => {
    thud();
    router.push({ pathname: '/coach', params: { prompt: 'What should I focus on today, and why?' } });
  }, [router]);

  const goNutrition = useCallback(() => {
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

        {data && below ? (
          <>
            <Section index={0}>
              <AnswerCard answer={answer} onAction={onAction} />
            </Section>
            {below.switcher ? (
              <Section index={1}>
                <SwitcherCard onPick={openImport} />
              </Section>
            ) : null}
            {below.week && week ? (
              <Section index={1}>
                {/* The same numbers as Progress's "This week so far vs your usual". */}
                <ThisWeekCard
                  week={week}
                  streakWeeks={data.streakWeeks}
                  kgLifted={data.weeklyVolumeKg}
                  unitSystem={unitSystem}
                />
              </Section>
            ) : null}
            {below.rings || below.scores ? (
              <Section index={2}>
                <StatGrid
                  data={data}
                  onPressNutrition={goNutrition}
                  showRings={below.rings}
                  showScores={below.scores}
                />
              </Section>
            ) : null}
            {PARTS.has('insight') ? (
              <Section index={3}>
                <InsightCard insight={data.insight} onPress={goInsightCoach} />
              </Section>
            ) : null}
            {PARTS.has('nextUp') ? (
              <Section index={4}>
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
