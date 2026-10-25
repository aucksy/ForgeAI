/**
 * Progress tab (Release A, A5, docs/ux/MEMBER-APP-MAP.md §3.1; owner yes 24 Oct 2026). What sat behind
 * the Profile's tiles, one tap from anywhere, so Profile can go back to being about you:
 *  - Your training: Charts (the old Statistics page: last 7 days, sets for each muscle, main lifts,
 *    records, reports), Exercises (every exercise with its history and how-to), Records;
 *  - Your body: Body (the old Measures page: body weight, measurements and progress photos);
 *  - Reports: the latest monthly report and the year so far (or last year's review).
 * Release B fills more blocks here (which muscles are ready today, badges); no block shows before
 * it has something real in it.
 * R-132 (owner, 25 Oct 2026): at the very top, tabs "Kg lifted · Sets · Duration" pick what the page
 * counts; under them "Today: <Up next workout>" says what to beat today in that mode (TodayGoalCard), then
 * the history bars in the same mode (Profile's chart, its chips left out: the tabs choose). Then the links.
 */
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { chartAllowed } from '@/cloud/limitsFlag';
import { explainLimit, monthsOfRange } from '@/cloud/limitsPrompt';
import { GymBrandMark } from '@/components/GymBrandMark';
import { LinkRow } from '@/components/stats/parts';
import { Icon, Screen, type IconName } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { navigateOnce } from '@/lib/guardedAction';
import { readWithRetry } from '@/lib/retryRead';
import { useUnits } from '@/lib/useUnits';
import { color, space, type } from '@/theme/tokens';
import { HistoryChartCard } from '@/tracker/components/profile/HistoryChartCard';
import { TodayGoalCard } from '@/tracker/components/progress/TodayGoalCard';
import { SegmentedTabs } from '@/tracker/components/SegmentedTabs';
import { chartMetricLabel, type ChartBar, type ChartRange } from '@/tracker/engine/historyChart';
import { reportRows } from '@/tracker/lib/progressTab';
import { PROGRESS_MODES, type ProgressMode, type TodayGoal } from '@/tracker/lib/todayGoal';
import { historyStamp } from '@/tracker/services/historyFeed';
import { getHistoryChart } from '@/tracker/services/profileService';
import { getTrainedMonths } from '@/tracker/services/reportsService';
import { getTodayGoal, getWorkoutCount } from '@/tracker/services/todayGoalService';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

function Dot({ icon }: { icon: IconName }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} color={color.accent} />
    </View>
  );
}

/** A block's heading: small grey caps, as Settings' groups. Read when drawn: gym branding repaints the tokens. */
function BlockHeading({ title }: { title: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 1.1, textTransform: 'uppercase', marginTop: space.md }}
    >
      {title}
    </Text>
  );
}

export default function ProgressScreen() {
  const router = useRouter();
  const units = useUnits();
  const [months, setMonths] = useState<readonly string[] | null>(null);
  // One page per tap, however fast the taps.
  const busy = useRef(false);

  // R-132: the mode the tabs picked (kilos first: the owner's number), today's goal, and the bars.
  const [mode, setMode] = useState<ProgressMode>('volume');
  const [goal, setGoal] = useState<TodayGoal | null>(null);
  const range = useTrackerPrefs((s) => s.chartRange);
  const setRange = useTrackerPrefs((s) => s.setChartRange);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const [chart, setChart] = useState<{ range: ChartRange; bars: ChartBar[] } | null>(null);
  const bars = chart && chart.range === range ? chart.bars : null;
  const [chartLoading, setChartLoading] = useState(true);
  const [chartFailed, setChartFailed] = useState(false);
  const [workoutsEver, setWorkoutsEver] = useState<number | null>(null);

  // The bars already on screen were read at this history stamp: no new workout = no new read (review).
  const chartAt = useRef<string | null>(null);
  const loadChart = useCallback(async (r: ChartRange, stamp: string | null = null) => {
    if (stamp != null && chartAt.current === `${stamp}|${r}`) return;
    chartAt.current = null;
    setChartLoading(true);
    try {
      const b = await readWithRetry(() => getHistoryChart(r), { wanted: () => rangeRef.current === r });
      if (rangeRef.current !== r) return;
      setChart({ range: r, bars: b });
      setChartFailed(false);
      if (stamp != null) chartAt.current = `${stamp}|${r}`;
    } catch {
      if (rangeRef.current === r) setChartFailed(true);
    } finally {
      if (rangeRef.current === r) setChartLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getTrainedMonths()
        .then((m) => {
          if (alive) setMonths(m);
        })
        .catch((e: unknown) => {
          console.warn('[progress] months could not be read', e);
          if (alive) setMonths((m) => m ?? []);
        });
      // Read on every visit: a finished workout moves Up next on and changes "last time".
      getTodayGoal()
        .then((g) => {
          if (alive) setGoal(g);
        })
        .catch((e: unknown) => console.warn('[progress] today goal could not be read', e));
      getWorkoutCount()
        .then((n) => {
          if (alive) setWorkoutsEver(n);
        })
        .catch(() => undefined);
      void historyStamp()
        .catch(() => null)
        .then((stamp) => loadChart(rangeRef.current, stamp));
      return () => {
        alive = false;
      };
    }, [loadChart]),
  );

  const pickRange = (r: ChartRange): void => {
    // #43: the free plan shows 3 months of charts (switched off at launch; gym members never meet it).
    void chartAllowed(monthsOfRange(r)).then((ok) => {
      if (!ok) {
        void explainLimit('charts', () => router.push('/settings/gym'));
        return;
      }
      setRange(r);
      rangeRef.current = r;
      void loadChart(r);
    });
  };

  const open = (href: Href): void => {
    navigateOnce(busy, () => router.push(href));
  };
  const reports = months ? reportRows(months, todayISO()) : [];

  return (
    <Screen title="Progress">
      <View style={{ gap: space.sm, paddingBottom: space.xl }}>
        {/* Gym branding: the member's gym, small, under the title (branded gyms only). */}
        <GymBrandMark />

        {/* R-132: what the page counts, then today's goal and the history bars in that mode. */}
        <SegmentedTabs
          tabs={PROGRESS_MODES.map((m) => ({ id: m, label: chartMetricLabel(m, units) }))}
          value={mode}
          onChange={setMode}
        />
        {goal ? <TodayGoalCard goal={goal} mode={mode} units={units} onOpen={() => open('/(tabs)/workout')} /> : null}
        <View style={{ marginTop: space.md }}>
          <HistoryChartCard
            bars={bars}
            metric={mode}
            range={range}
            units={units}
            today={todayISO()}
            loading={chartLoading}
            failed={chartFailed}
            workoutsEver={workoutsEver}
            onMetric={() => undefined}
            onRange={pickRange}
            onRetry={() => void loadChart(rangeRef.current)}
            showChips={false}
          />
        </View>

        <BlockHeading title="Your training" />
        <LinkRow title="Charts" sub="Your last 7 days, sets for each muscle and your main lifts" leading={<Dot icon="chart" />} onPress={() => open('/stats')} />
        <LinkRow title="Exercises" sub="Every exercise, with its history and how to do it" leading={<Dot icon="dumbbell" />} onPress={() => open('/exercises')} />
        <LinkRow title="Records" sub="Your best weights and reps" leading={<Dot icon="trophy" />} onPress={() => open('/records')} />

        <BlockHeading title="Your body" />
        <LinkRow title="Body" sub="Body weight, measurements and progress photos" leading={<Dot icon="scale" />} onPress={() => open('/measures')} />

        <BlockHeading title="Reports" />
        {reports.map((r) => (
          <LinkRow
            key={r.period}
            title={r.title}
            sub={r.sub}
            leading={<Dot icon="calendar" />}
            onPress={() => open({ pathname: '/report/[period]', params: { period: r.period } })}
          />
        ))}
        {months && reports.length === 0 ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkMuted }}>
            Your monthly report and year in review show here after your first workout.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
