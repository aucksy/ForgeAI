/**
 * R-132 — the Progress tab's "Today" card: today's Up next workout and what to beat in it, in the mode the
 * tabs at the top picked (kilos, sets or time). Words and rules: `lib/todayGoal.ts`. A tap opens the
 * Workout tab, where Up next starts it.
 */
import { Pressable, Text, View } from 'react-native';

import { Card, Icon } from '@/components/ui';
import type { UnitSystem } from '@/lib/units';
import { color, space, type } from '@/theme/tokens';

import { goalText, goalTitle, type ProgressMode, type TodayGoal } from '../../lib/todayGoal';

export function TodayGoalCard({ goal, mode, units, onOpen }: { goal: TodayGoal; mode: ProgressMode; units: UnitSystem; onOpen: () => void }) {
  const t = goalText(goal, mode, units);
  const lineColor = t.trend === 'up' ? color.goodText : color.inkSecondary;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${goalTitle(goal)}. ${t.big} ${t.label}. ${t.line}${t.note ? ` ${t.note}` : ''}`}
      accessibilityHint="Opens the Workout tab"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{goalTitle(goal)}</Text>
          <Icon name="chevron-right" size={18} color={color.inkMuted} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.sm }}>
          <Text style={{ fontFamily: type.display, fontSize: type.size.h1, color: color.ink, letterSpacing: -0.5 }}>{t.big}</Text>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkMuted }}>{t.label}</Text>
        </View>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: lineColor, lineHeight: 20 }}>{t.line}</Text>
        {t.note ? <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 17 }}>{t.note}</Text> : null}
      </Card>
    </Pressable>
  );
}
