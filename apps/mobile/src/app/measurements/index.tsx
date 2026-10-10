/**
 * Body measurements (Phase 3) — free. Pick a measurement to see its trend (points at their
 * real dates), its latest value and change, and its entries; "Log measurements" opens the
 * form. Tap an entry to delete it.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Chip, EmptyState, IconButton, LoadError, PrimaryButton, Screen, SectionHeader, Skeleton } from '@/components/ui';
import { shortDate, tinyDate } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { useUnits } from '@/lib/useUnits';
import { chart, color, radius, space, type } from '@/theme/tokens';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { deleteMeasurement, getMeasurements } from '@/tracker/db/measurementRepo';
import {
  MEASURE_LABEL,
  measureToShown,
  measureUnit,
  seriesFor,
  summarize,
  type MeasureKind,
  type MeasurementEntry,
} from '@/tracker/engine/measurements';

const noopInspect = () => {
  /* enables the chart's press-drag readout */
};

function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${trimNum(Math.abs(n))}`;
}

export default function MeasurementsScreen() {
  const router = useRouter();
  // v0.27.0: sizes shown in cm or inches (stored in cm).
  const units = useUnits();
  const [entries, setEntries] = useState<MeasurementEntry[] | null>(null);
  const [picked, setPicked] = useState<MeasureKind | null>(null);
  // PG-23: a failed read shows "Couldn't load your measurements", never "No measurements yet".
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    getMeasurements()
      .then((e) => {
        if (!alive) return;
        setEntries(e);
        setFailed(false);
      })
      .catch(() => {
        // Entries already on screen stay; with none, the screen shows LoadError.
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useFocusEffect(load);
  const retry = (): void => {
    setFailed(false);
    load();
  };

  const summary = useMemo(() => summarize(entries ?? []), [entries]);
  const kind: MeasureKind | null = picked && summary.some((s) => s.kind === picked) ? picked : summary[0]?.kind ?? null;
  const points = useMemo(
    () => (kind ? seriesFor(entries ?? [], kind).map((p) => ({ ...p, y: measureToShown(kind, p.y, units) })) : []),
    [entries, kind, units],
  );
  const current = summary.find((s) => s.kind === kind) ?? null;
  const unit = kind ? measureUnit(kind, units) : measureUnit('waist', units);

  const onDelete = (e: MeasurementEntry) => {
    Alert.alert('Delete this entry?', `${MEASURE_LABEL[e.kind]} ${trimNum(measureToShown(e.kind, e.value, units))} ${measureUnit(e.kind, units)} on ${shortDate(e.dateISO)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteMeasurement(e.id)
            .then(load)
            .catch(() => Alert.alert('Could not delete', 'Something went wrong. Please try again.'));
        },
      },
    ]);
  };

  return (
    <Screen title="Measurements" right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}>
      <View style={{ gap: space.lg }}>
        <PrimaryButton label="Log measurements" icon="plus" onPress={() => router.push('/measurements/log')} />

        {entries === null && failed ? (
          <LoadError what="your measurements" onRetry={retry} />
        ) : entries === null ? (
          <Skeleton width="100%" height={240} radius={radius.lg} />
        ) : summary.length === 0 || !kind || !current ? (
          <EmptyState
            icon="target"
            title="No measurements yet"
            body="Log your waist, chest, arms and more. Each one gets its own trend here."
          />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {summary.map((s) => (
                <Chip key={s.kind} label={MEASURE_LABEL[s.kind]} selected={s.kind === kind} onPress={() => setPicked(s.kind)} />
              ))}
            </ScrollView>

            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.md }}>
                <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{MEASURE_LABEL[kind]}</Text>
                <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>
                  {trimNum(measureToShown(current.kind, current.latest, units))}
                  <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted }}> {unit}</Text>
                </Text>
              </View>
              {current.change !== null ? (
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.md }}>
                  {signed(measureToShown(current.kind, current.change, units))} {unit} since {tinyDate(points[0].x)}
                </Text>
              ) : null}
              {points.length >= 2 ? (
                <DateLineChart data={points} color={chart.series[1]} fillGradient yFormat={(n) => trimNum(n)} onInspect={noopInspect} />
              ) : (
                <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
                  Log it again on another day to see a trend line.
                </Text>
              )}
            </Card>

            <View>
              <SectionHeader title="Latest" />
              <Card style={{ gap: 2 }}>
                {summary.map((s) => (
                  <Pressable
                    key={s.kind}
                    onPress={() => setPicked(s.kind)}
                    accessibilityRole="button"
                    accessibilityLabel={`${MEASURE_LABEL[s.kind]} ${trimNum(measureToShown(s.kind, s.latest, units))} ${measureUnit(s.kind, units)}`}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, gap: space.md }}
                  >
                    <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: s.kind === kind ? color.accent : color.ink }}>
                      {MEASURE_LABEL[s.kind]}
                    </Text>
                    {s.change !== null ? (
                      <Text style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}>{signed(measureToShown(s.kind, s.change, units))}</Text>
                    ) : null}
                    <Text style={{ width: 86, textAlign: 'right', fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>
                      {trimNum(measureToShown(s.kind, s.latest, units))} {measureUnit(s.kind, units)}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            </View>

            <View>
              <SectionHeader title={`${MEASURE_LABEL[kind]} entries`} />
              <View style={{ gap: space.sm }}>
                {[...(entries ?? [])]
                  .filter((e) => e.kind === kind)
                  .reverse()
                  .map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => onDelete(e)}
                      accessibilityRole="button"
                      accessibilityLabel={`${shortDate(e.dateISO)}, ${trimNum(measureToShown(e.kind, e.value, units))} ${unit}. Tap to delete.`}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: space.sm,
                        paddingHorizontal: space.md,
                        borderRadius: radius.md,
                        backgroundColor: color.surface,
                        borderWidth: 1,
                        borderColor: color.border,
                      }}
                    >
                      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>{shortDate(e.dateISO)}</Text>
                      <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>
                        {trimNum(measureToShown(e.kind, e.value, units))} {unit}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
