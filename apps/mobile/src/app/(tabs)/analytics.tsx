import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  BodyMapSection,
  BodyWeightSection,
  CaloriesSection,
  ConsistencySection,
  ExerciseSection,
  FrequencySection,
  MuscleSection,
  PrSection,
  ProteinSection,
  ReportsCard,
  SectionSkeleton,
  StrengthSection,
  VolumeSection,
  useAnalyticsData,
  useProgressExtras,
} from '@/components/analytics';
import type { RangeDays } from '@/components/analytics';
import { Chip, IconButton, Screen } from '@/components/ui';
import { addDays, todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { motion, space } from '@/theme/tokens';
import { monthOf } from '@/tracker/lib/months';
import { reportIndex } from '@/tracker/services/reportsService';

const RANGES: RangeDays[] = [30, 90, 180];

/**
 * Progress — Phase 3 order, calm top to bottom:
 *   the monthly report and the year so far · the muscles trained in the last 7 days ·
 *   then, over the chosen range: records, body (weight, measurements, photos), training
 *   volume and frequency, sets per muscle, consistency, strength, one lift up close, and
 *   nutrition last.
 */
export default function AnalyticsScreen() {
  const router = useRouter();
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );
  const { range, setRange, bundle, profile, streak, loading } = useAnalyticsData(focusKey);
  const extras = useProgressExtras();

  const pickRange = (r: RangeDays) => {
    if (r === range) return;
    tap();
    setRange(r);
  };

  const today = todayISO();
  const from = addDays(today, -(range - 1));
  const rangeEvents = extras.events.filter((e) => e.dateISO >= from && e.dateISO <= today);
  const months = [...extras.monthCounts.keys()].sort().reverse();
  const idx = reportIndex(months, today);
  const yearWorkouts =
    idx.year != null ? [...extras.monthCounts.entries()].filter(([m]) => m.startsWith(String(idx.year))).reduce((n, [, c]) => n + c, 0) : 0;
  const openReport = (period: string) => {
    tap();
    router.push({ pathname: '/report/[period]', params: { period } });
  };

  return (
    <Screen
      title="Progress"
      subtitle="Every session compounds"
      scroll={false}
      right={<IconButton icon="scale" onPress={() => router.push('/bodyweight')} accessibilityLabel="Log body weight" />}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: space.xs, paddingBottom: space.xxl }}>
        <ReportsCard
          month={idx.month}
          monthRunning={idx.month === monthOf(today)}
          monthWorkouts={idx.month ? extras.monthCounts.get(idx.month) ?? 0 : 0}
          monthRecords={idx.month ? extras.events.filter((e) => monthOf(e.dateISO) === idx.month).length : 0}
          year={idx.year}
          yearRunning={idx.year === Number(today.slice(0, 4))}
          yearWorkouts={yearWorkouts}
          index={0}
          onOpen={openReport}
        />
        {extras.ready ? <BodyMapSection sets={extras.weekMuscles} index={1} /> : <SectionSkeleton index={1} />}

        {/* range for everything below */}
        <Animated.View entering={FadeInDown.delay(60).duration(motion.slow)} style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
          {RANGES.map((r) => (
            <Chip key={r} label={`${r} days`} selected={range === r} onPress={() => pickRange(r)} />
          ))}
        </Animated.View>

        {extras.ready ? (
          <PrSection
            events={rangeEvents}
            rangeDays={range}
            index={2}
            onSeeAll={() => router.push('/records')}
            onOpenExercise={(id) => router.push({ pathname: '/exercise/[id]', params: { id } })}
          />
        ) : (
          <SectionSkeleton index={2} />
        )}

        {(loading && !bundle) || !bundle ? (
          <View>
            {[0, 1, 2, 3].map((i) => (
              <SectionSkeleton key={i} index={i} />
            ))}
          </View>
        ) : (
          <>
            <BodyWeightSection
              data={bundle.weight}
              index={3}
              measureLine={extras.measureLine}
              photoCount={extras.photoCount}
              onWeight={() => router.push('/bodyweight')}
              onMeasurements={() => router.push('/measurements')}
              onPhotos={() => router.push('/photos')}
            />
            <VolumeSection data={bundle.weeklyVolume} index={4} />
            <FrequencySection data={bundle.frequency} index={5} />
            <MuscleSection data={bundle.muscleSets} index={6} />
            <ConsistencySection cells={bundle.consistency} rangeDays={range} streak={streak} index={7} />
            <StrengthSection data={bundle.strengthTrend} index={8} />
          </>
        )}
        {/* lives outside the bundle gate so the selected lift survives range switches */}
        <ExerciseSection rangeDays={range} index={9} />
        {bundle ? (
          <>
            <CaloriesSection data={bundle.calories} target={profile ? profile.calorieTarget : null} index={10} />
            <ProteinSection data={bundle.calories} target={profile ? profile.proteinTargetG : null} index={11} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
