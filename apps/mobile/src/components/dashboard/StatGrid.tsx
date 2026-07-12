import { Pressable, Text, View } from 'react-native';

import { RingGauge, StatTile } from '@/components/ui';
import { fmtInt } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { chart, color, radius, shadow, space, type } from '@/theme/tokens';
import type { DashboardData } from '@/types/models';

interface StatGridProps {
  data: DashboardData;
  /** Tapping the calorie/protein rings opens the nutrition manager. */
  onPressNutrition?: () => void;
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
      <Text
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
          label={label}
          sublabel={sublabel}
          color={ringColor}
        />
      </View>
    </View>
  );
}

/** 2x2 stat grid: calorie + protein rings on top, recovery + strength tiles below. */
export function StatGrid({ data, onPressNutrition }: StatGridProps) {
  const rings = (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <RingCard
        title="Calories"
        value={data.caloriesToday}
        max={data.calorieTarget}
        label={fmtInt(data.caloriesToday)}
        sublabel={`of ${fmtInt(data.calorieTarget)}`}
      />
      <RingCard
        title="Protein"
        value={data.proteinTodayG}
        max={data.proteinTargetG}
        label={`${Math.round(data.proteinTodayG)}g`}
        sublabel={`of ${Math.round(data.proteinTargetG)}g`}
        ringColor={PROTEIN_COLOR}
      />
    </View>
  );

  return (
    <View style={{ gap: space.md }}>
      {onPressNutrition ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nutrition — view and log today's meals"
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
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <StatTile
            label="Recovery"
            value={data.recovery.score}
            unit={capitalize(data.recovery.label)}
            icon="heart"
          />
        </View>
        <View style={{ flex: 1 }}>
          <StatTile
            label="Strength"
            value={data.strength.score}
            unit={data.strength.label}
            icon="zap"
          />
        </View>
      </View>
    </View>
  );
}
