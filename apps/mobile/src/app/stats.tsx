/**
 * Statistics (R3, PLAN §4.1 — Hevy's Statistics page), opened from Profile's Dashboard tile.
 *   Last 7 days (workouts + body map) · Sets per muscle group (range, week/month, pick groups) ·
 *   Muscle distribution (this period vs the one before, then workouts / time / kg lifted / sets) ·
 *   Main exercises · Records · Strength score · Monthly report and Year in review.
 * Every number comes from the existing rules (one volume rule, one record rule, the same set
 * count as the body map); the new maths is engine/statistics.ts.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { BodyMapSection, ReportsCard, SectionSkeleton, StrengthSection } from '@/components/analytics';
import { BarChart } from '@/components/charts';
import { ChoiceRow, LinkRow, StatHeading, leavePage } from '@/components/stats/parts';
import { Card, Chip, EmptyState, LoadError, Screen, StatTile } from '@/components/ui';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { getLatestBodyWeight } from '@/db/repos/userRepo';
import { getAnalyticsBundle } from '@/services/analytics';
import { addDays, tinyDate, todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { fmtVol, liftedWords } from '@/lib/units';
import { useLoad } from '@/lib/useLoad';
import { useUnits } from '@/lib/useUnits';
import { chart, color, radius, space, type } from '@/theme/tokens';
import { liftsBeatingBest } from '@/tracker/engine/headline';
import { RECORD_LABEL } from '@/tracker/engine/records';
import { changeText, durationText } from '@/tracker/engine/reports';
import {
  STAT_GROUPS,
  STAT_RANGES,
  bucketLabel,
  distribution,
  periodPair,
  rangeFrom,
  setsSeries,
  timesText,
  totalsBetween,
  type StatGroup,
  type StatGrouping,
  type StatRange,
} from '@/tracker/engine/statistics';
import { fmtSets } from '@/tracker/engine/volume';
import { monthOf } from '@/tracker/lib/months';
import { getFirstWorkoutDate } from '@/tracker/services/historyFeed';
import { recordValueText } from '@/tracker/services/recordText';
import { getRecordEvents } from '@/tracker/services/recordsService';
import { earlierReports, getMonthCounts, reportIndex } from '@/tracker/services/reportsService';
import { countWorkoutsBetween, getMainExercises, getStatSessions } from '@/tracker/services/statisticsService';
import { getMuscleSetsBetween } from '@/tracker/services/volumeService';

type DistRange = Exclude<StatRange, 'all'>;
const DIST_RANGES = STAT_RANGES.filter((r) => r.id !== 'all') as { id: DistRange; label: string }[];
const GROUPINGS: { id: StatGrouping; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];
const RECENT_RECORDS = 3;
const workoutsWord = (n: number) => `${fmtInt(n)} ${n === 1 ? 'workout' : 'workouts'}`;

export default function StatisticsScreen() {
  const units = useUnits();
  const router = useRouter();
  const openExercise = (id: string) => router.push({ pathname: '/exercise/[id]', params: { id } });

  // The parts that do not follow a range, read each time the page comes into view.
  const top = useLoad(
    async () => {
      const today = todayISO();
      const from7 = addDays(today, -6);
      const [first, week, weekMuscles, main, events, monthCounts, weighIn, bundle] = await Promise.all([
        getFirstWorkoutDate(),
        countWorkoutsBetween(from7, today),
        getMuscleSetsBetween(from7, today),
        getMainExercises(6),
        getRecordEvents(),
        getMonthCounts(),
        getLatestBodyWeight().catch(() => null),
        getAnalyticsBundle(180).catch(() => null),
      ]);
      return { today, first, week, weekMuscles, main, events, monthCounts, hasWeight: weighIn != null, strength: bundle?.strengthTrend ?? [] };
    },
    [],
    { onFocus: true },
  );

  const [range, setRange] = useState<StatRange>('3m');
  const [grouping, setGrouping] = useState<StatGrouping>('week');
  const [picked, setPicked] = useState<StatGroup[]>(STAT_GROUPS.map((g) => g.id));
  const [distRange, setDistRange] = useState<DistRange>('30d');

  const today = top.data?.today ?? todayISO();
  const first = top.data?.first ?? null;
  const setsFrom = rangeFrom(range, today, first);
  const pair = periodPair(distRange, today);
  const readFrom = setsFrom < pair.prev.from ? setsFrom : pair.prev.from;

  // One read covers both range sections: again when the earliest day changes, and on each visit.
  const win = useLoad(() => getStatSessions(readFrom, today), [readFrom, today], { onFocus: true });

  const series = useMemo(
    () => (win.data ? setsSeries(win.data, setsFrom, today, grouping, picked) : []),
    [win.data, setsFrom, today, grouping, picked],
  );
  const crossesYear = series.length > 0 && series[0].bucket.slice(0, 4) !== series[series.length - 1].bucket.slice(0, 4);
  const setsTotal = series.reduce((n, p) => n + p.sets, 0);
  const dist = win.data ? distribution(win.data, pair) : [];
  const distMax = Math.max(1, ...dist.map((d) => Math.max(d.cur, d.prev)));
  const cur = win.data ? totalsBetween(win.data, pair.cur.from, pair.cur.to) : null;
  const prev = win.data ? totalsBetween(win.data, pair.prev.from, pair.prev.to) : null;

  const togglePick = (g: StatGroup) => {
    setPicked((p) => (p.includes(g) ? (p.length === 1 ? p : p.filter((x) => x !== g)) : STAT_GROUPS.map((x) => x.id).filter((x) => x === g || p.includes(x))));
  };

  const body = (() => {
    if (top.state === 'error') return <LoadError what="your statistics" onRetry={top.retry} />;
    const d = top.data;
    if (!d) return [0, 1, 2].map((i) => <SectionSkeleton key={i} index={i} />);
    if (!d.first) {
      return <EmptyState icon="chart" title="No workouts yet" body="Your statistics show here once you finish a workout." />;
    }

    const months = [...d.monthCounts.keys()].sort().reverse();
    const idx = reportIndex(months, today);
    const earlier = earlierReports(months, today, idx);
    const workoutsIn = (year: number | null) =>
      year != null ? [...d.monthCounts.entries()].filter(([m]) => m.startsWith(String(year))).reduce((n, [, c]) => n + c, 0) : 0;
    const recent = d.events.slice(0, RECENT_RECORDS);

    return (
      <>
        {/* 1. Last 7 days */}
        <StatHeading title="Last 7 days" sub={workoutsWord(d.week)} />
        <BodyMapSection sets={d.weekMuscles} index={0} onOpenExercise={openExercise} />

        {/* 2. Sets per muscle group */}
        <StatHeading title="Sets per muscle group" sub={win.data ? `${fmtSets(setsTotal)} ${setsTotal === 1 ? 'set' : 'sets'}` : undefined} />
        <Card style={{ gap: space.md }}>
          <ChoiceRow label="Range" options={STAT_RANGES} value={range} onChange={setRange} />
          <ChoiceRow label="Group by" options={GROUPINGS} value={grouping} onChange={setGrouping} />
          <View
            accessibilityLabel="Muscle groups"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: CHIP_TOUCH_SLOP, marginVertical: -CHIP_TOUCH_SLOP }}
          >
            {STAT_GROUPS.map((g) => (
              <Chip key={g.id} role="checkbox" label={g.label} selected={picked.includes(g.id)} onPress={() => togglePick(g.id)} />
            ))}
          </View>
          {win.state === 'error' ? (
            <LoadError what="your sets" onRetry={win.retry} />
          ) : !win.data ? (
            <View style={{ height: 180 }} />
          ) : setsTotal === 0 ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, paddingVertical: space.lg, textAlign: 'center' }}>
              No sets for these muscles in this range.
            </Text>
          ) : (
            <View
              accessible
              accessibilityLabel={`Sets per ${grouping}: ${series
                .slice(-6)
                .map((p) => `${bucketLabel(p.bucket, grouping, crossesYear)} ${fmtSets(p.sets)}`)
                .join(', ')}`}
            >
              <BarChart
                data={series.map((p) => ({ x: bucketLabel(p.bucket, grouping, crossesYear), y: p.sets }))}
                height={180}
                labelEvery={Math.max(1, Math.ceil(series.length / 5))}
                yFormat={(n) => fmtSets(Math.round(n))}
                highlightLast
              />
            </View>
          )}
        </Card>

        {/* 3. Muscle distribution */}
        <StatHeading title="Muscle distribution" sub="Sets this period against the one before" />
        <Card style={{ gap: space.md }}>
          <ChoiceRow label="Period" options={DIST_RANGES} value={distRange} onChange={setDistRange} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <Legend tint={chart.series[0]} text="This period" />
            <Legend tint={color.axis} text="Before" />
          </View>
          {win.data
            ? dist.map((row) => (
                <View key={row.group} accessible accessibilityLabel={`${row.label}: ${fmtSets(row.cur)} sets, ${fmtSets(row.prev)} before`} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
                    <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>{row.label}</Text>
                    <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkSecondary }}>
                      {fmtSets(row.cur)}
                      <Text style={{ color: color.inkMuted }}>{` · ${fmtSets(row.prev)}`}</Text>
                    </Text>
                  </View>
                  <Bar pct={row.cur / distMax} tint={chart.series[0]} />
                  <Bar pct={row.prev / distMax} tint={color.axis} />
                </View>
              ))
            : null}
        </Card>
        {cur && prev ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md }}>
            <Tile label="Workouts" value={fmtInt(cur.workouts)} delta={changeText(cur.workouts, prev.workouts, 'count')} />
            <Tile label="Time" value={durationText(cur.durationSec)} delta={changeText(cur.durationSec, prev.durationSec, 'pct')} />
            <Tile label={liftedWords(units, true)} value={fmtVol(cur.volumeKg, units)} delta={changeText(cur.volumeKg, prev.volumeKg, 'pct')} />
            <Tile label="Sets" value={fmtInt(cur.sets)} delta={changeText(cur.sets, prev.sets, 'count')} />
          </View>
        ) : null}

        {/* 4. Main exercises */}
        <StatHeading title="Main exercises" />
        <View style={{ gap: space.sm }}>
          {d.main.map((m) => (
            <LinkRow key={m.exerciseId} title={m.name} sub={`Last: ${tinyDate(m.lastISO)}`} value={timesText(m.times)} onPress={() => openExercise(m.exerciseId)} />
          ))}
        </View>

        {/* 5. Records */}
        <StatHeading
          title="Records"
          sub={d.events.length > 0 ? `${fmtInt(d.events.length)} in all` : undefined}
          action={d.events.length > 0 ? { label: 'See all', spoken: 'See all records', onPress: () => router.push('/records') } : undefined}
        />
        {recent.length === 0 ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>Beat a previous best and it shows here.</Text>
        ) : (
          <View style={{ gap: space.sm }}>
            {recent.map((r) => (
              <LinkRow
                key={`${r.exerciseId}-${r.kind}-${r.dateISO}-${r.startedAt ?? 0}`}
                title={r.exerciseName}
                sub={`${RECORD_LABEL[r.kind]} · ${tinyDate(r.dateISO)}`}
                value={recordValueText(r, r.info)}
                onPress={() => openExercise(r.exerciseId)}
              />
            ))}
          </View>
        )}

        {/* 6. Strength score (ours) */}
        <View style={{ marginTop: space.xl }}>
          <StrengthSection data={d.strength} hasBodyWeight={d.hasWeight} onAddWeight={() => router.push({ pathname: '/measures', params: { kind: 'bodyweight' } })} index={0} />
        </View>

        {/* 7. Monthly report and Year in review */}
        {idx.month || idx.year != null ? (
          <>
            <StatHeading title="Reports" />
            <ReportsCard
              month={idx.month}
              monthRunning={idx.month === monthOf(today)}
              monthWorkouts={idx.month ? d.monthCounts.get(idx.month) ?? 0 : 0}
              monthRecords={idx.month ? liftsBeatingBest(d.events.filter((e) => monthOf(e.dateISO) === idx.month)) : 0}
              year={idx.year}
              yearRunning={idx.year === Number(today.slice(0, 4))}
              yearWorkouts={workoutsIn(idx.year)}
              lastYear={idx.lastYear}
              lastYearWorkouts={workoutsIn(idx.lastYear)}
              earlier={earlier}
              index={0}
              onOpen={(period) => router.push({ pathname: '/report/[period]', params: { period } })}
            />
          </>
        ) : null}
      </>
    );
  })();

  return (
    <Screen title="Statistics" onBack={() => leavePage(router)}>
      <View style={{ paddingBottom: space.xxl }}>{body}</View>
    </Screen>
  );
}

function Legend({ tint, text }: { tint: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tint }} />
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{text}</Text>
    </View>
  );
}

function Bar({ pct, tint }: { pct: number; tint: string }) {
  return (
    <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: color.surfaceSunken, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: 8, borderRadius: radius.pill, backgroundColor: tint }} />
    </View>
  );
}

function Tile({ label, value, delta }: { label: string; value: string; delta: { value: string; good: boolean } | null }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', minWidth: 150 }}>
      <StatTile label={label} value={value} delta={delta ?? undefined} />
    </View>
  );
}
