import { Pressable, Text, View } from 'react-native';

import { Badge, EmptyState, Icon } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { useUnits } from '@/lib/useUnits';
import { color, space, type } from '@/theme/tokens';
import { liftsBeatingBest, liftsUpShort } from '@/tracker/engine/headline';
import { recordsLink } from '@/tracker/engine/progressTop';
import { RECORD_LABEL } from '@/tracker/engine/records';
import { recordValueText } from '@/tracker/services/recordText';
import type { RecordEventRow } from '@/tracker/services/recordsService';

import { HeaderStat, Section } from './Section';

export interface PrSectionProps {
  /** Record events inside the chosen range, newest first. */
  events: RecordEventRow[];
  /** Every record ever (PG-05: the list stays reachable when the range has none). */
  allCount: number;
  rangeDays: number;
  index: number;
  /** Opens the records list: the range's records ('range') or every record ('all') — PG-06. */
  onSeeAll: (scope: 'range' | 'all') => void;
  onOpenExercise: (exerciseId: string) => void;
}

const MAX_ROWS = 6;

/**
 * Personal records (Phase 3): the latest records of every kind — heaviest, best set, best
 * session, most reps, longest time and distance — newest first. A record is a workout
 * that beat an earlier best; a first workout with an exercise sets its bests quietly. The
 * header counts LIFTS ("4 lifts up in 90 days", D10); each kind shows on its own row.
 * Audit Phase 5: "See all 14" opens exactly those 14 (PG-06), and every record stays one tap
 * away even when the range has none (PG-05).
 */
export function PrSection({ events, allCount, rangeDays, index, onSeeAll, onOpenExercise }: PrSectionProps) {
  useUnits(); // v0.27.0: the record and set texts follow Profile → Units
  const rows = events.slice(0, MAX_ROWS);
  const link = recordsLink(events.length, allCount, MAX_ROWS);
  const linkRow = link ? (
    <Pressable
      onPress={() => onSeeAll(link.scope)}
      accessibilityRole="button"
      accessibilityLabel={link.scope === 'range' ? `See all ${events.length} records from the last ${rangeDays} days` : 'See all records'}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 48 }}
    >
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{link.label}</Text>
      <Icon name="chevron-right" size={16} color={color.accent} />
    </Pressable>
  ) : null;

  return (
    <Section
      index={index}
      right={events.length > 0 ? <HeaderStat text={`${liftsUpShort(liftsBeatingBest(events))} in ${rangeDays} days`} /> : undefined}
    >
      {rows.length === 0 ? (
        allCount > 0 ? (
          <View>
            <EmptyState icon="medal" title={`No new bests in ${rangeDays} days`} body="Beat a previous best and it lands here." />
            {linkRow}
          </View>
        ) : (
          <EmptyState icon="medal" title="No records yet" body="Beat a previous best and it lands here." />
        )
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
                <Icon name="medal" size={18} color={color.accentBright} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
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
          {linkRow}
        </View>
      )}
    </Section>
  );
}
