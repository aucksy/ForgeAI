import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BarChart } from '@/components/charts';
import { EmptyState, GhostButton, Icon, LoadError, Skeleton } from '@/components/ui';
import { tinyDate, todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { kgToShown, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { DateSparkline } from '@/tracker/components/DateSparkline';
import { fmtDuration } from '@/tracker/engine/logTypes';
import { liftLastText, liftTrendPoints, rangeView, type LiftSeries } from '@/tracker/engine/progressTop';
import { getExerciseOverview, type ExerciseOverview } from '@/tracker/services/exerciseStats';
import { useProgressPick } from '@/tracker/store/progressPickStore';

import { InspectReadout, Section } from './Section';
import { labelStep } from './util';

export interface LiftsSectionProps {
  /** The member's most-trained lifts (oldest point first). */
  lifts: LiftSeries[];
  rangeDays: number;
  /** Bumps every time Progress comes into view: the chart re-reads (PG-01). */
  focusKey: number;
  index: number;
}

type Chart = {
  title: string;
  points: { x: string; y: number }[];
  bars: { x: string; y: number }[] | null;
  yFormat: (n: number) => string;
  unitText: string;
};

/** The chosen lift's chart, by its type (PG-09: bodyweight, timed and distance lifts too). */
function chartOf(ov: ExerciseOverview, units: ReturnType<typeof useUnits>): Chart | null {
  const wu = weightUnitOf(units);
  if (ov.weightStats) {
    const p = ov.weightStats.progress;
    return {
      title: `Heaviest weight (${wu})`,
      points: p.map((x) => ({ x: x.dateISO, y: kgToShown(x.topWeightKg, units) })),
      bars: p.map((x) => ({ x: x.dateISO, y: kgToShown(x.volumeKg, units) })),
      yFormat: (n) => trimNum(n),
      unitText: wu,
    };
  }
  const s = ov.series;
  if (!s) return null;
  if (s.unit === 'kg') return { title: s.title, points: s.points.map((x) => ({ ...x, y: kgToShown(x.y, units) })), bars: null, yFormat: (n) => trimNum(n), unitText: wu };
  if (s.unit === 'seconds') return { title: s.title, points: s.points, bars: null, yFormat: (n) => fmtDuration(Math.round(n)), unitText: '' };
  return { title: s.title, points: s.points, bars: null, yFormat: (n) => trimNum(n), unitText: s.unit === 'reps' ? 'reps' : '' };
}

/**
 * "Your lifts" (audit Phase 5): the member's most-trained lifts, each with a small trend over
 * the chosen range, then one lift up close — any exercise can be chosen (PG-09). The chart
 * re-reads whenever Progress comes back into view (PG-01), and a lift not done in the range
 * says so instead of silently showing all of history (PG-27).
 *
 * Review fix (Phase 5): each row's sparkline plots the same number as the chart below —
 * heaviest weight per workout (most reps for a bodyweight lift), easy weeks out on both — and
 * says so once above the rows. Before, the rows drew estimated 1-rep max.
 */
export function LiftsSection({ lifts, rangeDays, focusKey, index }: LiftsSectionProps) {
  const units = useUnits();
  const today = todayISO();
  const picked = useProgressPick((s) => s.picked);
  const pickSeq = useProgressPick((s) => s.seq);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? picked ?? lifts[0]?.exerciseId ?? null;
  const [ov, setOv] = useState<ExerciseOverview | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);
  const reqRef = useRef(0);

  // A new pick on the exercise list wins over a row tapped earlier.
  useEffect(() => {
    if (picked) setChosen(picked);
  }, [picked, pickSeq]);

  useEffect(() => {
    if (!selected) {
      setOv(null);
      return;
    }
    const req = ++reqRef.current;
    setBusy(true);
    setInspect(null);
    getExerciseOverview(selected)
      .then((o) => {
        if (reqRef.current !== req) return;
        setOv(o);
        setFailed(false);
      })
      .catch(() => {
        // A failed re-read keeps the chart on screen; with none, it says so (never "No data").
        if (reqRef.current === req) setFailed(true);
      })
      .finally(() => {
        if (reqRef.current === req) setBusy(false);
      });
  }, [selected, focusKey, attempt]);

  const choose = (id: string): void => {
    if (id === selected) return;
    tap();
    setChosen(id);
  };

  const chart = ov && ov.exercise.id === selected ? chartOf(ov, units) : null;
  const view = chart ? rangeView(chart.points, rangeDays, today) : { points: [], note: null };
  const from = view.points[0]?.x;
  const bars = chart?.bars && from ? chart.bars.filter((b) => b.x >= from) : null;

  return (
    <Section
      title="Your lifts"
      index={index}
      right={inspect && chart ? <InspectReadout value={`${chart.yFormat(inspect.y)} ${chart.unitText}`.trim()} sub={tinyDate(inspect.x)} /> : undefined}
    >
      <View style={{ gap: space.xs }}>
        {lifts.length > 0 ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, paddingHorizontal: space.sm }}>
            Trend: heaviest weight per workout (most reps for bodyweight lifts)
          </Text>
        ) : null}
        {lifts.map((l) => {
          const v = rangeView(liftTrendPoints(l, units), rangeDays, today);
          const on = l.exerciseId === selected;
          return (
            <Pressable
              key={l.exerciseId}
              onPress={() => choose(l.exerciseId)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${l.name}. ${v.note ?? liftLastText(l, units, today)}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 56,
                paddingHorizontal: space.sm,
                borderRadius: radius.md,
                backgroundColor: on ? color.accentSoft : pressed ? color.surfaceRaised : 'transparent',
              })}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: on ? color.accent : color.ink }}>
                  {l.name}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkSecondary, marginTop: 2 }}>
                  {v.note ?? liftLastText(l, units, today)}
                </Text>
              </View>
              {v.points.length > 1 ? <DateSparkline data={v.points} width={72} height={30} /> : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            tap();
            router.push('/progress/pick-lift');
          }}
          accessibilityRole="button"
          accessibilityLabel="Any exercise. Choose one to see its trend"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            minHeight: 48,
            paddingHorizontal: space.sm,
            borderRadius: radius.md,
            backgroundColor: pressed ? color.surfaceRaised : 'transparent',
          })}
        >
          <Icon name="plus" size={18} color={color.accent} />
          <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>Any exercise</Text>
          <Icon name="chevron-right" size={16} color={color.inkMuted} />
        </Pressable>
      </View>

      {selected ? (
        <View style={{ marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: color.border, gap: space.sm }}>
          {busy && !chart && !failed ? (
            <View style={{ gap: space.md }}>
              <Skeleton width="60%" height={16} radius={6} />
              <Skeleton width="100%" height={160} radius={12} />
            </View>
          ) : failed && !chart ? (
            <LoadError compact what="this exercise" onRetry={() => setAttempt((n) => n + 1)} />
          ) : !ov ? (
            <EmptyState icon="dumbbell" title="This exercise is gone" body="Choose another one above." />
          ) : !chart || view.points.length === 0 ? (
            <>
              <Text numberOfLines={2} style={{ fontFamily: type.heading, fontSize: type.size.body, color: color.ink }}>
                {ov.exercise.name}
              </Text>
              <EmptyState icon="dumbbell" title="Not done yet" body="Do it in a workout and its trend shows here." />
            </>
          ) : (
            <>
              <Text numberOfLines={2} style={{ fontFamily: type.heading, fontSize: type.size.body, color: color.ink }}>
                {ov.exercise.name}
              </Text>
              {view.note ? <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{view.note}</Text> : null}
              <Text style={styles.chartLabel}>{chart.title}</Text>
              <DateLineChart data={view.points} fillGradient yFormat={chart.yFormat} onInspect={setInspect} />
              {bars && bars.length > 0 ? (
                <>
                  <Text style={[styles.chartLabel, { marginTop: space.md }]}>{`${weightUnitOf(units)} lifted per workout`}</Text>
                  <BarChart data={bars} height={110} labelEvery={labelStep(bars.length)} />
                </>
              ) : null}
            </>
          )}
          {ov ? (
            <View style={{ marginTop: space.md }}>
              <GhostButton
                label="Open exercise page"
                icon="dumbbell"
                onPress={() => {
                  tap();
                  router.push({ pathname: '/exercise/[id]', params: { id: ov.exercise.id } });
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

const styles = {
  chartLabel: {
    fontFamily: type.bodySemi,
    fontSize: type.size.sub,
    color: color.inkSecondary,
    marginTop: space.xs,
  },
} as const;
