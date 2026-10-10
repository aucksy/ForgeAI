import { Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { fmtVol } from '@/lib/units';
import { color, space, type } from '@/theme/tokens';
import { usualByText, type WeekVsUsual } from '@/tracker/engine/progressTop';
import type { UnitSystem } from '@/types/models';

interface ThisWeekCardProps {
  /** Progress's own "this week vs your usual" (`getWeekVsUsual`) — the same numbers. */
  week: WeekVsUsual;
  /** THE streak (D9): weeks in a row with at least one workout. */
  streakWeeks: number;
  /** This week's kg lifted, by the one volume rule (the last bar of Progress's weekly chart). */
  kgLifted: number;
  unitSystem: UnitSystem;
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string | null }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${value} ${label}${sub ? `, ${sub}` : ''}`}>
      <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>{value}</Text>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{label}</Text>
      {sub ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{sub}</Text> : null}
    </View>
  );
}

/**
 * This week's numbers under Home's answer card (audit Phase 7): workouts, sets and lifts that
 * beat a best — the very numbers on Progress ("This week so far vs your usual") — with the
 * weeks in a row and the kg lifted as one line of facts.
 */
export function ThisWeekCard({ week, streakWeeks, kgLifted, unitSystem }: ThisWeekCardProps) {
  const { week: w, usual, usualByNow } = week;
  const by = usual && usualByNow ? usualByNow : null;
  const today = todayISO();
  const facts = [
    streakWeeks > 0 ? `${streakWeeks} ${streakWeeks === 1 ? 'week' : 'weeks'} in a row` : null,
    kgLifted > 0 ? `${fmtVol(kgLifted, unitSystem)} lifted` : null,
  ].filter((f): f is string => f != null);
  return (
    <Card style={{ gap: space.md }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        This week so far
      </Text>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Stat value={fmtInt(w.workouts)} label={w.workouts === 1 ? 'workout' : 'workouts'} sub={by ? usualByText(by.workouts, today) : null} />
        <Stat value={fmtInt(w.sets)} label={w.sets === 1 ? 'set' : 'sets'} sub={by ? usualByText(by.sets, today) : null} />
        <Stat value={fmtInt(w.liftsUp)} label={w.liftsUp === 1 ? 'lift up' : 'lifts up'} sub={null} />
      </View>
      {facts.length > 0 ? (
        <Text
          style={{
            fontFamily: type.bodyMedium,
            fontSize: type.size.sub,
            color: color.inkSecondary,
            paddingTop: space.md,
            borderTopWidth: 1,
            borderTopColor: color.border,
          }}
        >
          {facts.join(' · ')}
        </Text>
      ) : null}
    </Card>
  );
}
