import { Text, View } from 'react-native';

import { Badge, EmptyState, Icon } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { color, space, type } from '@/theme/tokens';
import type { PersonalRecord } from '@/types/models';

import { Section } from './Section';

export interface PrSectionProps {
  prs: (PersonalRecord & { exerciseName: string })[];
  index: number;
}

const MAX_ROWS = 8;

const KIND_META: Record<PersonalRecord['kind'], { label: string; tone: 'accent' | 'good' | 'neutral' }> = {
  weight: { label: 'Top weight', tone: 'accent' },
  e1rm: { label: 'e1RM', tone: 'good' },
  volume: { label: 'Volume', tone: 'neutral' },
};

/** Personal-record timeline: trophy rows, newest first. */
export function PrSection({ prs, index }: PrSectionProps) {
  const rows = prs.slice(0, MAX_ROWS);

  return (
    <Section
      title="Personal Records"
      index={index}
      caption={rows.length > 0 ? 'PRs update automatically when you log workouts.' : undefined}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No PRs yet"
          body="Beat a previous best and it lands here — automatically."
        />
      ) : (
        <View style={{ gap: space.lg }}>
          {rows.map((pr) => (
            <View
              key={pr.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: color.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="trophy" size={18} color={color.accentBright} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}
                >
                  {pr.exerciseName}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    marginTop: 3,
                  }}
                >
                  <Badge label={KIND_META[pr.kind].label} tone={KIND_META[pr.kind].tone} />
                  <Text
                    style={{
                      fontFamily: type.body,
                      fontSize: type.size.caption,
                      color: color.inkMuted,
                    }}
                  >
                    {trimNum(pr.weightKg)} kg × {pr.reps}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}
                >
                  {trimNum(pr.value)} kg
                </Text>
                <Text
                  style={{
                    fontFamily: type.bodyMedium,
                    fontSize: type.size.caption,
                    color: color.inkMuted,
                    marginTop: 2,
                  }}
                >
                  {tinyDate(pr.dateISO)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}
