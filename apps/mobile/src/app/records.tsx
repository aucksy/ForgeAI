/**
 * Every personal record, newest first, under month headings (Phase 3). Opened from
 * Progress → Personal Records → "See all". Tap a record → its exercise page, where each
 * record also opens the workout it was set in.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Badge, EmptyState, IconButton, Screen, Skeleton } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';
import { RECORD_LABEL } from '@/tracker/engine/records';
import { recordDetailText, recordValueText, withMonthHeadings } from '@/tracker/services/recordText';
import { getRecordEvents, type RecordEventRow } from '@/tracker/services/recordsService';

export default function RecordsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<RecordEventRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getRecordEvents()
        .then((r) => {
          if (alive) setRows(r);
        })
        .catch(() => {
          if (alive) setRows([]);
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <Screen
      title="Personal records"
      subtitle={rows && rows.length > 0 ? `${countWord(rows.length, 'record')}, newest first` : undefined}
      scroll={false}
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      {rows === null ? (
        <View style={{ gap: space.md }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="100%" height={58} radius={radius.lg} />
          ))}
        </View>
      ) : rows.length === 0 ? (
        <EmptyState icon="trophy" title="No records yet" body="Beat a previous best and it lands here — automatically." />
      ) : (
        <FlatList
          data={withMonthHeadings(rows)}
          keyExtractor={(it) => it.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl }}
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
                  <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
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
