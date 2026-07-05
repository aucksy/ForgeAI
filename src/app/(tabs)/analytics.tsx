import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  BodyWeightSection,
  CaloriesSection,
  ConsistencySection,
  ExerciseSection,
  FrequencySection,
  MuscleSection,
  PrSection,
  ProteinSection,
  SectionSkeleton,
  StrengthSection,
  VolumeSection,
  useAnalyticsData,
} from '@/components/analytics';
import type { RangeDays } from '@/components/analytics';
import { Chip, Screen } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { motion, space } from '@/theme/tokens';

const RANGES: RangeDays[] = [30, 90, 180];

/** Progress — the full analytics story: body, volume, nutrition, PRs, strength. */
export default function AnalyticsScreen() {
  const { range, setRange, bundle, profile, streak, loading } = useAnalyticsData();

  const pickRange = (r: RangeDays) => {
    if (r === range) return;
    tap();
    setRange(r);
  };

  return (
    <Screen title="Progress" subtitle="Every session compounds" scroll={false}>
      {/* range selector — pinned under the header */}
      <Animated.View
        entering={FadeInDown.delay(60).duration(motion.slow)}
        style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}
      >
        {RANGES.map((r) => (
          <Chip
            key={r}
            label={`${r} days`}
            selected={range === r}
            onPress={() => pickRange(r)}
          />
        ))}
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: space.xs, paddingBottom: space.xxl }}
      >
        {loading || !bundle ? (
          <View>
            {[0, 1, 2, 3].map((i) => (
              <SectionSkeleton key={i} index={i} />
            ))}
          </View>
        ) : (
          <>
            <BodyWeightSection data={bundle.weight} index={0} />
            <VolumeSection data={bundle.weeklyVolume} index={1} />
            <FrequencySection data={bundle.frequency} index={2} />
            <CaloriesSection
              data={bundle.calories}
              target={profile ? profile.calorieTarget : null}
              index={3}
            />
            <ProteinSection
              data={bundle.calories}
              target={profile ? profile.proteinTargetG : null}
              index={4}
            />
            <MuscleSection data={bundle.muscleVolume} index={5} />
            <ConsistencySection
              cells={bundle.consistency}
              rangeDays={range}
              streak={streak}
              index={6}
            />
            <PrSection prs={bundle.prTimeline} index={7} />
            <StrengthSection data={bundle.strengthTrend} index={8} />
          </>
        )}
        {/* lives outside the bundle gate so the selected lift survives range switches */}
        <ExerciseSection rangeDays={range} index={9} />
      </ScrollView>
    </Screen>
  );
}
