import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, FoldedList, Icon } from '@/components/ui';
import { color, motion, space, type } from '@/theme/tokens';
import { liftsUpShort } from '@/tracker/engine/headline';
import { yearRowSub } from '@/tracker/engine/reports';
import { monthName, monthTitle } from '@/tracker/lib/months';

export interface ReportsCardProps {
  /** The month to offer ('YYYY-MM'), or null. */
  month: string | null;
  /** The month is still running (reads "so far"). */
  monthRunning: boolean;
  monthWorkouts: number;
  /** D10: lifts that beat a best that month (not every kind of record). */
  monthRecords: number;
  year: number | null;
  yearRunning: boolean;
  yearWorkouts: number;
  /** PG-15: through January, last year's review beside this year so far (null otherwise). */
  lastYear?: number | null;
  lastYearWorkouts?: number;
  /** PG-15: every other report, newest first. */
  earlier?: { period: string; title: string }[];
  index: number;
  onOpen: (period: string) => void;
}

function Row({ title, sub, onPress, label }: { title: string; sub: string; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: 56 }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="calendar" size={18} color={color.accentBright} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{title}</Text>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, marginTop: 2 }}>{sub}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </Pressable>
  );
}

/**
 * Phase 3: the monthly report and the year in review, one quiet card at the top of
 * Progress. Last month's report (Hevy shows it at the start of a month); this year so far.
 */
export function ReportsCard(p: ReportsCardProps) {
  if (!p.month && p.year == null) return null;
  const workouts = (n: number) => `${n} ${n === 1 ? 'workout' : 'workouts'}`;
  return (
    <Animated.View entering={FadeInDown.delay(60 * Math.min(p.index, 8)).duration(motion.slow)} style={{ marginBottom: space.xl }}>
      <Card style={{ paddingVertical: space.sm }}>
        {p.month ? (
          <Row
            title={p.monthRunning ? `${monthName(p.month)} so far` : `${monthTitle(p.month)} report`}
            sub={p.monthRecords > 0 ? `${workouts(p.monthWorkouts)} · ${liftsUpShort(p.monthRecords)}` : workouts(p.monthWorkouts)}
            label={`Open the ${monthTitle(p.month)} report`}
            onPress={() => p.onOpen(p.month as string)}
          />
        ) : null}
        {p.month && p.year != null ? <View style={{ height: 1, backgroundColor: color.border }} /> : null}
        {p.year != null ? (
          <Row
            title={p.yearRunning ? `${p.year} so far` : `${p.year} in review`}
            sub={yearRowSub(p.yearWorkouts, p.yearRunning, p.year)}
            label={`Open the year in review for ${p.year}`}
            onPress={() => p.onOpen(String(p.year))}
          />
        ) : null}
        {p.lastYear != null ? (
          <>
            <View style={{ height: 1, backgroundColor: color.border }} />
            <Row
              title={`${p.lastYear} in review`}
              sub={yearRowSub(p.lastYearWorkouts ?? 0, false, p.lastYear)}
              label={`Open the year in review for ${p.lastYear}`}
              onPress={() => p.onOpen(String(p.lastYear))}
            />
          </>
        ) : null}
      </Card>
      {p.earlier && p.earlier.length > 0 ? (
        <View style={{ marginTop: space.md }}>
          <FoldedList
            title="Earlier reports"
            noun="report"
            items={p.earlier}
            keyOf={(r) => r.period}
            renderItem={(r) => (
              <Pressable
                onPress={() => p.onOpen(r.period)}
                accessibilityRole="button"
                accessibilityLabel={`Open the ${r.title} report`}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.lg }}
              >
                <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{r.title}</Text>
                <Icon name="chevron-right" size={16} color={color.inkMuted} />
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}
