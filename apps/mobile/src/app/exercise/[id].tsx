/**
 * Exercise page: how to do it (picture → moving demo, short steps), the muscles it works,
 * its easier and harder versions, and its progress — numbers that fit how it is logged
 * (Phase 2: weight, bodyweight reps, help, time, distance). Custom exercises can be edited;
 * any exercise can carry the member's own photo or video.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ExerciseHero } from '@/components/exercise/ExerciseHero';
import { SessionHistory } from '@/components/exercise/SessionHistory';
import { Badge, Card, EmptyState, IconButton, Screen, SectionHeader, Skeleton, StatTile } from '@/components/ui';
import { trimNum } from '@/lib/format';
import { useSettings } from '@/store/settingsStore';
import { chart, color, motion, radius, space, type } from '@/theme/tokens';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { mediaFor } from '@/tracker/catalog/media';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { DrawingCredit } from '@/tracker/components/DrawingCredit';
import { ExerciseDemoSheet } from '@/tracker/components/ExerciseDemoSheet';
import { ExerciseMetricChart } from '@/tracker/components/ExerciseMetricChart';
import { ExercisePrRows } from '@/tracker/components/ExercisePrRows';
import { ExerciseThumb } from '@/tracker/components/ExerciseThumb';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { showW } from '@/tracker/components/unitText';
import { getExerciseIdsByCatalogKey } from '@/tracker/db/exerciseInfo';
import { fmtDuration, LOAD_MODE_LABEL, LOG_TYPE_LABEL } from '@/tracker/engine/logTypes';
import { xrmLadder } from '@/tracker/services/exerciseAnalytics';
import { getExerciseOverview, type ExerciseOverview } from '@/tracker/services/exerciseStats';

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
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 }}
    >
      <Glyph name="swap" size={16} color={color.accent} />
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{label}</Text>
      <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: onPress ? color.accent : color.ink }} numberOfLines={1}>
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
  const [demo, setDemo] = useState(false);

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
          const e = catalogEntry(o?.exercise.catalogKey);
          const keys = [e?.easier, e?.harder].filter((k): k is string => Boolean(k));
          const ids = await getExerciseIdsByCatalogKey(keys).catch(() => new Map<string, string>());
          if (alive) setVersionIds(ids);
        })
        .catch(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [id]),
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
  const openSession = (sid: string) => router.push(`/session/${sid}`);
  const media = ex ? { uri: ex.mediaUri, type: ex.mediaType } : null;
  const hasPicture = Boolean(ex?.mediaUri) || mediaFor(ex?.catalogKey) != null;
  const easier = catalogEntry(entry?.easier);
  const harder = catalogEntry(entry?.harder);
  const openVersion = (key: string | undefined) => {
    const vid = key ? versionIds.get(key) : undefined;
    return vid ? () => router.push({ pathname: '/exercise/[id]', params: { id: vid } }) : null;
  };

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
          {ex ? (
            <IconButton
              icon="settings"
              onPress={() => router.push({ pathname: '/library/new', params: { id: ex.id } })}
              accessibilityLabel={ex.catalogKey ? 'Your photo or video for this exercise' : 'Edit exercise'}
            />
          ) : null}
        </Animated.View>

        {loading ? (
          <LoadingSkeleton />
        ) : !ex ? (
          <EmptyState icon="dumbbell" title="Exercise not found" body="This exercise is missing from your library — head back and pick another." />
        ) : (
          <>
            {/* how to — still picture; the demo moves only after a tap */}
            {hasPicture || (entry?.steps.length ?? 0) > 0 ? (
              <Card style={{ gap: space.md, marginBottom: space.lg }}>
                <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                  <ExerciseThumb catalogKey={ex.catalogKey} name={ex.name} size={64} media={media} onPress={() => setDemo(true)} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.ink }}>How to do it</Text>
                    <Pressable onPress={() => setDemo(true)} accessibilityRole="button" accessibilityLabel={`Show how to do ${ex.name}`}>
                      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
                        {hasPicture ? 'Tap to watch the movement' : 'Tap for the steps'}
                      </Text>
                    </Pressable>
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
                <SessionHistory history={ov.history} units={units} logType={ex.logType} distUnit={ex.distUnit} />
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
                <SessionHistory history={ov.history} units={units} logType={ex.logType} distUnit={ex.distUnit} />
              </>
            )}
          </>
        )}
      </ScrollView>
      {ex ? (
        <ExerciseDemoSheet visible={demo} catalogKey={ex.catalogKey} name={ex.name} media={media} onClose={() => setDemo(false)} />
      ) : null}
    </Screen>
  );
}
