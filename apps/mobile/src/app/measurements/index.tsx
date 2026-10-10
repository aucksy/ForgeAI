/**
 * Body measurements (Phase 3) — free. Pick a measurement to see its trend (points at their
 * real dates), its latest value and change, and its entries; "Log measurements" opens the
 * form. Audit PG-03 / PG-16: tap an entry to fix its value or day, or delete it (Undo, not
 * "Are you sure?"). Review fixes (Phase 5): a "Replace" in the fix sheet can be undone (the
 * replaced entry AND the edited one's old day and value come back), and several deletes in a
 * row are all undone by the one Undo.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { askConfirm, Card, Chip, EmptyState, LoadError, PrimaryButton, Screen, SectionHeader, Skeleton, UndoBar } from '@/components/ui';
import { dateWithYear, tinyDate, todayISO } from '@/lib/date';
import { goBack } from '@/lib/goBack';
import { trimNum } from '@/lib/format';
import { useUnits } from '@/lib/useUnits';
import { chart, color, radius, space, type } from '@/theme/tokens';
import { BodyEntrySheet, FloatAtBottom } from '@/tracker/components/BodyEntrySheet';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { editMeasurement, undoMeasurements, type MeasurementUndo } from '@/tracker/db/bodyEntries';
import { deleteMeasurement, getMeasurements } from '@/tracker/db/measurementRepo';
import {
  MEASURE_LABEL,
  measureToShown,
  measureUnit,
  seriesFor,
  shownMeasure,
  shownToMeasure,
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
  // PG-26: Progress opens this on the measurement it shows (`kind=waist`).
  const params = useLocalSearchParams<{ kind?: string }>();
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
  const kind: MeasureKind | null = shownMeasure(
    summary.map((s) => s.kind),
    picked,
    params.kind,
  );
  const points = useMemo(
    () => (kind ? seriesFor(entries ?? [], kind).map((p) => ({ ...p, y: measureToShown(kind, p.y, units) })) : []),
    [entries, kind, units],
  );
  const current = summary.find((s) => s.kind === kind) ?? null;
  const unit = kind ? measureUnit(kind, units) : measureUnit('waist', units);

  // PG-03 / PG-16: the entry being fixed, and every change the Undo bar can still put back.
  const [editing, setEditing] = useState<MeasurementEntry | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<MeasurementUndo[]>([]);

  const shownOf = (e: MeasurementEntry): string => `${trimNum(measureToShown(e.kind, e.value, units))} ${measureUnit(e.kind, units)}`;
  const sameDay = (iso: string, e: MeasurementEntry): MeasurementEntry | undefined =>
    (entries ?? []).find((x) => x.kind === e.kind && x.dateISO === iso && x.id !== e.id);

  const onSaveEdit = async (text: string, dateISO: string): Promise<void> => {
    const e = editing;
    if (!e || saving) return;
    setEditError(null);
    const v = parseFloat(text.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setEditError('Type a number above 0, like 82.5.');
      return;
    }
    setSaving(true);
    try {
      const other = sameDay(dateISO, e);
      if (other) {
        const ok = await askConfirm({
          title: `${dateWithYear(dateISO)} already has ${MEASURE_LABEL[e.kind]} ${shownOf(other)}`,
          body: 'Replace it with this one?',
          confirmLabel: 'Replace',
          destructive: true,
        });
        if (!ok) return;
      }
      const out = await editMeasurement(e.id, { dateISO, value: shownToMeasure(e.kind, v, units) });
      setEditing(null);
      const replaced = out.replaced;
      if (replaced) setUndo((cur) => [...cur, { kind: 'edited', before: e, replaced }]);
      load();
    } catch {
      setEditError('Couldn’t save the change. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (): Promise<void> => {
    const e = editing;
    if (!e) return;
    try {
      await deleteMeasurement(e.id);
      setEditing(null);
      setUndo((cur) => [...cur, { kind: 'deleted', entry: e }]);
      load();
    } catch {
      setEditError('Couldn’t delete it. Please try again.');
    }
  };

  const onUndo = async (): Promise<void> => {
    const items = undo;
    setUndo([]);
    if (items.length === 0) return;
    await undoMeasurements(items).catch(() => undefined);
    load();
  };

  const undoText = (u: MeasurementUndo): string =>
    u.kind === 'deleted'
      ? `${MEASURE_LABEL[u.entry.kind]} on ${tinyDate(u.entry.dateISO)} deleted`
      : `Replaced ${MEASURE_LABEL[u.before.kind]} ${u.replaced ? shownOf(u.replaced) : ''} on ${tinyDate(u.replaced?.dateISO ?? u.before.dateISO)}`;
  const lastUndo = undo.length > 0 ? undo[undo.length - 1] : null;

  return (
    <View style={{ flex: 1 }}>
    <Screen title="Measurements" onBack={() => goBack(router, '/analytics')}>
      <View style={{ gap: space.lg }}>
        <PrimaryButton label="Log measurements" icon="plus" onPress={() => router.push('/measurements/log')} />

        {entries === null && failed ? (
          <LoadError what="your measurements" onRetry={retry} />
        ) : entries === null ? (
          <Skeleton width="100%" height={240} radius={radius.lg} />
        ) : summary.length === 0 || !kind || !current ? (
          <EmptyState
            icon="ruler"
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
              <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginBottom: space.sm }}>
                Tap an entry to fix or delete it.
              </Text>
              <View style={{ gap: space.sm }}>
                {[...(entries ?? [])]
                  .filter((e) => e.kind === kind)
                  .reverse()
                  .map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => {
                        setEditError(null);
                        setEditing(e);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${dateWithYear(e.dateISO)}, ${trimNum(measureToShown(e.kind, e.value, units))} ${unit}. Fix or delete`}
                      style={{
                        minHeight: 48,
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
                      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>{dateWithYear(e.dateISO)}</Text>
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
    <BodyEntrySheet
      visible={editing != null}
      title={editing ? `Fix this ${MEASURE_LABEL[editing.kind].toLowerCase()} entry` : 'Fix this entry'}
      unit={editing ? measureUnit(editing.kind, units) : ''}
      value={editing ? trimNum(measureToShown(editing.kind, editing.value, units)) : ''}
      dateISO={editing?.dateISO ?? todayISO()}
      valueLabel={editing ? MEASURE_LABEL[editing.kind] : 'Value'}
      dayTitle="Measurement date"
      saving={saving}
      error={editError}
      noteFor={(iso) => {
        const other = editing ? sameDay(iso, editing) : undefined;
        return other ? `Replaces ${shownOf(other)} on ${tinyDate(iso)}.` : null;
      }}
      onSave={(text, iso) => void onSaveEdit(text, iso)}
      onDelete={() => void onDelete()}
      onClose={() => setEditing(null)}
    />
    {lastUndo ? (
      <FloatAtBottom>
        {/* A new change restarts the clock; Undo puts back everything still listed. */}
        <UndoBar
          key={`${undo.length}-${lastUndo.kind === 'deleted' ? lastUndo.entry.id : lastUndo.before.id}`}
          message={undo.length === 1 ? undoText(lastUndo) : `${undo.length} changes to your measurements`}
          actionLabel={undo.length === 1 ? 'Undo' : 'Undo all'}
          onAction={() => void onUndo()}
          onDismiss={() => setUndo([])}
        />
      </FloatAtBottom>
    ) : null}
    </View>
  );
}
