/**
 * Body-weight quick-log + trend + history — frozen userRepo, offline, stored in kg (shown kg or lb).
 *
 * Audit PG-03 / PG-16: log for an earlier day (the Day row, never a future one); tap any entry
 * to fix its value or day, or delete it (Undo, not "Are you sure?"); a typo like 765 for 76.5
 * gets one gentle question ("765 kg — that's 10× your last. Keep it?"), never a refusal.
 * Home, Progress and the strength numbers read the same table, so a fix shows everywhere.
 *
 * Review fixes (Phase 5): logging for an earlier day that already has a weigh-in asks first
 * ("Replace 76.2 kg on Tue, 3 Oct?"); a "Replace" in the fix sheet can be undone (the replaced
 * weigh-in AND the edited one's old day and value come back); several deletes in a row are all
 * undone by the one Undo; the history pages ("Show older") so every weigh-in can be fixed.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DeltaPill } from '@/components/charts';
import {
  AnimatedNumber,
  askConfirm,
  Card,
  EmptyState,
  GhostButton,
  LoadError,
  PrimaryButton,
  Screen,
  SectionHeader,
  Skeleton,
  UndoBar,
} from '@/components/ui';
import { getBodyWeightHistory, getProfile } from '@/db/repos/userRepo';
import { logBodyWeight } from '@/db/queuedWrites';
import { dateWithYear, tinyDate, todayISO } from '@/lib/date';
import { goBack } from '@/lib/goBack';
import { trimNum } from '@/lib/format';
import { success } from '@/lib/haptics';
import { kgToShown, shownToKg, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { BodyEntrySheet, DayRow, FloatAtBottom, FormNote, NumberBox } from '@/tracker/components/BodyEntrySheet';
import { DatePickerSheet } from '@/tracker/components/DatePickerSheet';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { showW, showWU } from '@/tracker/components/unitText';
import { deleteBodyWeight, editBodyWeight, undoBodyWeight, type BodyWeightUndo } from '@/tracker/db/bodyEntries';
import { bodyWeightTypo, bodyWeightTypoText, replaceWeighInQuestion, shouldAskReplace } from '@/tracker/engine/bodyCheck';
import { historyPage } from '@/tracker/engine/bodyHistory';
import { weightChange, weightChangeShown, weightChangeTone, weightSpanText } from '@/tracker/engine/headline';
import type { BodyWeightEntry, Goal, UnitSystem } from '@/types/models';

const noopInspect = () => {
  /* enables the chart's press-drag crosshair */
};

/** A typed weight in the member's units → kg, or null when it is not a weight. */
function typedKg(text: string, units: UnitSystem): number | null {
  const v = parseFloat(text.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? shownToKg(v, units) : null;
}

export default function BodyWeightScreen() {
  const router = useRouter();
  // v0.27.0: typed and shown in kg or lb; always stored in kg.
  const units = useUnits();
  const unit = weightUnitOf(units);

  const [history, setHistory] = useState<BodyWeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // PG-23: a failed read shows "Couldn't load your weigh-ins", never "No weigh-ins yet".
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  // PG-10: the change's colour follows the member's goal (neutral until it is read).
  const [goal, setGoal] = useState<Goal | null>(null);
  // PG-16: the day being logged (default today; never a future day).
  const [day, setDay] = useState(todayISO());
  const [pickingDay, setPickingDay] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  // PG-03: the entry being fixed, and every change the Undo bar can still put back (a delete,
  // or a fix that replaced another day's weigh-in) — all of them, not just the last.
  const [editing, setEditing] = useState<BodyWeightEntry | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [undo, setUndo] = useState<BodyWeightUndo[]>([]);
  // Pages of history shown (60 each).
  const [pages, setPages] = useState(1);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setGoal(p.goal);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getBodyWeightHistory()
      .then((h) => {
        if (alive) {
          setHistory(h);
          setLoading(false);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = (): void => {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  // The write IS saved when this runs: a failed re-read must not say "Could not save" (it
  // would be logged twice). The list catches up on the next visit.
  const reread = useCallback(async (): Promise<void> => {
    await getBodyWeightHistory()
      .then((h) => {
        setHistory(h);
        setFailed(false);
      })
      .catch(() => undefined);
  }, []);

  /** One gentle question for a likely typo; true = save it. Never refuses (R6). */
  const keepTypo = async (kg: number, at: { dateISO: string; excludeId?: string }): Promise<boolean> => {
    const hit = bodyWeightTypo(kg, history, at);
    if (!hit) return true;
    return askConfirm({ title: bodyWeightTypoText(hit, kg, units), confirmLabel: 'Keep it', cancelLabel: 'Fix it' });
  };

  const entryOn = (iso: string, exceptId?: string): BodyWeightEntry | undefined =>
    history.find((h) => h.dateISO === iso && h.id !== exceptId);

  const replaceNote = (iso: string, exceptId?: string): string | null => {
    const other = entryOn(iso, exceptId);
    return other ? `Replaces ${showWU(other.weightKg, units)} on ${tinyDate(iso)}.` : null;
  };

  const typeHint = units === 'imperial' ? 'Type your body weight in lb, like 168.5.' : 'Type your body weight in kg, like 76.5.';

  const onLog = async (): Promise<void> => {
    if (savingRef.current) return;
    setLogError(null);
    const kg = typedKg(input, units);
    if (kg == null) {
      setLogError(typeHint);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (!(await keepTypo(kg, { dateISO: day }))) return;
      const today = todayISO();
      const other = entryOn(day);
      if (other && shouldAskReplace(day, today, other)) {
        const ok = await askConfirm({
          title: replaceWeighInQuestion(other, units, today),
          body: 'That day already has a weigh-in. Logging this one replaces it.',
          confirmLabel: 'Replace',
          destructive: true,
        });
        if (!ok) return;
      }
      await logBodyWeight(day, kg);
      success();
      setInput('');
      setDay(todayISO());
      await reread();
    } catch {
      setLogError('Couldn’t save your weight. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onSaveEdit = async (text: string, dateISO: string): Promise<void> => {
    const e = editing;
    if (!e || savingRef.current) return;
    setEditError(null);
    const kg = typedKg(text, units);
    if (kg == null) {
      setEditError(typeHint);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (!(await keepTypo(kg, { dateISO, excludeId: e.id }))) return;
      const other = entryOn(dateISO, e.id);
      if (other) {
        const ok = await askConfirm({
          title: `${dateWithYear(dateISO)} already has ${showWU(other.weightKg, units)}`,
          body: 'Replace it with this one?',
          confirmLabel: 'Replace',
          destructive: true,
        });
        if (!ok) return;
      }
      const out = await editBodyWeight(e.id, { dateISO, weightKg: kg });
      success();
      setEditing(null);
      const replaced = out.replaced;
      if (replaced) setUndo((cur) => [...cur, { kind: 'edited', before: e, replaced }]);
      await reread();
    } catch {
      setEditError('Couldn’t save the change. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onDelete = async (): Promise<void> => {
    const e = editing;
    if (!e) return;
    try {
      await deleteBodyWeight(e.id);
      setEditing(null);
      setUndo((cur) => [...cur, { kind: 'deleted', entry: e }]);
      await reread();
    } catch {
      setEditError('Couldn’t delete it. Please try again.');
    }
  };

  const onUndo = async (): Promise<void> => {
    const items = undo;
    setUndo([]);
    if (items.length === 0) return;
    await undoBodyWeight(items).catch(() => undefined);
    await reread();
  };

  const undoText = (u: BodyWeightUndo): string =>
    u.kind === 'deleted'
      ? `Weigh-in on ${tinyDate(u.entry.dateISO)} deleted`
      : `Replaced ${showWU(u.replaced?.weightKg ?? 0, units)} on ${tinyDate(u.replaced?.dateISO ?? u.before.dateISO)}`;
  const lastUndo = undo.length > 0 ? undo[undo.length - 1] : null;
  const shownHistory = historyPage(history, pages);

  const latest = history.length > 0 ? history[history.length - 1] : null;
  const current = latest ? latest.weightKg : 0;
  // PG-11: the one body-weight rule, always with its span ("+5 kg since 13 Jul 2025").
  const change = weightChange(history);

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Body weight"
        onBack={() => goBack(router, '/analytics')}
      >
        <View style={{ gap: space.lg }}>
          {/* quick log — always available */}
          <Card>
            <View style={{ gap: space.md }}>
              <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.inkSecondary }}>
                Log your weight
              </Text>
              <NumberBox
                value={input}
                onChangeText={(t) => {
                  setInput(t);
                  setLogError(null);
                }}
                unit={unit}
                placeholder={latest ? showW(latest.weightKg, units) : units === 'imperial' ? '168.5' : '76.5'}
                accessibilityLabel={`Body weight in ${unit}`}
              />
              <DayRow dateISO={day} onPress={() => setPickingDay(true)} />
              <FormNote text={replaceNote(day)} />
              <FormNote text={logError} tone="error" />
              <PrimaryButton label="Log weight" icon="check" loading={saving} onPress={() => void onLog()} />
            </View>
          </Card>

          {loading ? (
            <Skeleton width="100%" height={220} radius={radius.lg} />
          ) : failed && history.length === 0 ? (
            <LoadError what="your weigh-ins" onRetry={retry} />
          ) : history.length === 0 ? (
            <EmptyState icon="scale" title="No weigh-ins yet" body="Log your body weight above to start a trend." />
          ) : (
            <>
              {/* trend */}
              <View style={{ gap: space.md }}>
                <SectionHeader title="Trend" />
                <Card>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      marginBottom: space.lg,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs + 2 }}>
                      <AnimatedNumber key={units} value={current} format={(n) => showW(n, units)} style={{ fontSize: type.size.h1 }} />
                      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>
                        {unit} now
                      </Text>
                    </View>
                    {change ? (
                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <DeltaPill value={weightChangeShown(change, units)} suffix={` ${unit}`} tone={weightChangeTone(change.changeKg, goal)} />
                        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{weightSpanText(change)}</Text>
                      </View>
                    ) : null}
                  </View>
                  {history.length >= 2 ? (
                    <DateLineChart
                      data={history.map((d) => ({ x: d.dateISO, y: kgToShown(d.weightKg, units) }))}
                      fillGradient
                      yFormat={(n) => trimNum(n)}
                      onInspect={noopInspect}
                    />
                  ) : (
                    <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
                      Log a few more days to see your trend line.
                    </Text>
                  )}
                </Card>
              </View>

              {/* history list — tap an entry to fix or delete it (PG-03) */}
              <View style={{ gap: space.sm }}>
                <SectionHeader title="History" />
                <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
                  Tap an entry to fix or delete it.
                </Text>
                {shownHistory.rows.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => {
                        setEditError(null);
                        setEditing(e);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${dateWithYear(e.dateISO)}, ${showWU(e.weightKg, units)}. Fix or delete`}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        minHeight: 48,
                        paddingVertical: space.sm,
                        paddingHorizontal: space.md,
                        borderRadius: radius.md,
                        backgroundColor: pressed ? color.surfaceRaised : color.surface,
                        borderWidth: 1,
                        borderColor: color.border,
                      })}
                    >
                      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>
                        {dateWithYear(e.dateISO)}
                      </Text>
                      <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>
                        {showW(e.weightKg, units)} {unit}
                      </Text>
                    </Pressable>
                  ))}
                {shownHistory.more > 0 ? (
                  <GhostButton
                    label={`Show older (${shownHistory.more} more)`}
                    onPress={() => setPages((p) => p + 1)}
                  />
                ) : null}
              </View>
            </>
          )}
        </View>
      </Screen>

      <DatePickerSheet
        visible={pickingDay}
        title="Weigh-in date"
        value={day}
        onChoose={(iso) => {
          setDay(iso);
          setPickingDay(false);
        }}
        onClose={() => setPickingDay(false)}
      />
      <BodyEntrySheet
        visible={editing != null}
        title="Fix this weigh-in"
        unit={unit}
        value={editing ? showW(editing.weightKg, units) : ''}
        dateISO={editing?.dateISO ?? todayISO()}
        valueLabel={`Body weight in ${unit}`}
        dayTitle="Weigh-in date"
        saving={saving}
        error={editError}
        noteFor={(iso) => replaceNote(iso, editing?.id)}
        onSave={(text, iso) => void onSaveEdit(text, iso)}
        onDelete={() => void onDelete()}
        onClose={() => setEditing(null)}
      />
      {lastUndo ? (
        <FloatAtBottom>
          {/* A new change restarts the clock; Undo puts back everything still listed. */}
          <UndoBar
            key={`${undo.length}-${lastUndo.kind === 'deleted' ? lastUndo.entry.id : lastUndo.before.id}`}
            message={undo.length === 1 ? undoText(lastUndo) : `${undo.length} changes to your weigh-ins`}
            actionLabel={undo.length === 1 ? 'Undo' : 'Undo all'}
            onAction={() => void onUndo()}
            onDismiss={() => setUndo([])}
          />
        </FloatAtBottom>
      ) : null}
    </View>
  );
}
