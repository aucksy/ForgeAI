/**
 * Exercise page. Audit Phase 4 (EX-07, EX-09, EX-14) — the answer first:
 *  1. "Last time · Best" — the member's own numbers, in the way the exercise is logged (a
 *     pull-up always at +0 kg reads as reps, never "0 kg" tiles or a flat 0 chart);
 *  2. how to do it — the picture (a tap opens it larger, never repeating the steps) and the
 *     steps, once; a still photo is called a photo, and with no picture there is no link;
 *  3. muscles, logging, easier / harder versions;
 *  4. charts and records; past sessions folded under their count, all of them, page by page.
 * The options menu: Edit and "Merge into…" for the member's own exercises (EX-02); "Your photo
 * or video" and "Hide" for library ones they never logged.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseHero } from '@/components/exercise/ExerciseHero';
import { SessionHistory } from '@/components/exercise/SessionHistory';
import { askConfirm, Badge, Card, EmptyState, IconButton, LoadError, Screen, SectionHeader, Sheet, SheetRow, Skeleton, StatTile } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { relativeDay } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { navigateOnce } from '@/lib/guardedAction';
import { useSettings } from '@/store/settingsStore';
import { chart, color, motion, radius, space, type } from '@/theme/tokens';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { mediaFor } from '@/tracker/catalog/media';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { DrawingCredit } from '@/tracker/components/DrawingCredit';
import { ExerciseDemoSheet } from '@/tracker/components/ExerciseDemoSheet';
import { ExerciseMetricChart } from '@/tracker/components/ExerciseMetricChart';
import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import { ExercisePrRows } from '@/tracker/components/ExercisePrRows';
import { ExerciseThumb } from '@/tracker/components/ExerciseThumb';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { showW } from '@/tracker/components/unitText';
import { getExerciseIdsByCatalogKey, type TrackerExercise } from '@/tracker/db/exerciseInfo';
import { hideRefusal, mergeExercise, mergeRefusal, setExerciseHidden } from '@/tracker/db/exerciseManage';
import { fmtDuration, LOAD_MODE_LABEL, LOG_TYPE_LABEL } from '@/tracker/engine/logTypes';
import { RECORD_LABEL } from '@/tracker/engine/records';
import { xrmLadder } from '@/tracker/services/exerciseAnalytics';
import { headlineBest, lastTimeLine } from '@/tracker/services/exerciseHeadline';
import { deleteKeptMedia } from '@/tracker/services/exerciseMedia';
import { getExerciseOverview, type ExerciseOverview } from '@/tracker/services/exerciseStats';
import { recordValueText } from '@/tracker/services/recordText';
import { exercisesChanged } from '@/tracker/store/exerciseListStore';

const cap = (s: string) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

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
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const units = useSettings((s) => s.unitSystem);
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
  const ladder = useMemo(() => (stats ? xrmLadder(stats.history) : []), [stats]);
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
  const last = ov && ex ? lastTimeLine(ov.history, shownAs, units, ex.distUnit) : null;
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
      body: 'It leaves every exercise list. Bring it back any time from "Hidden exercises" in the library.',
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
  const exId = ex?.id;
  const exType = ex?.logType;
  const mergeOnly = useCallback((e: TrackerExercise) => e.id !== exId && e.logType === exType, [exId, exType]);

  const series = ov?.series ?? null;
  const seriesFmt = (n: number): string =>
    series?.unit === 'seconds' ? fmtDuration(n) : series?.unit === 'kg' ? showW(n, units) : trimNum(n);

  return (
    <Screen scroll={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        {/* header: back chevron + name + muscle + equipment */}
        <Animated.View
          entering={FadeInDown.duration(motion.slow)}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.lg }}
        >
          <IconButton icon="chevron-left" onPress={() => router.back()} accessibilityLabel="Go back" />
          <View style={{ flex: 1, paddingTop: 2 }}>
            {ex ? (
              <>
                <Text style={{ fontFamily: type.display, fontSize: type.size.h2, color: color.ink, letterSpacing: -0.4 }}>
                  {ex.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' }}>
                  <Badge label={MUSCLE_LABEL[ex.muscles.primary[0]] ?? cap(ex.muscleGroup)} tone="accent" />
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
                    {cap(ex.equipment)} · {ov?.history.length ?? 0} {ov?.history.length === 1 ? 'session' : 'sessions'}
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
          {ex ? <IconButton icon="settings" onPress={() => setMenu(true)} accessibilityLabel={`Options for ${ex.name}`} /> : null}
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
            {/* EX-07: the answer first — last time and best, in the way it is logged */}
            {last ? (
              <Card style={{ gap: space.sm, marginBottom: space.lg }}>
                <View style={{ gap: 2 }}>
                  <Text style={headLabel}>Last time · {relativeDay(last.dateISO)}</Text>
                  <Text style={headValue}>{last.text}</Text>
                </View>
                {best ? (
                  <View style={{ gap: 2 }}>
                    <Text style={headLabel}>Best · {RECORD_LABEL[best.kind].toLowerCase()}</Text>
                    <Text style={headValue}>
                      {recordValueText(best, { logType: shownAs, loadMode: ex.loadMode, distUnit: ex.distUnit, units })}
                    </Text>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {/* how to — the picture (a tap opens it larger) and the steps, once */}
            {hasPicture || (entry?.steps.length ?? 0) > 0 ? (
              <Card style={{ gap: space.md, marginBottom: space.lg }}>
                <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                  {hasPicture ? (
                    <ExerciseThumb catalogKey={ex.catalogKey} name={ex.name} size={64} media={media} onPress={() => setDemo(true)} />
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
                {(entry?.steps ?? []).map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                    <Text style={{ width: 16, fontFamily: type.monoBold, fontSize: type.size.sub, color: color.accent }}>{i + 1}</Text>
                    <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>{s}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

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
                {ex.bwShare > 0 ? ' · your body weight counts in volume' : ''}
              </Text>
              {easier ? <VersionLink label="Easier:" name={easier.name} onPress={openVersion(entry?.easier)} /> : null}
              {harder ? <VersionLink label="Harder:" name={harder.name} onPress={openVersion(entry?.harder)} /> : null}
            </Card>

            {!hasHistory ? (
              <EmptyState icon="dumbbell" title="No sets logged yet" body="Add this exercise to a workout and your progress will land here." />
            ) : stats ? (
              <>
                <ExerciseHero stats={stats} units={units} />
                <ExerciseMetricChart progress={stats.progress} bestSet={bestSet} units={units} />
                {recordCtx ? <ExercisePrRows bests={bests} kinds={ov.records.kinds} ctx={recordCtx} ladder={ladder} units={units} onOpenSession={openSession} /> : null}
                <SessionHistory history={ov.history} units={units} logType={shownAs} distUnit={ex.distUnit} />
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
                  {ov.tiles.map((t) => (
                    <View key={t.label} style={{ flexBasis: '30%', flexGrow: 1 }}>
                      <StatTile label={t.label} value={t.value} icon="trophy" />
                    </View>
                  ))}
                </View>
                {series && series.points.length > 0 ? (
                  <View style={{ marginTop: space.xl }}>
                    <SectionHeader title={series.title} />
                    <Card>
                      <DateLineChart data={series.points} height={200} color={chart.series[0]} fillGradient yFormat={seriesFmt} onInspect={() => undefined} />
                    </Card>
                  </View>
                ) : null}
                {recordCtx ? <ExercisePrRows bests={bests} kinds={ov.records.kinds} ctx={recordCtx} ladder={[]} units={units} onOpenSession={openSession} /> : null}
                <SessionHistory history={ov.history} units={units} logType={shownAs} distUnit={ex.distUnit} />
              </>
            )}
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
        </Sheet>
      ) : null}
      {ex && !ex.catalogKey ? (
        <MergePicker visible={merging} name={ex.name} only={mergeOnly} onPick={(t) => void pickMergeTarget(t)} onClose={() => setMerging(false)} />
      ) : null}
    </Screen>
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

const headLabel = { fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted } as const;
const headValue = { fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink } as const;
