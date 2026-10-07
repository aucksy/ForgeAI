import { Pressable, Text, View } from 'react-native';

import { Badge, EmptyState, Icon } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';
import { RECORD_LABEL } from '@/tracker/engine/records';
import { recordValueText } from '@/tracker/services/recordText';
import type { RecordEventRow } from '@/tracker/services/recordsService';

import { HeaderStat, Section } from './Section';

export interface PrSectionProps {
  /** Record events inside the chosen range, newest first. */
  events: RecordEventRow[];
  rangeDays: number;
  index: number;
  onSeeAll: () => void;
  onOpenExercise: (exerciseId: string) => void;
}

const MAX_ROWS = 6;

/**
 * Personal records (Phase 3): the latest records of every kind — heaviest, best set, best
 * session, most reps, longest time and distance — newest first. A record is a workout
 * that beat an earlier best; a first workout with an exercise sets its bests quietly.
 */
export function PrSection({ events, rangeDays, index, onSeeAll, onOpenExercise }: PrSectionProps) {
  const rows = events.slice(0, MAX_ROWS);

  return (
    <Section
      title="Personal Records"
      index={index}
      right={events.length > 0 ? <HeaderStat text={`${events.length} in ${rangeDays} days`} /> : undefined}
    >
      {rows.length === 0 ? (
        <EmptyState icon="trophy" title="No records yet" body="Beat a previous best and it lands here — automatically." />
      ) : (
        <View style={{ gap: space.lg }}>
          {rows.map((r, i) => (
            <Pressable
              key={`${r.exerciseId}-${r.kind}-${r.sessionId}-${i}`}
              onPress={() => onOpenExercise(r.exerciseId)}
              accessibilityRole="button"
              accessibilityLabel={`${r.exerciseName}, ${RECORD_LABEL[r.kind]}, ${recordValueText(r, r.info)}, ${tinyDate(r.dateISO)}`}
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
                <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                  {r.exerciseName}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 3 }}>
                  <Badge label={RECORD_LABEL[r.kind]} tone="accent" />
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>{recordValueText(r, r.info)}</Text>
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, marginTop: 2 }}>
                  {tinyDate(r.dateISO)}
                </Text>
              </View>
            </Pressable>
          ))}
          {events.length > MAX_ROWS ? (
            <Pressable
              onPress={onSeeAll}
              accessibilityRole="button"
              accessibilityLabel={`See all ${events.length} records`}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingTop: space.xs }}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>See all {events.length} records</Text>
              <Icon name="chevron-right" size={16} color={color.accent} />
            </Pressable>
          ) : null}
        </View>
      )}
    </Section>
  );
}
