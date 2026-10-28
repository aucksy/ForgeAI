/**
 * Exercise page — redesign R5, Hevy's three tabs under the header (PLAN §4.6):
 *  - Summary: "Last time · Best" (audit EX-07: in the way the exercise is logged — a pull-up
 *    always at +0 kg reads as reps; 13 Oct 2026: last time's sets as the workout page's set table,
 *    warm-ups and RPE included — tap its heading for that workout), then the chart (chips for what it shows, the right ones for
 *    weight, bodyweight, timed and distance work; 3 months · Year · All time), then Personal
 *    records (tap → that workout) and Set records (the heaviest weight at each rep count);
 *  - History: the same chart at the top (13 Oct 2026 — the owner looked for it there; both tabs
 *    share what it shows and its range), then every workout with this exercise and its sets,
 *    page by page; tap → the workout;
 *  - How to: the picture (a tap opens it larger), the steps, the credit; then muscles, logging
 *    and the easier / harder versions.
 * The tab chosen holds for this visit only; the page always opens on Summary.
 * The options menu: Edit and "Merge into…" for the member's own exercises (EX-02); "Your photo
 * or video" and "Hide" for library ones they never logged; "Start records fresh…" (tracker
 * schema v14 — a new gym or machine: records count from today, History and charts keep all)
 * and, once set, "Count all records again".
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionHistory } from '@/components/exercise/SessionHistory';
import { askConfirm, Badge, Card, EmptyState, Icon, IconButton, LoadError, Screen, Sheet, SheetRow, Skeleton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { relativeDay, tinyDateWithYear } from '@/lib/date';
import { goBack } from '@/lib/goBack';
import { navigateOnce } from '@/lib/guardedAction';
import { liftedWords } from '@/lib/units';
import { countWord } from '@/lib/words';
import { useSettings } from '@/store/settingsStore';
import { color, motion, radius, space, type } from '@/theme/tokens';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { mediaFor } from '@/tracker/catalog/media';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { DrawingCredit } from '@/tracker/components/DrawingCredit';
import { ExerciseClip } from '@/tracker/components/ExerciseClip';
import { ExerciseDemoSheet } from '@/tracker/components/ExerciseDemoSheet';
import { ExerciseMetricChart } from '@/tracker/components/ExerciseMetricChart';
import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import { ExercisePrRows } from '@/tracker/components/ExercisePrRows';
import { ExerciseThumb } from '@/tracker/components/ExerciseThumb';
import { SegmentedTabs } from '@/tracker/components/SegmentedTabs';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { getExerciseIdsByCatalogKey, type TrackerExercise } from '@/tracker/db/exerciseInfo';
import { hideRefusal, mergeExercise, mergeRefusal, setExerciseHidden } from '@/tracker/db/exerciseManage';
import { setRecordsFrom } from '@/tracker/db/recordStart';
import { getWorkoutNames } from '@/tracker/db/workoutNames';
import { isTimedCardio, LOAD_MODE_LABEL, LOG_TYPE_LABEL } from '@/tracker/engine/logTypes';
import { ladderAtLeast, RECORD_LABEL } from '@/tracker/engine/records';
import { headlineBest } from '@/tracker/services/exerciseHeadline';
import { lastTimeRows } from '@/tracker/services/workoutDetail';
import { SetTable } from '@/tracker/components/SetTable';
import { getWarmupSets, type TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import { deleteKeptMedia } from '@/tracker/services/exerciseMedia';
import { getExerciseOverview, type ExerciseOverview } from '@/tracker/services/exerciseStats';
import { workoutChartMetric, type ChartMetric, type ChartRange } from '@/tracker/services/exerciseChart';
import { recordValueText } from '@/tracker/services/recordText';
import { currentWorkoutSets } from '@/tracker/services/currentInHistory';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { exercisesChanged } from '@/tracker/store/exerciseListStore';

/** The Set records table stops at 12 reps (a tidy strength table, as before). */
const SET_RECORD_MAX_REPS = 12;

const cap = (s: string) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

type Tab = 'summary' | 'history' | 'howto';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'history', label: 'History' },
  { id: 'howto', label: 'How to' },
];

function LoadingSkeleton() {
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Skeleton width={132} height={104} radius={radius.lg} />
        <Skeleton width={118} height={104} radius={radius.lg} />
        <Skeleton width={118} height={104} radius={radius.lg} />
      </View>
      <View style={{ marginTop: space.xl, gap: space.xl }}>
        <Skeleton width="100%" height={230} radius={radius.lg} />
        <Skeleton width="100%" height={260} radius={radius.lg} />
      </View>
    </View>
  );
}

function VersionLink({ label, name, onPress }: { label: string; name: string; onPress: (() => void) | null }) {
  return (
    <Pressable
      onPress={onPress ?? undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'link' : 'text'}
      accessibilityLabel={`${label} ${name}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}
    >
      <Glyph name="swap" size={16} color={color.accent} />
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{label}</Text>
      <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: onPress ? color.accent : color.ink }} numberOfLines={2}>
        {name}
      </Text>
    </Pressable>
  );
}

export default function ExerciseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; from?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];
  // R-141: opened from a live workout's card, the chart starts on the per-workout total.
  const fromWorkout = (typeof params.from === 'string' ? params.from : params.from?.[0]) === 'workout';

  const units = useSettings((s) => s.unitSystem);
  const insets = useSafeAreaInsets();
  // 15 Oct 2026 (owner): the workout in progress heads the History tab, to compare with last time.
  const workoutOpen = useActiveWorkout((s) => s.active);
  const draftExercises = useActiveWorkout((s) => s.exercises);
  const notLive = useActiveWorkout((s) => s.editingSessionId != null || s.pastLog);
  const current = useMemo(() => currentWorkoutSets(workoutOpen, draftExercises, id, notLive), [workoutOpen, draftExercises, id, notLive]);
  const [ov, setOv] = useState<ExerciseOverview | null>(null);
  const [versionIds, setVersionIds] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [demo, setDemo] = useState(false);
  const [menu, setMenu] = useState(false);
  const [merging, setMerging] = useState(false);
  const [canHide, setCanHide] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Per visit only: a new visit opens on Summary (Hevy's).
  const [tab, setTab] = useState<Tab>('summary');
  const [names, setNames] = useState<Map<string, string>>(new Map());
  // 13 Oct 2026: last time's warm-ups, for the "Last time" set table (none until read; a failed read = none).
  const [lastWarm, setLastWarm] = useState<{ sessionId: string; sets: TrackedSetEntry[] } | null>(null);
  // 13 Oct 2026: the chart's choice and range, shared by Summary and History (null = its opening one).
  const [chartMetric, setChartMetric] = useState<ChartMetric | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange | null>(null);
  // EX-18: one page per tap, however fast the taps.
  const nav = useRef(false);
  const busy = useRef(false);
  const go = (to: () => void): void => {
    navigateOnce(nav, to);
  };

  // Re-read on focus: coming back from "Edit" or "Add your photo" must show the change.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!id) {
        setLoading(false);
        return;
      }
      getExerciseOverview(id)
        .then(async (o) => {
          if (!alive) return;
          setOv(o);
          setLoading(false);
          setFailed(false);
          // Hide is offered for a library exercise never logged.
          void hideRefusal(id)
            .then((why) => {
              if (alive) setCanHide(why == null);
            })
            .catch(() => undefined);
          // The "Last time" table shows that workout's warm-ups too (the history read has working sets only).
          const lastSid = o?.history[0]?.sessionId;
          if (lastSid) {
            void getWarmupSets([{ sessionId: lastSid, exerciseId: id }])
              .then((m) => {
                if (alive) setLastWarm({ sessionId: lastSid, sets: m.get(lastSid)?.get(id) ?? [] });
              })
              .catch(() => undefined);
          }
          // The History tab heads each workout with its name.
          void getWorkoutNames((o?.history ?? []).map((h) => h.sessionId))
            .then((m) => {
              if (alive) setNames(m);
            })
            .catch(() => undefined);
          const e = catalogEntry(o?.exercise.catalogKey);
          const keys = [e?.easier, e?.harder].filter((k): k is string => Boolean(k));
          const ids = await getExerciseIdsByCatalogKey(keys).catch(() => new Map<string, string>());
          if (alive) setVersionIds(ids);
        })
        .catch(() => {
          if (!alive) return;
          setLoading(false);
          // A read that fails says so (never "Exercise not found"); a page already shown stays.
          setFailed(true);
        });
      return () => {
        alive = false;
      };
    }, [id, attempt]),
  );

  const ex = ov?.exercise ?? null;
  const entry = catalogEntry(ex?.catalogKey);
  const hasHistory = ov !== null && ov.history.length > 0;
  const stats = ov?.weightStats ?? null;
  // Same volume rule as the Volume chart (both dumbbells, body weight on pull-ups).
  const bestSet = ov?.bestSet ?? [];
  // v14: records (the rep-max ladder too) count from the member's chosen day, when set.
  const recordsFrom = ov?.recordsFrom ?? null;
  // 13 Oct 2026: the Set records ladder IS the rep-record rule's (engine/records), so the
  // table and the live "Rep record" pop-up agree; easy weeks and the records day as for records.
  // Review fix: the "at least that many reps" reading (90 × 6 shows 90 kg for 5 reps), and also
  // for a bodyweight move logged with added weight.
  const ladder = useMemo(() => ladderAtLeast(ov?.records.ladder ?? []).filter((r) => r.reps <= SET_RECORD_MAX_REPS), [ov]);
  // Phase 3: every record this exercise keeps, from the one record rule.
  const bests = ov?.records.bests ?? [];
  const recordCtx = ex ? { logType: ex.logType, loadMode: ex.loadMode, distUnit: ex.distUnit } : null;
  const openSession = (sid: string) => go(() => router.push(`/session/${sid}`));
  const media = ex ? { uri: ex.mediaUri, type: ex.mediaType } : null;
  const hasPicture = Boolean(ex?.mediaUri) || mediaFor(ex?.catalogKey) != null;
  // EX-09: only a video or the library's two-drawing loop moves; the member's photo is still.
  const stillPhoto = Boolean(ex?.mediaUri) && ex?.mediaType === 'image';
  const easier = catalogEntry(entry?.easier);
  const harder = catalogEntry(entry?.harder);
  const openVersion = (key: string | undefined) => {
    const vid = key ? versionIds.get(key) : undefined;
    return vid ? () => go(() => router.push({ pathname: '/exercise/[id]', params: { id: vid } })) : null;
  };
  const openEdit = () => {
    setMenu(false);
    if (ex) go(() => router.push({ pathname: '/library/new', params: { id: ex.id } }));
  };

  // EX-07: numbers in the way the exercise is logged — or as reps when it never carried weight.
  const shownAs = ov?.shownAs ?? ex?.logType ?? 'weight_reps';
  const shownMetric = chartMetric ?? (fromWorkout ? workoutChartMetric(shownAs) : null);
  const lastEntry = ov?.history[0] ?? null;
  const last = useMemo(() => {
    if (!lastEntry || !ex) return null;
    const warm = lastWarm?.sessionId === lastEntry.sessionId ? lastWarm.sets : [];
    const rows = lastTimeRows(lastEntry.sets, warm, { logType: shownAs, loadMode: ex.loadMode, distUnit: ex.distUnit }, units);
    return rows.length > 0 ? { dateISO: lastEntry.dateISO, sessionId: lastEntry.sessionId, rows } : null;
  }, [lastEntry, lastWarm, ex, shownAs, units]);
  const best = ov && ex ? headlineBest(ov.records.bests, shownAs) : null;

  const runOnce = async (action: () => Promise<void>, failText: string): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(failText);
    } finally {
      busy.current = false;
    }
  };

  const askHide = async (): Promise<void> => {
    setMenu(false);
    if (!ex) return;
    const ok = await askConfirm({
      title: `Hide ${ex.name}?`,
      body: 'It leaves every exercise list. Bring it back any time from "Hidden exercises" at the bottom of Progress → Exercises.',
      confirmLabel: 'Hide',
    });
    if (!ok) return;
    await runOnce(async () => {
      await setExerciseHidden(ex.id, true);
      exercisesChanged();
      router.back();
    }, "Couldn't hide it. Try again.");
  };

  const pickMergeTarget = async (into: TrackerExercise): Promise<void> => {
    if (!ex) return;
    const why = await mergeRefusal(ex.id, into.id).catch(() => 'not-found' as const);
    if (why === 'in-workout') {
      setMerging(false);
      setActionError(`${ex.name} is in the workout you're doing. Finish it first, then merge.`);
      return;
    }
    if (why) return;
    const n = ov?.history.length ?? 0;
    const ok = await askConfirm({
      title: `Merge into ${into.name}?`,
      body: `${n === 0 ? 'Its routines' : `Its ${n} ${n === 1 ? 'workout' : 'workouts'}, routines`} and records move to ${into.name}, and ${ex.name} is removed. This can't be undone.`,
      confirmLabel: 'Merge',
      destructive: true,
    });
    if (!ok) return;
    await runOnce(async () => {
      const res = await mergeExercise(ex.id, into.id);
      if (res.orphanMedia) await deleteKeptMedia(res.orphanMedia).catch(() => undefined);
      exercisesChanged();
      setMerging(false);
      router.replace({ pathname: '/exercise/[id]', params: { id: into.id } });
    }, "Couldn't merge them. Nothing changed — try again.");
  };
  /**
   * v14 "Start records fresh": a new gym, a new machine, a reset of form. Records count from
   * today (a workout earlier today counts too); History and the charts keep every workout.
   */
  const askRecordsFresh = async (): Promise<void> => {
    setMenu(false);
    if (!ex) return;
    const ok = await askConfirm({
      title: 'Start records fresh?',
      body: `Records for ${ex.name} will count from today's workouts on. Past workouts stay in History and charts.`,
      confirmLabel: 'Start fresh',
    });
    if (!ok) return;
    await runOnce(async () => {
      await setRecordsFrom(ex.id);
      // Review fix: an open workout's record pop-ups compare with the new bests at once.
      await useActiveWorkout.getState().refreshBests(ex.id).catch(() => undefined);
      setAttempt((n) => n + 1);
    }, "Couldn't change your records. Nothing changed — try again.");
  };
  const askCountAll = async (): Promise<void> => {
    setMenu(false);
    if (!ex || !recordsFrom) return;
    const ok = await askConfirm({
      title: 'Count all records again?',
      body: `Records for ${ex.name} will count every workout again, including the ones before ${tinyDateWithYear(recordsFrom)}.`,
      confirmLabel: 'Count all again',
    });
    if (!ok) return;
    await runOnce(async () => {
      await setRecordsFrom(ex.id, null);
      await useActiveWorkout.getState().refreshBests(ex.id).catch(() => undefined);
      setAttempt((n) => n + 1);
    }, "Couldn't change your records. Nothing changed — try again.");
  };

  const exId = ex?.id;
  const exType = ex?.logType;
  const mergeOnly = useCallback((e: TrackerExercise) => e.id !== exId && e.logType === exType, [exId, exType]);

  return (
    <Screen scroll={false}>
      {/* 13 Oct 2026: room under the last control for the phone's gesture bar, so it is never cut off */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl + insets.bottom }}>
        {/* header: back chevron + name + muscle + equipment */}
        <Animated.View
          entering={FadeInDown.duration(motion.slow)}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.lg }}
        >
          <IconButton icon="chevron-left" onPress={() => goBack(router, '/progress')} accessibilityLabel="Go back" />
          <View style={{ flex: 1, paddingTop: 2 }}>
            {ex ? (
              <>
                <Text style={{ fontFamily: type.display, fontSize: type.size.h2, color: color.ink, letterSpacing: -0.4 }}>
                  {ex.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' }}>
                  <Badge label={MUSCLE_LABEL[ex.muscles.primary[0]] ?? cap(ex.muscleGroup)} tone="accent" />
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
                    {cap(ex.equipment)} · {countWord(ov?.history.length ?? 0, 'workout')}
                  </Text>
                </View>
              </>
            ) : loading ? (
              <View style={{ gap: space.sm }}>
                <Skeleton width="68%" height={24} />
                <Skeleton width="42%" height={16} />
              </View>
            ) : (
              <Text style={{ fontFamily: type.display, fontSize: type.size.h2, color: color.ink, letterSpacing: -0.4 }}>
                Exercise
              </Text>
            )}
          </View>
          {ex ? (
            <Pressable
              onPress={() => setMenu(true)}
              accessibilityRole="button"
              accessibilityLabel={`Options for ${ex.name}`}
              style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Glyph name="more" size={24} color={color.inkSecondary} />
            </Pressable>
          ) : null}
        </Animated.View>

        <InlineError message={actionError} />

        {loading ? (
          <LoadingSkeleton />
        ) : !ex && failed ? (
          <LoadError what="this exercise" onRetry={() => setAttempt((n) => n + 1)} />
        ) : !ex ? (
          <EmptyState icon="dumbbell" title="Exercise not found" body="This exercise is missing from your library — head back and pick another." />
        ) : (
          <>
            <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

            {tab === 'summary' ? (
              <>
                {/* R-170: the owner-approved demo clip, at the top (nothing for exercises without one) */}
                <ExerciseClip catalogKey={ex.catalogKey} name={ex.name} hidden={Boolean(ex.mediaUri)} marginBottom={space.lg} />
                {/* EX-07: the answer first — last time and best, in the way it is logged */}
                {last ? (
                  <Card style={{ gap: space.sm, marginBottom: space.lg }}>
                    {/* 13 Oct 2026: last time's sets as the workout page's table; the heading opens that workout */}
                    <Pressable
                      onPress={() => openSession(last.sessionId)}
                      accessibilityRole="button"
                      accessibilityLabel={`Last time · ${relativeDay(last.dateISO)}. Open the workout`}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, opacity: pressed ? 0.7 : 1 })}
                    >
                      <Text style={[sectionLabel(), { flex: 1 }]}>Last time · {relativeDay(last.dateISO)}</Text>
                      <Icon name="chevron-right" size={18} color={color.inkMuted} />
                    </Pressable>
                    <SetTable rows={last.rows} logType={shownAs} />
                    {best ? (
                      <View style={{ gap: 2, marginTop: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.border }}>
                        <Text style={sectionLabel()}>Best · {RECORD_LABEL[best.kind].toLowerCase()}</Text>
                        <Text style={headValue()}>
                          {recordValueText(best, { logType: shownAs, loadMode: ex.loadMode, distUnit: ex.distUnit, units })}
                        </Text>
                      </View>
                    ) : null}
                    {recordsFrom ? <RecordsSinceLine from={recordsFrom} hasBest={best != null} onCountAll={() => void askCountAll()} /> : null}
                  </Card>
                ) : recordsFrom ? (
                  <Card style={{ marginBottom: space.lg }}>
                    <RecordsSinceLine from={recordsFrom} hasBest={false} onCountAll={() => void askCountAll()} />
                  </Card>
                ) : null}

                {!hasHistory ? (
                  <EmptyState icon="dumbbell" title="No sets logged yet" body="Add this exercise to a workout and your progress will land here." />
                ) : (
                  <>
                    <ExerciseMetricChart
                      history={ov.history}
                      bestSet={bestSet}
                      shownAs={shownAs}
                      cardio={isTimedCardio(shownAs, ex.muscles.primary)}
                      units={units}
                      distUnit={ex.distUnit}
                      metric={shownMetric}
                      onMetricChange={setChartMetric}
                      range={chartRange}
                      onRangeChange={setChartRange}
                    />
                    {recordCtx ? (
                      <ExercisePrRows bests={bests} kinds={ov.records.kinds} ctx={recordCtx} ladder={ladder} units={units} onOpenSession={openSession} />
                    ) : null}
                  </>
                )}
              </>
            ) : null}

            {tab === 'history' ? (
              hasHistory || current ? (
                <>
                  {/* 13 Oct 2026: the Summary's chart on top, sharing its choice and range */}
                  {hasHistory ? (
                  <ExerciseMetricChart
                    history={ov.history}
                    bestSet={bestSet}
                    shownAs={shownAs}
                    cardio={isTimedCardio(shownAs, ex.muscles.primary)}
                    units={units}
                    distUnit={ex.distUnit}
                    metric={shownMetric}
                    onMetricChange={setChartMetric}
                    range={chartRange}
                    onRangeChange={setChartRange}
                  />
                  ) : null}
                  {hasHistory ? <View style={{ height: space.lg }} /> : null}
                  <SessionHistory history={ov?.history ?? []} units={units} logType={shownAs} distUnit={ex.distUnit} names={names} onOpen={openSession} current={current} loadMode={ex.loadMode} />
                </>
              ) : (
                <EmptyState icon="dumbbell" title="No workouts yet" body="Every workout with this exercise shows here, with its sets." />
              )
            ) : null}

            {tab === 'howto' ? (
              <>
                {/* R-170: the demo clip above the steps, as on Summary */}
                <ExerciseClip catalogKey={ex.catalogKey} name={ex.name} hidden={Boolean(ex.mediaUri)} marginBottom={space.lg} />
                {/* how to — the picture (a tap opens it larger) and the steps, once */}
                {hasPicture || (entry?.steps.length ?? 0) > 0 ? (
                  <Card style={{ gap: space.md, marginBottom: space.lg }}>
                    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                      {hasPicture ? (
                        <ExerciseThumb catalogKey={ex.catalogKey} name={ex.name} size={96} media={media} onPress={() => setDemo(true)} />
                      ) : null}
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.ink }}>How to do it</Text>
                        {hasPicture ? (
                          <Pressable
                            onPress={() => setDemo(true)}
                            accessibilityRole="button"
                            accessibilityLabel={stillPhoto ? `See your photo of ${ex.name}` : `Watch how to do ${ex.name}`}
                            style={{ minHeight: 48, justifyContent: 'center' }}
                          >
                            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
                              {stillPhoto ? 'Tap to see your photo' : 'Tap to watch the movement'}
                            </Text>
                          </Pressable>
                        ) : (
                          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>No picture yet</Text>
                        )}
                      </View>
                    </View>
                    {/* Phase 0 (EX-05): the library drawing is credited where it is shown */}
                    {!ex.mediaUri && mediaFor(ex.catalogKey) != null ? <DrawingCredit /> : null}
                    {(entry?.steps ?? []).map((st, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                        <Text style={{ width: 16, fontFamily: type.monoBold, fontSize: type.size.sub, color: color.accent }}>{i + 1}</Text>
                        <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>{st}</Text>
                      </View>
                    ))}
                  </Card>
                ) : (
                  <Card style={{ marginBottom: space.lg }}>
                    <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.ink }}>How to do it</Text>
                    <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, marginTop: 4 }}>
                      No picture or steps yet. Add your own photo or video from the options at the top.
                    </Text>
                  </Card>
                )}

                {/* muscles, logging, versions */}
                <Card style={{ gap: 6, marginBottom: space.lg }}>
                  <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                    <Text style={{ fontFamily: type.bodySemi, color: color.ink }}>Works </Text>
                    {ex.muscles.primary.map((m) => MUSCLE_LABEL[m]).join(', ')}
                    {ex.muscles.secondary.length > 0 ? ` · helped by ${ex.muscles.secondary.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(', ')}` : ''}
                  </Text>
                  <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                    <Text style={{ fontFamily: type.bodySemi, color: color.ink }}>Logged as </Text>
                    {LOG_TYPE_LABEL[ex.logType].toLowerCase()}
                    {ex.logType === 'weight_reps' && ex.loadMode !== 'one' ? ` · ${LOAD_MODE_LABEL[ex.loadMode].title.toLowerCase()}` : ''}
                    {ex.bwShare > 0 ? ` · your body weight counts in the ${liftedWords(units)}` : ''}
                  </Text>
                  {easier ? <VersionLink label="Easier:" name={easier.name} onPress={openVersion(entry?.easier)} /> : null}
                  {harder ? <VersionLink label="Harder:" name={harder.name} onPress={openVersion(entry?.harder)} /> : null}
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      {ex ? (
        <ExerciseDemoSheet visible={demo} catalogKey={ex.catalogKey} name={ex.name} media={media} showSteps={false} onClose={() => setDemo(false)} />
      ) : null}
      {ex ? (
        <Sheet visible={menu} title={ex.name} onClose={() => setMenu(false)}>
          {ex.catalogKey ? (
            <>
              <SheetRow label="Your photo or video" onPress={openEdit} />
              {canHide ? <SheetRow label="Hide from my lists" onPress={() => void askHide()} /> : null}
            </>
          ) : (
            <>
              <SheetRow label="Edit exercise" onPress={openEdit} />
              <SheetRow
                label="Merge into…"
                onPress={() => {
                  setMenu(false);
                  setMerging(true);
                }}
              />
            </>
          )}
          {recordsFrom ? (
            <SheetRow label="Count all records again" onPress={() => void askCountAll()} />
          ) : hasHistory ? (
            <SheetRow label="Start records fresh…" onPress={() => void askRecordsFresh()} />
          ) : null}
        </Sheet>
      ) : null}
      {ex && !ex.catalogKey ? (
        <MergePicker visible={merging} name={ex.name} only={mergeOnly} onPick={(t) => void pickMergeTarget(t)} onClose={() => setMerging(false)} />
      ) : null}
    </Screen>
  );
}

/**
 * v14: "Records since 12 Oct · Count all again" — calm, under the best, so the member knows why
 * an older, heavier set is not the best any more. The link is a 48 dp target.
 */
function RecordsSinceLine({ from, hasBest, onCountAll }: { from: string; hasBest: boolean; onCountAll: () => void }) {
  const day = tinyDateWithYear(from);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.xs }}>
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
        {hasBest ? `Records since ${day}` : `No records since ${day} yet`} ·
      </Text>
      <Pressable
        onPress={onCountAll}
        accessibilityRole="button"
        accessibilityLabel={`Count all records again, including workouts before ${day}`}
        hitSlop={{ top: 8, bottom: 8 }}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accent }}>Count all again</Text>
      </Pressable>
    </View>
  );
}

/** EX-02: choose the exercise a duplicate folds into (logged the same way; never itself). */
function MergePicker({
  visible,
  name,
  only,
  onPick,
  onClose,
}: {
  visible: boolean;
  name: string;
  only: (e: TrackerExercise) => boolean;
  onPick: (e: TrackerExercise) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ fontFamily: type.display, fontSize: type.size.h3, color: color.ink }}>
              Merge {name} into…
            </Text>
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
              Pick the exercise to keep. Only ones logged the same way are listed.
            </Text>
          </View>
          <IconButton icon="close" onPress={onClose} accessibilityLabel="Close" />
        </View>
        {visible ? <ExercisePickerList onSelect={onPick} only={only} actionLabel="Merge into" trailing="chevron-right" recentIds={[]} /> : null}
      </View>
    </Modal>
  );
}

/** The Summary card's two headings ("Last time · …", "Best · …"): one style. Read when drawn: gym branding repaints the tokens. */
const sectionLabel = () => ({ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }) as const;
const headValue = () => ({ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }) as const;
