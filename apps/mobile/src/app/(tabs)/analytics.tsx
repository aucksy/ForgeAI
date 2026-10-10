import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  BodyMapSection,
  BodyWeightSection,
  CaloriesSection,
  ConsistencySection,
  FrequencySection,
  LiftsSection,
  MuscleSection,
  PrSection,
  ProteinSection,
  ReportsCard,
  SectionSkeleton,
  StrengthSection,
  VolumeSection,
  WeekCard,
  WelcomeCard,
  trainedDays,
  useAnalyticsData,
  useProgressExtras,
  useProgressTop,
} from '@/components/analytics';
import type { RangeDays } from '@/components/analytics';
import { Chip, FoldSection, IconButton, LoadError, Screen } from '@/components/ui';
import type { FoldNoun } from '@/components/ui';
import { addDays, todayISO } from '@/lib/date';
import { FEATURES } from '@/lib/features';
import { tap } from '@/lib/haptics';
import { motion, space } from '@/theme/tokens';
import { MAPPED_MUSCLES, muscleLevels, untrainedMuscles } from '@/tracker/engine/bodyMap';
import { liftsBeatingBest } from '@/tracker/engine/headline';
import { progressMode } from '@/tracker/engine/progressTop';
import { monthOf } from '@/tracker/lib/months';
import { earlierReports, reportIndex } from '@/tracker/services/reportsService';

const RANGES: RangeDays[] = [30, 90, 180];

function Fold({ title, count, noun, children }: { title: string; count: number; noun: FoldNoun; children: ReactNode }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <FoldSection title={title} count={count} noun={noun}>
        <View style={{ paddingTop: space.sm }}>{children}</View>
      </FoldSection>
    </View>
  );
}

/**
 * Progress — audit Phase 5: the answer first.
 *   1. "This week vs your usual" (workouts, sets, lifts that beat a best, the lift up most);
 *   2. the range chips, then "Your lifts" — the member's most-trained lifts and any exercise;
 *   3. everything else folded shut under a counted heading: records, the muscles of the last
 *      7 days (tap one), training (days trained, kg lifted, workouts a week, sets per muscle,
 *      strength), body, reports.
 * History owns the calendar, so Progress keeps one line of it. A new member sees one card.
 */
export default function AnalyticsScreen() {
  const router = useRouter();
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );
  const { range, setRange, bundle, profile, streak, loading, failed, retry } = useAnalyticsData(focusKey);
  const extras = useProgressExtras();
  const { top, failed: topFailed, retry: topRetry } = useProgressTop(focusKey);
  const mode = progressMode(top ? top.totalWorkouts : null);

  const pickRange = (r: RangeDays) => {
    if (r === range) return;
    tap();
    setRange(r);
  };
  const openExercise = (id: string) => router.push({ pathname: '/exercise/[id]', params: { id } });
  const openReport = (period: string) => {
    tap();
    router.push({ pathname: '/report/[period]', params: { period } });
  };

  const today = todayISO();
  const from = addDays(today, -(range - 1));
  const rangeEvents = extras.events.filter((e) => e.dateISO >= from && e.dateISO <= today);
  const months = [...extras.monthCounts.keys()].sort().reverse();
  const idx = reportIndex(months, today);
  const earlier = earlierReports(months, today, idx);
  const workoutsIn = (year: number | null) =>
    year != null ? [...extras.monthCounts.entries()].filter(([m]) => m.startsWith(String(year))).reduce((n, [, c]) => n + c, 0) : 0;
  const reportCount = (idx.month ? 1 : 0) + (idx.year != null ? 1 : 0) + (idx.lastYear != null ? 1 : 0) + earlier.length;
  const musclesTrained = MAPPED_MUSCLES.length - untrainedMuscles(muscleLevels(extras.weekMuscles)).length;

  const body = (() => {
    if (topFailed) return <LoadError what="your progress" onRetry={topRetry} />;
    if (mode === 'loading' || !top) {
      return (
        <View>
          {[0, 1, 2].map((i) => (
            <SectionSkeleton key={i} index={i} />
          ))}
        </View>
      );
    }
    // UX-3 / PG-24: a new member sees one friendly card, not nine empty boxes.
    if (mode === 'welcome') return <WelcomeCard onStart={() => router.navigate('/workout')} />;

    return (
      <>
        <WeekCard week={top.week} onOpenExercise={openExercise} />

        {/* the range for everything below */}
        <Animated.View entering={FadeInDown.delay(60).duration(motion.slow)} style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
          {RANGES.map((r) => (
            <Chip key={r} label={`${r} days`} selected={range === r} onPress={() => pickRange(r)} />
          ))}
        </Animated.View>

        <LiftsSection lifts={top.lifts} rangeDays={range} focusKey={focusKey} index={2} />

        {!extras.ready ? (
          <SectionSkeleton index={3} />
        ) : extras.eventsFailed ? (
          <LoadError what="your records" onRetry={extras.retry} />
        ) : (
          <Fold title={`Records · ${range} days`} count={liftsBeatingBest(rangeEvents)} noun={{ one: 'lift up', other: 'lifts up' }}>
            <PrSection
              events={rangeEvents}
              allCount={extras.events.length}
              rangeDays={range}
              index={0}
              onSeeAll={(scope) =>
                router.push(scope === 'range' ? { pathname: '/records', params: { from, label: `the last ${range} days` } } : '/records')
              }
              onOpenExercise={openExercise}
            />
          </Fold>
        )}

        {!extras.ready ? null : extras.musclesFailed ? (
          <LoadError what="this week's muscles" onRetry={extras.retry} />
        ) : (
          <Fold title="Muscles · last 7 days" count={musclesTrained} noun="muscle">
            <BodyMapSection sets={extras.weekMuscles} index={0} onOpenExercise={openExercise} />
          </Fold>
        )}

        {!bundle && failed ? (
          // PG-23: a failed read is said, with a retry — never "No data yet" on every chart.
          <LoadError what="your training and body charts" onRetry={retry} />
        ) : (loading && !bundle) || !bundle ? (
          <SectionSkeleton index={4} />
        ) : (
          <>
            <Fold title={`Training · ${range} days`} count={trainedDays(bundle.consistency)} noun={{ one: 'day trained', other: 'days trained' }}>
              <ConsistencySection cells={bundle.consistency} rangeDays={range} streak={streak} />
              <VolumeSection data={bundle.weeklyVolume} index={0} />
              <FrequencySection data={bundle.frequency} index={0} />
              <MuscleSection data={bundle.muscleSets} index={0} />
              <StrengthSection
                data={bundle.strengthTrend}
                hasBodyWeight={extras.lastWeighIn != null}
                onAddWeight={() => router.push('/bodyweight')}
                index={0}
              />
            </Fold>
            <Fold title={`Body · ${range} days`} count={bundle.weight.length} noun="weigh-in">
              <BodyWeightSection
                data={bundle.weight}
                goal={profile?.goal ?? null}
                index={0}
                measureLine={extras.measureLine}
                photoCount={extras.photoCount}
                lastWeighIn={extras.lastWeighIn}
                onWeight={() => router.push('/bodyweight')}
                // PG-26: Measurements opens on the measurement this row shows.
                onMeasurements={() => router.push(extras.measureKind ? { pathname: '/measurements', params: { kind: extras.measureKind } } : '/measurements')}
                onPhotos={() => router.push('/photos')}
              />
            </Fold>
          </>
        )}

        {extras.ready && reportCount > 0 ? (
          <Fold title="Reports" count={reportCount} noun="report">
            <ReportsCard
              month={idx.month}
              monthRunning={idx.month === monthOf(today)}
              monthWorkouts={idx.month ? extras.monthCounts.get(idx.month) ?? 0 : 0}
              monthRecords={idx.month ? liftsBeatingBest(extras.events.filter((e) => monthOf(e.dateISO) === idx.month)) : 0}
              year={idx.year}
              yearRunning={idx.year === Number(today.slice(0, 4))}
              yearWorkouts={workoutsIn(idx.year)}
              lastYear={idx.lastYear}
              lastYearWorkouts={workoutsIn(idx.lastYear)}
              earlier={earlier}
              index={0}
              onOpen={openReport}
            />
          </Fold>
        ) : null}

        {/* Nutrition is hidden (owner decision D4): no way to log a meal, so no empty charts. */}
        {bundle && FEATURES.nutrition ? (
          <>
            <CaloriesSection data={bundle.calories} target={profile ? profile.calorieTarget : null} index={10} />
            <ProteinSection data={bundle.calories} target={profile ? profile.proteinTargetG : null} index={11} />
          </>
        ) : null}
      </>
    );
  })();

  return (
    <Screen
      title="Progress"
      subtitle={streak > 0 ? `${streak} ${streak === 1 ? 'week' : 'weeks'} in a row` : undefined}
      right={<IconButton icon="scale" onPress={() => router.push('/bodyweight')} accessibilityLabel="Log body weight" />}
    >
      <View style={{ paddingBottom: space.xxl }}>{body}</View>
    </Screen>
  );
}
