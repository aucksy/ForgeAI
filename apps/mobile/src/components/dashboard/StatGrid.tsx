import { Pressable, Text, View } from 'react-native';

import { RingGauge, StatTile } from '@/components/ui';
import { scoreTiles } from '@/lib/features';
import { tap } from '@/lib/haptics';
import { chart, color, radius, shadow, space, type } from '@/theme/tokens';
import type { DashboardData } from '@/types/models';

import { nutritionRings, nutritionRingsLabel, NUTRITION_RINGS_HINT } from './nutritionRings';

interface StatGridProps {
  data: DashboardData;
  /** Tapping the calorie/protein rings opens the nutrition manager. */
  onPressNutrition?: () => void;
  /** Calorie/protein rings (nutrition switch). Default shown. */
  showRings?: boolean;
  /** Recovery/strength tiles (coach switch). Default shown. */
  showScores?: boolean;
}

const PROTEIN_COLOR = chart.series[2]; // aqua — distinct from the calorie ember

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** One quadrant with a titled progress ring (calories / protein). */
function RingCard({
  title,
  value,
  max,
  label,
  sublabel,
  ringColor,
}: {
  title: string;
  value: number;
  max: number;
  label: string;
  sublabel: string;
  ringColor?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.lg,
        alignItems: 'center',
        ...shadow.card,
      }}
    >
      {/* The ring says its title itself ("Calories, 1,420 of 2,200"), so the visible title is
          not read a second time. */}
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={{
          alignSelf: 'flex-start',
          fontFamily: type.bodyMedium,
          fontSize: type.size.sub,
          color: color.inkSecondary,
        }}
      >
        {title}
      </Text>
      <View style={{ marginTop: space.md, marginBottom: space.xs }}>
        <RingGauge
          value={value}
          max={max}
          size={104}
          title={title}
          label={label}
          sublabel={sublabel}
          color={ringColor}
        />
      </View>
    </View>
  );
}

/** 2x2 stat grid: calorie + protein rings on top, recovery + strength tiles below. */
export function StatGrid({
  data,
  onPressNutrition,
  showRings = true,
  showScores = true,
}: StatGridProps) {
  const scores = scoreTiles(data);
  const words = nutritionRings(data);
  const rings = (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <RingCard {...words.calories} />
      <RingCard {...words.protein} ringColor={PROTEIN_COLOR} />
    </View>
  );

  return (
    <View style={{ gap: space.md }}>
      {!showRings ? null : onPressNutrition ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nutritionRingsLabel(words)}
          accessibilityHint={NUTRITION_RINGS_HINT}
          onPress={() => {
            tap();
            onPressNutrition();
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          {rings}
        </Pressable>
      ) : (
        rings
      )}
      {/* SH-08: a score shows only when it can be worked out — never "Strength 0" without
          body weight or "Recovery 95 · Primed" before the first workout. */}
      {showScores && (scores.recovery || scores.strength) ? (
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {scores.recovery ? (
            <View style={{ flex: 1 }}>
              <StatTile
                label="Recovery"
                value={data.recovery.score}
                unit={capitalize(data.recovery.label)}
                icon="heart"
              />
            </View>
          ) : null}
          {scores.strength ? (
            <View style={{ flex: 1 }}>
              <StatTile
                label="Strength"
                value={data.strength.score}
                unit={data.strength.label}
                icon="trend"
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
