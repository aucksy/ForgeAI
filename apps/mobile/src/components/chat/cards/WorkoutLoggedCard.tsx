import { StyleSheet, Text, View } from 'react-native';

import { AnimatedNumber, Badge, Icon } from '@/components/ui';
import { relativeDay } from '@/lib/date';
import { fmtCompact, fmtInt, trimNum } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';

import type { WorkoutLoggedView } from '../payload';
import { CardShell, Divider } from './CardShell';

const GOOD_BG = 'rgba(61, 203, 108, 0.14)';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Summary card for a logged session + trophy rows for any fresh PRs. */
export function WorkoutLoggedCard({ data }: { data: WorkoutLoggedView }) {
  return (
    <CardShell
      icon="check"
      iconColor={color.goodText}
      iconBg={GOOD_BG}
      title={`${capitalize(data.dayType)} day logged`}
      subtitle={data.dateISO ? relativeDay(data.dateISO) : 'Saved to your training log'}
    >
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
        <View style={styles.statBox}>
          <AnimatedNumber
            value={data.totalVolumeKg}
            format={(n) => fmtCompact(n)}
            style={styles.statValue}
          />
          <Text style={styles.statLabel}>kg volume</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{fmtInt(data.setCount)}</Text>
          <Text style={styles.statLabel}>sets</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{fmtInt(data.exercises.length)}</Text>
          <Text style={styles.statLabel}>exercises</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
        {data.exercises.map((e, i) => (
          <View key={`${e.name}-${i}`} style={styles.chip}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: type.bodyMedium,
                fontSize: type.size.caption,
                color: color.inkSecondary,
                maxWidth: 180,
              }}
            >
              {e.name}
            </Text>
            <Text
              style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}
            >
              {`${e.setCount}×`}
            </Text>
          </View>
        ))}
      </View>

      {data.newPrs.length > 0 ? (
        <>
          <Divider mt={space.lg} mb={space.xs} />
          {data.newPrs.map((pr, i) => (
            <View
              key={`${pr.exerciseName}-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingVertical: space.sm,
              }}
            >
              <Icon name="trophy" size={17} color={color.accentBright} />
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}
                >
                  {pr.exerciseName}
                </Text>
                <Text
                  style={{
                    fontFamily: type.mono,
                    fontSize: type.size.caption,
                    color: color.inkSecondary,
                    marginTop: 1,
                  }}
                >
                  {pr.kind === 'e1rm'
                    ? `e1RM ${trimNum(pr.value)} kg`
                    : `${trimNum(pr.weightKg)} kg × ${pr.reps}`}
                </Text>
              </View>
              <Badge label="NEW PR" tone="accent" />
            </View>
          ))}
        </>
      ) : null}
    </CardShell>
  );
}

const styles = StyleSheet.create({
  statBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
  },
  statValue: {
    fontFamily: type.monoBold,
    fontSize: 18,
    color: color.ink,
  },
  statLabel: {
    fontFamily: type.bodyMedium,
    fontSize: type.size.caption,
    color: color.inkMuted,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.border,
  },
});
