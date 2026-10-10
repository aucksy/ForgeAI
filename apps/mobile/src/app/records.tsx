/**
 * Every record, newest first, under month headings (Phase 3). Opened from Progress → Records
 * → "See all". Tap a record → its exercise page, where each record also opens the workout it
 * was set in. Audit Phase 5 (PG-06, PG-14): opened with `from` / `to` (and a `label` such as
 * "the last 30 days" or "September 2026") it lists exactly that span — "See all 14" opens 14.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Badge, EmptyState, GhostButton, LoadError, Screen, Skeleton } from '@/components/ui';
import { useLoad } from '@/lib/useLoad';
import { goBack } from '@/lib/goBack';
import { tinyDate } from '@/lib/date';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { liftsBeatingBest, liftsUpText } from '@/tracker/engine/headline';
import { filterRecords } from '@/tracker/engine/progressTop';
import { RECORD_LABEL } from '@/tracker/engine/records';
import { recordDetailText, recordValueText, withMonthHeadings } from '@/tracker/services/recordText';
import { getRecordEvents } from '@/tracker/services/recordsService';

export default function RecordsScreen() {
  useUnits(); // v0.27.0: the record and set texts follow Profile → Units
  const router = useRouter();
  // HI-11: a failed read says "Couldn't load your records", never "No records yet".
  const { data: all, state, retry } = useLoad(getRecordEvents, [], { onFocus: true });
  const params = useLocalSearchParams<{ from?: string; to?: string; label?: string }>();
  const one = (v: string | string[] | undefined): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = one(params.from);
  const to = one(params.to);
  const scoped = from != null || to != null;
  const label = typeof params.label === 'string' && params.label.length > 0 ? params.label : null;
  const rows = all ? filterRecords(all, from, to) : null;
  const span = scoped ? (label ? ` in ${label}` : '') : '';

  return (
    <Screen
      title="Records"
      // D10: the total counts LIFTS; every record each one set is listed below.
      subtitle={
        rows && rows.length > 0
          ? `${liftsUpText(liftsBeatingBest(rows))}${span} · ${rows.length} ${rows.length === 1 ? 'record' : 'records'}, newest first`
          : undefined
      }
      scroll={false}
      onBack={() => goBack(router, '/analytics')}
    >
      {state === 'error' ? (
        <LoadError what="your records" onRetry={retry} />
      ) : rows === null ? (
        <View style={{ gap: space.md }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="100%" height={58} radius={radius.lg} />
          ))}
        </View>
      ) : rows.length === 0 ? (
        <View>
          <EmptyState icon="medal" title={scoped ? `No new bests${span}` : 'No records yet'} body="Beat a previous best and it lands here." />
          {scoped && all && all.length > 0 ? <GhostButton label="See all records" onPress={() => router.setParams({ from: '', to: '', label: '' })} /> : null}
        </View>
      ) : (
        <FlatList
          data={withMonthHeadings(rows)}
          keyExtractor={(it) => it.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          ListFooterComponent={
            scoped && all && all.length > rows.length ? (
              <View style={{ marginTop: space.lg }}>
                <GhostButton label={`See all ${all.length} records`} onPress={() => router.setParams({ from: '', to: '', label: '' })} />
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === 'month' ? (
              <Text
                style={{
                  fontFamily: type.heading,
                  fontSize: type.size.sub,
                  color: color.inkSecondary,
                  marginTop: space.lg,
                  marginBottom: space.sm,
                }}
              >
                {item.title}
              </Text>
            ) : (
              <Pressable
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.row.exerciseId } })}
                accessibilityRole="button"
                accessibilityLabel={`${item.row.exerciseName}, ${RECORD_LABEL[item.row.kind]}, ${recordValueText(item.row, item.row.info)}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingVertical: space.sm,
                  paddingHorizontal: space.md,
                  marginBottom: space.sm,
                  borderRadius: radius.md,
                  backgroundColor: color.surface,
                  borderWidth: 1,
                  borderColor: color.border,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={2} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                    {item.row.exerciseName}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Badge label={RECORD_LABEL[item.row.kind]} tone="accent" />
                    <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
                      {recordDetailText(item.row, item.row.info) ?? ''}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>
                    {recordValueText(item.row, item.row.info)}
                  </Text>
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, marginTop: 2 }}>
                    {tinyDate(item.row.dateISO)}
                  </Text>
                </View>
              </Pressable>
            )
          }
        />
      )}
    </Screen>
  );
}
