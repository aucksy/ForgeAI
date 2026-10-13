/**
 * Measures (R3, PLAN §4.3 — Hevy's Measures), one page instead of three (body weight,
 * measurements, photos), opened from Profile's Dashboard tile.
 *   Progress photos strip ("See all") · a graph of the chosen measure · chips Body weight / Waist /
 *   Body fat / … · that measure's dated list (tap → fix or delete, with Undo, as before) ·
 *   "+" top right → one form for the day: body weight, any measurements, a picture.
 * `?kind=bodyweight` (the "Log body weight" shortcut and widget) opens it on body weight.
 */
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { StatHeading, leavePage } from '@/components/stats/parts';
import { askConfirm, Card, Chip, EmptyState, Icon, IconButton, LoadError, Screen, Skeleton, UndoBar } from '@/components/ui';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { getBodyWeightHistory } from '@/db/repos/userRepo';
import { dateWithYear, tinyDate, todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { success } from '@/lib/haptics';
import { kgToShown, shownToKg, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { chart, color, radius, space, type } from '@/theme/tokens';
import { BodyEntrySheet, FloatAtBottom } from '@/tracker/components/BodyEntrySheet';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import {
  deleteBodyWeight,
  editBodyWeight,
  editMeasurement,
  undoBodyWeight,
  undoMeasurements,
  type BodyWeightUndo,
  type MeasurementUndo,
} from '@/tracker/db/bodyEntries';
import { deleteMeasurement, getMeasurements } from '@/tracker/db/measurementRepo';
import { bodyWeightTypo, bodyWeightTypoText } from '@/tracker/engine/bodyCheck';
import { MEASURE_LABEL, measureToShown, measureUnit, shownToMeasure, type MeasurementEntry } from '@/tracker/engine/measurements';
import { MEASURE_CHIPS, chipLabel, openingChip, type MeasureChip } from '@/tracker/lib/measuresView';
import { getProgressPhotos, type ProgressPhoto } from '@/tracker/services/progressPhotos';
import type { BodyWeightEntry } from '@/types/models';

const STRIP_MAX = 12;
const noopInspect = () => {
  /* enables the chart's press-drag readout */
};

/** One dated row of the chosen measure, whichever table it lives in. */
interface Row {
  id: string;
  dateISO: string;
  /** Stored value: kg for body weight, cm or % for a measurement. */
  value: number;
  weight?: BodyWeightEntry;
  measure?: MeasurementEntry;
}

type Undo = { table: 'weight'; item: BodyWeightUndo } | { table: 'measure'; item: MeasurementUndo };

function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${trimNum(Math.abs(n))}`;
}

export default function MeasuresScreen() {
  const router = useRouter();
  const units = useUnits();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [chip, setChip] = useState<MeasureChip>(() => openingChip(params.kind));
  // Review fix: a shortcut tap while this page is already open (on another chip) still opens it
  // on the measure it names.
  useEffect(() => {
    if (params.kind) setChip(openingChip(params.kind));
  }, [params.kind]);

  const [weights, setWeights] = useState<BodyWeightEntry[] | null>(null);
  const [measures, setMeasures] = useState<MeasurementEntry[] | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    void Promise.all([getBodyWeightHistory(), getMeasurements()])
      .then(([w, m]) => {
        if (!alive) return;
        setWeights(w);
        setMeasures(m);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    getProgressPhotos()
      .then((p) => alive && setPhotos(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  useFocusEffect(load);

  const unitOf = (c: MeasureChip): string => (c === 'bodyweight' ? weightUnitOf(units) : measureUnit(c, units));
  const shown = useCallback((c: MeasureChip, v: number): number => (c === 'bodyweight' ? kgToShown(v, units) : measureToShown(c, v, units)), [units]);

  const rows: Row[] = useMemo(() => {
    if (chip === 'bodyweight') return (weights ?? []).map((w) => ({ id: w.id, dateISO: w.dateISO, value: w.weightKg, weight: w }));
    return (measures ?? []).filter((m) => m.kind === chip).map((m) => ({ id: m.id, dateISO: m.dateISO, value: m.value, measure: m }));
  }, [chip, weights, measures]);
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0)), [rows]);
  const points = sorted.map((r) => ({ x: r.dateISO, y: shown(chip, r.value) }));
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const change = sorted.length > 1 ? shown(chip, sorted[sorted.length - 1].value) - shown(chip, sorted[0].value) : null;

  // ------------------------------------------------ fix or delete (the flows Body weight and Measurements had)
  const [editing, setEditing] = useState<Row | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<Undo[]>([]);

  const valueText = (c: MeasureChip, v: number): string => `${trimNum(shown(c, v))} ${unitOf(c)}`;
  const otherOn = (iso: string, r: Row): Row | undefined => rows.find((x) => x.dateISO === iso && x.id !== r.id);

  const onSaveEdit = async (text: string, dateISO: string): Promise<void> => {
    const r = editing;
    if (!r || saving) return;
    setEditError(null);
    const v = parseFloat(text.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setEditError('Type a number above 0, like 82.5.');
      return;
    }
    setSaving(true);
    try {
      if (r.weight) {
        const kg = shownToKg(v, units);
        const hit = bodyWeightTypo(kg, weights ?? [], { dateISO, excludeId: r.id });
        if (hit && !(await askConfirm({ title: bodyWeightTypoText(hit, kg, units), confirmLabel: 'Keep it', cancelLabel: 'Fix it' }))) return;
      }
      const other = otherOn(dateISO, r);
      if (other) {
        const ok = await askConfirm({
          title: `${dateWithYear(dateISO)} already has ${chipLabel(chip)} ${valueText(chip, other.value)}`,
          body: 'Replace it with this one?',
          confirmLabel: 'Replace',
          destructive: true,
        });
        if (!ok) return;
      }
      if (r.weight) {
        const before = r.weight;
        const out = await editBodyWeight(r.id, { dateISO, weightKg: shownToKg(v, units) });
        if (out.replaced) setUndo((cur) => [...cur, { table: 'weight', item: { kind: 'edited', before, replaced: out.replaced } }]);
      } else if (r.measure) {
        const before = r.measure;
        const out = await editMeasurement(r.id, { dateISO, value: shownToMeasure(before.kind, v, units) });
        if (out.replaced) setUndo((cur) => [...cur, { table: 'measure', item: { kind: 'edited', before, replaced: out.replaced } }]);
      }
      success();
      setEditing(null);
      load();
    } catch {
      setEditError('Couldn’t save the change. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (): Promise<void> => {
    const r = editing;
    if (!r) return;
    try {
      if (r.weight) {
        await deleteBodyWeight(r.id);
        const entry = r.weight;
        setUndo((cur) => [...cur, { table: 'weight', item: { kind: 'deleted', entry } }]);
      } else if (r.measure) {
        await deleteMeasurement(r.id);
        const entry = r.measure;
        setUndo((cur) => [...cur, { table: 'measure', item: { kind: 'deleted', entry } }]);
      }
      setEditing(null);
      load();
    } catch {
      setEditError('Couldn’t delete it. Please try again.');
    }
  };

  const onUndo = async (): Promise<void> => {
    const items = undo;
    setUndo([]);
    if (items.length === 0) return;
    const w = items.flatMap((u) => (u.table === 'weight' ? [u.item] : []));
    const m = items.flatMap((u) => (u.table === 'measure' ? [u.item] : []));
    if (w.length > 0) await undoBodyWeight(w).catch(() => undefined);
    if (m.length > 0) await undoMeasurements(m).catch(() => undefined);
    load();
  };
  const lastUndo = undo.length > 0 ? undo[undo.length - 1] : null;
  const undoText = (u: Undo): string => {
    if (u.item.kind === 'deleted') {
      const day = u.item.entry.dateISO;
      return `${u.table === 'weight' ? 'Weigh-in' : MEASURE_LABEL[(u.item.entry as MeasurementEntry).kind]} on ${tinyDate(day)} deleted`;
    }
    return `Replaced the entry on ${tinyDate(u.item.replaced?.dateISO ?? u.item.before.dateISO)}`;
  };

  const add = () => router.push({ pathname: '/measures/add', params: { kind: chip } });

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Measures" onBack={() => leavePage(router)} right={<IconButton icon="plus" onPress={add} accessibilityLabel="Add measures" />}>
        {/* Progress photos */}
        <StatHeading
          title="Progress photos"
          sub={photos.length > 0 ? `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}` : undefined}
          action={{ label: photos.length > 0 ? 'See all' : 'Add', spoken: photos.length > 0 ? 'See all progress photos' : 'Add a progress photo', onPress: () => router.push('/photos') }}
        />
        {photos.length === 0 ? (
          <Pressable
            onPress={() => router.push('/photos')}
            accessibilityRole="button"
            accessibilityLabel="Add a progress photo"
            style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border }}
          >
            <Icon name="camera" size={20} color={color.accent} />
            <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
              Add a progress photo. It stays on your phone.
            </Text>
          </Pressable>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.screenX }} contentContainerStyle={{ paddingHorizontal: space.screenX, gap: space.sm }}>
            {photos.slice(0, STRIP_MAX).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push('/photos')}
                accessibilityRole="button"
                accessibilityLabel={`Progress photo, ${dateWithYear(p.dateISO)}`}
                style={{ width: 84, gap: 4 }}
              >
                <View style={{ width: 84, height: 112, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.surfaceRaised }}>
                  <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory" />
                </View>
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{tinyDate(p.dateISO)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* The chosen measure */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="radiogroup"
          style={{ marginTop: space.xl, marginHorizontal: -space.screenX }}
          contentContainerStyle={{ paddingHorizontal: space.screenX, gap: space.sm, paddingVertical: CHIP_TOUCH_SLOP }}
        >
          {MEASURE_CHIPS.map((c) => (
            <Chip key={c} role="radio" label={chipLabel(c)} selected={c === chip} onPress={() => setChip(c)} />
          ))}
        </ScrollView>

        {failed && weights == null ? (
          <LoadError what="your measures" onRetry={load} />
        ) : weights == null || measures == null ? (
          <Skeleton width="100%" height={240} radius={radius.lg} />
        ) : !latest ? (
          <View>
            <EmptyState
              icon={chip === 'bodyweight' ? 'scale' : 'ruler'}
              title={`No ${chipLabel(chip).toLowerCase()} entries yet`}
              body="Tap + to add one. Each measure gets its own graph here."
            />
          </View>
        ) : (
          <>
            <Card style={{ marginTop: space.md }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, marginBottom: space.md }}>
                <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{chipLabel(chip)}</Text>
                <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>
                  {trimNum(shown(chip, latest.value))}
                  <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted }}>{` ${unitOf(chip)}`}</Text>
                </Text>
              </View>
              {change !== null ? (
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.md }}>
                  {`${signed(change)} ${unitOf(chip)} since ${tinyDate(sorted[0].dateISO)}`}
                </Text>
              ) : null}
              {points.length >= 2 ? (
                <DateLineChart data={points} color={chip === 'bodyweight' ? chart.series[0] : chart.series[1]} fillGradient yFormat={(n) => trimNum(n)} onInspect={noopInspect} resetKey={chip} />
              ) : (
                <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>Add it again on another day to see a graph.</Text>
              )}
            </Card>

            <StatHeading title="History" sub="Tap an entry to fix or delete it." />
            <View style={{ gap: space.sm }}>
              {[...sorted].reverse().map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    setEditError(null);
                    setEditing(r);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${dateWithYear(r.dateISO)}, ${valueText(chip, r.value)}. Fix or delete`}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: space.sm,
                    paddingVertical: space.sm,
                    paddingHorizontal: space.md,
                    borderRadius: radius.md,
                    backgroundColor: pressed ? color.surfaceRaised : color.surface,
                    borderWidth: 1,
                    borderColor: color.border,
                  })}
                >
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>{dateWithYear(r.dateISO)}</Text>
                  <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>{valueText(chip, r.value)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </Screen>

      <BodyEntrySheet
        visible={editing != null}
        title={chip === 'bodyweight' ? 'Fix this weigh-in' : `Fix this ${chipLabel(chip).toLowerCase()} entry`}
        unit={unitOf(chip)}
        value={editing ? trimNum(shown(chip, editing.value)) : ''}
        dateISO={editing?.dateISO ?? todayISO()}
        valueLabel={chip === 'bodyweight' ? `Body weight in ${unitOf(chip)}` : chipLabel(chip)}
        dayTitle={chip === 'bodyweight' ? 'Weigh-in date' : 'Measurement date'}
        saving={saving}
        error={editError}
        noteFor={(iso) => {
          const other = editing ? otherOn(iso, editing) : undefined;
          return other ? `Replaces ${valueText(chip, other.value)} on ${tinyDate(iso)}.` : null;
        }}
        onSave={(text, iso) => void onSaveEdit(text, iso)}
        onDelete={() => void onDelete()}
        onClose={() => setEditing(null)}
      />
      {lastUndo ? (
        <FloatAtBottom>
          <UndoBar
            key={`${undo.length}`}
            message={undo.length === 1 ? undoText(lastUndo) : `${undo.length} changes to your measures`}
            actionLabel={undo.length === 1 ? 'Undo' : 'Undo all'}
            onAction={() => void onUndo()}
            onDismiss={() => setUndo([])}
          />
        </FloatAtBottom>
      ) : null}
    </View>
  );
}
