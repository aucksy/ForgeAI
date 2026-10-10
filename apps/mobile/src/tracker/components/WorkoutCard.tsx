/**
 * History list item: a saved workout as a tappable card (Phase 3 packet C).
 *
 *   Push 1                                     12,480 kg
 *   Fri, 9 Oct 2025 · 18:05 · 52 min           Easy week
 *   Bench Press, Incline Press, Fly · +2 more
 *
 * The words come from `historyCardFacts` (PURE, tested): the workout's own name, the date with
 * its year when it isn't this year, the start time and length, the top 3 exercises, and kg
 * lifted — a run shows its distance and a plank its time, never "0 kg" (HI-09).
 */
import { memo } from 'react';
import { Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressScale } from '@/components/ui/PressScale';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';

import { historyCardFacts } from '../services/historyCard';
import type { HistoryItem } from '../services/historyFeed';

export const WorkoutCard = memo(function WorkoutCard({ session, onPress }: { session: HistoryItem; onPress: () => void }) {
  useUnits(); // v0.27.0: kg or lb (re-render on a units change)
  const f = historyCardFacts(session);
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={`${f.title}. ${f.when}. ${f.metric}.${f.easyWeek ? ' Easy week.' : ''} ${f.top}. Open`}
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.lg,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: color.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="dumbbell" size={20} color={color.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            {f.title}
          </Text>
          <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: color.ink }}>{f.metric}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{f.when}</Text>
          {f.easyWeek ? (
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkSecondary }}>Easy week</Text>
          ) : null}
        </View>
        {f.top ? (
          <Text numberOfLines={2} style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkSecondary }}>
            {f.top}
          </Text>
        ) : null}
      </View>
    </PressScale>
  );
});
