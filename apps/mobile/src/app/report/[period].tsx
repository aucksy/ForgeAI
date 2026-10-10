/**
 * Monthly report ('YYYY-MM') and year in review ('YYYY') — Phase 3. One calm scroll: the
 * headline numbers, a short coach note, the change against the period before, the days
 * trained, the records, the muscles worked and the favourite exercises. The arrows step to
 * the month (or year) before and after; the share button makes a picture of it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BarChart, HBarList } from '@/components/charts';
import { Badge, Card, EmptyState, GlassCard, HeroCard, Icon, IconButton, LoadError, Screen, SectionHeader, Skeleton, StatTile } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { fmtInt, trimNum } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, gradients, radius, space, type } from '@/theme/tokens';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { MonthGrid } from '@/tracker/components/MonthGrid';
import { ShareSheet } from '@/tracker/components/ShareSheet';
import { liftsBeatingBest, liftsUpText } from '@/tracker/engine/headline';
import { RECORD_LABEL } from '@/tracker/engine/records';
import { bigNumber, changeText, emptyReportText, timeText, type MonthReport, type YearReview } from '@/tracker/engine/reports';
import { setsText } from '@/tracker/engine/volume';
import { countWord } from '@/lib/words';
import { isMonthKey, monthName, monthOf, monthTitle, shiftMonth } from '@/tracker/lib/months';
import { recordValueText } from '@/tracker/services/recordText';
import { getMonthReport, getTrainedMonths, getYearReview, type MonthReportData } from '@/tracker/services/reportsService';
import { monthShareScene, yearShareScene } from '@/tracker/share/reportCard';

const INK_ON_EMBER = '#1F0D05';

type Loaded = { kind: 'month'; data: MonthReportData } | { kind: 'year'; data: YearReview };

function Hero({ big, label, line }: { big: string; label: string; line: string }) {
  return (
    <HeroCard gradient={gradients.ember}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: 'rgba(31,13,5,0.72)' }}>{label}</Text>
      <Text style={{ fontFamily: type.display, fontSize: type.size.hero, color: INK_ON_EMBER, marginTop: 2 }}>{big}</Text>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: 'rgba(31,13,5,0.72)', marginTop: 2 }}>{line}</Text>
    </HeroCard>
  );
}

function CoachNote({ text }: { text: string }) {
  return (
    <GlassCard>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Icon name="sparkle" size={20} color={color.accentBright} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, letterSpacing: 0.4, color: color.inkMuted, marginBottom: 3 }}>COACH</Text>
          <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.ink, lineHeight: 21 }}>{text}</Text>
        </View>
      </View>
    </GlassCard>
  );
}

function Muscles({ muscles }: { muscles: MonthReport['muscles'] }) {
  const top = muscles.filter((m) => m.muscle !== 'cardio').slice(0, 6);
  if (top.length === 0) return null;
  return (
    <View>
      <SectionHeader title="Sets per muscle" />
      <Card>
        <HBarList data={top.map((m) => ({ label: MUSCLE_LABEL[m.muscle], value: m.sets }))} valueFormat={(n) => setsText(n)} />
      </Card>
    </View>
  );
}

function Favourites({ items }: { items: MonthReport['topExercises'] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <SectionHeader title="Most trained" />
      <Card style={{ gap: space.sm }}>
        {items.map((e, i) => (
          <View key={e.exerciseId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text style={{ width: 18, fontFamily: type.monoBold, fontSize: type.size.sub, color: color.accent }}>{i + 1}</Text>
            <Text numberOfLines={2} style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
              {e.name}
            </Text>
            <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkSecondary }}>
              {setsText(e.sets)} · {countWord(e.workouts, 'workout')}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

function BodyweightLine({ change }: { change: MonthReport['bodyweight'] }) {
  const units = useUnits(); // v0.27.0: kg or lb
  if (!change) return null;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Icon name="scale" size={20} color={color.accent} />
      <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>Body weight</Text>
      <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>
        {trimNum(kgToShown(change.start, units))} → {trimNum(kgToShown(change.end, units))} {weightUnitOf(units)}
      </Text>
      <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted }}>
        ({change.change > 0 ? '+' : change.change < 0 ? '−' : ''}
        {trimNum(Math.abs(kgToShown(change.change, units)))})
      </Text>
    </Card>
  );
}

function MonthBody({ data, today }: { data: MonthReportData; today: string }) {
  const units = useUnits(); // v0.27.0: kg or lb
  const wu = weightUnitOf(units);
  const r = data.report;
  const t = r.totals;
  const prevName = monthName(shiftMonth(r.month, -1));
  if (t.workouts === 0) {
    const e = emptyReportText('month', r.complete, monthName(r.month));
    return <EmptyState icon="calendar" title={e.title} body={e.body} />;
  }
  return (
    <View style={{ gap: space.lg }}>
      <Hero
        big={`${t.workouts} ${t.workouts === 1 ? 'workout' : 'workouts'}`}
        label={r.complete ? monthTitle(r.month) : `${monthName(r.month)} so far`}
        line={`${timeText(t)} · ${fmtInt(kgToShown(t.volumeKg, units))} ${wu} · ${setsText(t.sets)}`}
      />
      <CoachNote text={r.note} />
      {r.previous && r.complete ? (
        <View>
          <SectionHeader title={`Against ${prevName}`} />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <StatTile label="Workouts" value={t.workouts} delta={changeText(t.workouts, r.previous.workouts, 'count') ?? undefined} />
            </View>
            <View style={{ flex: 1 }}>
              {/* PG-22: the same full number as the line above — never "228.3k" beside "2,28,288". */}
              <StatTile label="Volume" value={fmtInt(kgToShown(t.volumeKg, units))} unit={wu} delta={changeText(t.volumeKg, r.previous.volumeKg, 'pct') ?? undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <StatTile label="Sets" value={t.sets} delta={changeText(t.sets, r.previous.sets, 'count') ?? undefined} />
            </View>
          </View>
        </View>
      ) : null}
      <View>
        <SectionHeader title={`Days you trained · ${r.trainedDays.length}`} />
        <Card>
          <MonthGrid month={r.month} trained={r.trainedDays} today={today} />
        </Card>
      </View>
      <View>
        {/* D10: the total counts LIFTS; every record each one set is listed below. */}
        <SectionHeader title={data.records.length === 0 ? 'New records' : liftsUpText(liftsBeatingBest(data.records))} />
        <Card style={{ gap: space.md }}>
          {data.records.length === 0 ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>No new records this month.</Text>
          ) : (
            data.records.slice(0, 5).map((rec, i) => (
              <View key={`${rec.exerciseId}-${rec.kind}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={2} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                    {rec.exerciseName}
                  </Text>
                  <View style={{ flexDirection: 'row' }}>
                    <Badge label={RECORD_LABEL[rec.kind]} tone="accent" />
                  </View>
                </View>
                <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>{recordValueText(rec, rec.info)}</Text>
              </View>
            ))
          )}
          {data.records.length > 5 ? (
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
              and {data.records.length - 5} more
            </Text>
          ) : null}
        </Card>
      </View>
      <Muscles muscles={r.muscles} />
      <Favourites items={r.topExercises} />
      <BodyweightLine change={r.bodyweight} />
    </View>
  );
}

function YearBody({ y }: { y: YearReview }) {
  const units = useUnits(); // v0.27.0: kg or lb
  const wu = weightUnitOf(units);
  const t = y.totals;
  if (t.workouts === 0) {
    const e = emptyReportText('year', y.complete, String(y.year));
    return <EmptyState icon="calendar" title={e.title} body={e.body} />;
  }
  const bars = y.byMonth.map((m) => ({ x: monthName(m.month).slice(0, 3), y: m.workouts }));
  return (
    <View style={{ gap: space.lg }}>
      <Hero
        big={`${fmtInt(t.workouts)} ${t.workouts === 1 ? 'workout' : 'workouts'}`}
        label={y.complete ? `${y.year} in review` : `${y.year} so far`}
        line={`${timeText(t)} · ${bigNumber(Math.round(kgToShown(t.volumeKg, units)))} ${wu} · ${setsText(t.sets)}`}
      />
      <CoachNote text={y.note} />
      <View>
        <SectionHeader title="Workouts each month" />
        <Card>
          <BarChart data={bars} height={150} yFormat={(n) => `${Math.round(n)}`} labelEvery={bars.length > 6 ? 2 : 1} />
        </Card>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Days trained" value={t.days} icon="calendar" />
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Longest streak" value={y.longestStreakWeeks} unit={y.longestStreakWeeks === 1 ? 'week' : 'weeks'} icon="flame" />
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Lifts up" value={y.recordCount} icon="trophy" />
        </View>
        <View style={{ flexBasis: '47%', flexGrow: 1 }}>
          <StatTile label="Busiest month" value={y.busiest ? monthName(y.busiest.month).slice(0, 3) : '—'} icon="zap" />
        </View>
      </View>
      {y.gain ? (
        <Card style={{ gap: 4 }}>
          <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Biggest gain</Text>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
            {y.gain.name} · up {y.gain.pct}%
          </Text>
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
            Estimated 1-rep max about {Math.round(kgToShown(y.gain.fromKg, units))} → {Math.round(kgToShown(y.gain.toKg, units))} {wu}
          </Text>
        </Card>
      ) : null}
      <Favourites items={y.topExercises} />
      <Muscles muscles={y.muscles} />
      <BodyweightLine change={y.bodyweight} />
    </View>
  );
}

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string | string[] }>();
  const raw = typeof params.period === 'string' ? params.period : params.period?.[0] ?? '';
  const today = todayISO();
  const isYear = /^\d{4}$/.test(raw);
  const period = isYear || isMonthKey(raw) ? raw : monthOf(today);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  // PG-23: Try again really re-reads (it used to say "Go back and try again").
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setFailed(false);
    const job: Promise<Loaded> = isYear
      ? getYearReview(Number(period), today).then((data) => ({ kind: 'year' as const, data }))
      : getMonthReport(period, today).then((data) => ({ kind: 'month' as const, data }));
    job
      .then((l) => {
        if (alive) setLoaded(l);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    getTrainedMonths()
      .then((m) => {
        if (alive) setFirst(m.length > 0 ? m[m.length - 1] : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [period, isYear, today, attempt]);

  const thisMonth = monthOf(today);
  const prev = isYear ? String(Number(period) - 1) : shiftMonth(period, -1);
  const next = isYear ? String(Number(period) + 1) : shiftMonth(period, 1);
  const canPrev = first != null && (isYear ? Number(prev) >= Number(first.slice(0, 4)) : prev >= first);
  const canNext = isYear ? Number(next) <= Number(today.slice(0, 4)) : next <= thisMonth;
  const go = (p: string) => router.setParams({ period: p });

  const title = isYear ? (Number(period) < Number(today.slice(0, 4)) ? `${period} in review` : `${period} so far`) : monthTitle(period);
  const scene =
    loaded?.kind === 'month' && loaded.data.report.totals.workouts > 0
      ? monthShareScene(loaded.data.report, liftsBeatingBest(loaded.data.records))
      : loaded?.kind === 'year' && loaded.data.totals.workouts > 0
        ? yearShareScene(loaded.data)
        : null;

  return (
    <Screen
      title={title}
      subtitle={isYear ? 'Year in review' : 'Monthly report'}
      right={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {scene ? <IconButton icon="send" onPress={() => setSharing(true)} accessibilityLabel="Share as a picture" /> : null}
          <IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg }}>
        <Pressable
          onPress={() => canPrev && go(prev)}
          disabled={!canPrev}
          accessibilityRole="button"
          accessibilityLabel={isYear ? `Previous year, ${prev}` : `Previous month, ${monthTitle(prev)}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: canPrev ? 1 : 0.3, padding: space.xs }}
        >
          <Icon name="chevron-left" size={18} color={color.accent} />
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{isYear ? prev : monthName(prev)}</Text>
        </Pressable>
        <Pressable
          onPress={() => canNext && go(next)}
          disabled={!canNext}
          accessibilityRole="button"
          accessibilityLabel={isYear ? `Next year, ${next}` : `Next month, ${monthTitle(next)}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: canNext ? 1 : 0.3, padding: space.xs }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{isYear ? next : monthName(next)}</Text>
          <Icon name="chevron-right" size={18} color={color.accent} />
        </Pressable>
      </View>

      {failed ? (
        <LoadError what="this report" onRetry={() => setAttempt((n) => n + 1)} />
      ) : !loaded ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={130} radius={radius.xl} />
          <Skeleton width="100%" height={90} radius={radius.lg} />
          <Skeleton width="100%" height={220} radius={radius.lg} />
        </View>
      ) : loaded.kind === 'month' ? (
        <MonthBody data={loaded.data} today={today} />
      ) : (
        <YearBody y={loaded.data} />
      )}

      {scene ? <ShareSheet visible={sharing} scene={scene} fileName={`forgeai-${period}`} onClose={() => setSharing(false)} /> : null}
    </Screen>
  );
}
