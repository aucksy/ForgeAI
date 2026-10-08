/** History list item: a completed session as a tappable card. */
import { Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressScale } from '@/components/ui/PressScale';
import { relativeDay } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';
import type { SessionDetail } from '@/types/models';

import { dayTypeLabel } from '../services/finishSummary';

export function WorkoutCard({ session, onPress }: { session: SessionDetail; onPress: () => void }) {
  const units = useUnits(); // v0.27.0: kg or lb
  const workingSets = session.exercises.reduce((n, g) => n + g.sets.filter((s) => !s.isWarmup).length, 0);
  return (
    <PressScale
      onPress={onPress}
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
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
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {dayTypeLabel(session.dayType)}
        </Text>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
          {relativeDay(session.dateISO)} · {countWord(session.exercises.length, 'exercise')} · {countWord(workingSets, 'set')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>
          {fmtInt(kgToShown(session.totalVolumeKg, units))}
        </Text>
        <Text style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}>{weightUnitOf(units)}</Text>
      </View>
    </PressScale>
  );
}
