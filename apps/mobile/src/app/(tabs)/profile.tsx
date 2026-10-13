/**
 * Profile tab — Hevy's Profile page (redesign R2, PLAN §3), top to bottom:
 *  1. the member's name as the title; pencil (Edit profile), share (this month's picture) and
 *     gear (Settings) top right;
 *  2. photo (or the first letter), full name, and Workouts · Weeks in a row · Records;
 *  3. bio and link, when set;
 *  4. the history chart — the range's total, Last 12 weeks / Last 12 months / All time, tap a bar,
 *     Duration · Kg lifted · Reps (Kg lifted the first time, then the last choice);
 *  5. Dashboard: Statistics · Exercises · Measures · Calendar;
 *  6. the Workouts feed, newest first, 30 at a time, a thin month line between months.
 *
 * Audit Phase 8 (years of data): coming back with nothing saved since (and the same day) reads
 * nothing; the chart keeps each range it read until the data changes.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from 'react-native';

import { GymBrandMark } from '@/components/GymBrandMark';
import { GhostButton, Icon, LoadError, Screen, Skeleton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { quietSince, writeQueueMark } from '@/db/writeQueue';
import { todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { readWithRetry } from '@/lib/retryRead';
import { tell } from '@/lib/tell';
import { useRereadWhenFailed } from '@/lib/useRereadWhenFailed';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';

import { ShareSheet } from '@/tracker/components/ShareSheet';
import { Glyph, type GlyphName } from '@/tracker/components/TrackerGlyph';
import { Avatar } from '@/tracker/components/profile/Avatar';
import { DashboardTiles, type DashboardTile } from '@/tracker/components/profile/DashboardTiles';
import { FeedCard } from '@/tracker/components/profile/FeedCard';
import { FeedMenu, type FeedMenuRequest } from '@/tracker/components/profile/FeedMenu';
import { HistoryChartCard } from '@/tracker/components/profile/HistoryChartCard';
import { linkLabel } from '@/tracker/db/profileExtras';
import { liftsBeatingBest } from '@/tracker/engine/headline';
import type { ChartBar, ChartRange } from '@/tracker/engine/historyChart';
import { monthOf } from '@/tracker/lib/months';
import { feedMonthLine, feedRows, type FeedRow } from '@/tracker/services/feedCard';
import { getMonthCounts, historyStamp, type HistoryCursor } from '@/tracker/services/historyFeed';
import {
  getFeedPage,
  getFeedUpTo,
  getHistoryChart,
  getProfileHeader,
  type FeedItem,
  type FeedThumb,
  type ProfileHeader,
} from '@/tracker/services/profileService';
import { getMonthReport } from '@/tracker/services/reportsService';
import type { Scene } from '@/tracker/share/scene';
import { monthShareScene } from '@/tracker/share/reportCard';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

type Row = FeedRow<{ id: string; dateISO: string; feed: FeedItem }>;

function HeaderButton({ glyph, icon, label, onPress }: { glyph?: GlyphName; icon?: 'settings'; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      {glyph ? <Glyph name={glyph} size={24} color={color.ink} /> : <Icon name={icon ?? 'settings'} size={24} color={color.ink} />}
    </Pressable>
  );
}

/**
 * One of the three numbers beside the photo (Hevy's Workouts · Followers · Following row). The
 * three always share ONE row in equal columns: at a large phone font size the label and number
 * shrink to fit instead of wrapping, so "Records" can never drop alone onto a second row
 * (owner's phone, 12 Oct 2026).
 */
function Stat({ label, value, unit, spoken }: { label: string; value: string; unit?: string; spoken?: string }) {
  return (
    <View accessible accessibilityLabel={spoken ?? `${label}: ${value}`} style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
        {label}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>
        {value}
        {unit ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const units = useUnits();
  const metric = useTrackerPrefs((s) => s.chartMetric);
  const range = useTrackerPrefs((s) => s.chartRange);
  const setMetric = useTrackerPrefs((s) => s.setChartMetric);
  const setRange = useTrackerPrefs((s) => s.setChartRange);
  const today = todayISO();

  const [header, setHeader] = useState<ProfileHeader | null>(null);
  const [headerFailed, setHeaderFailed] = useState(false);
  // The bars and the range they were read for: a new range shows no old bars under its name.
  const [chart, setChart] = useState<{ range: ChartRange; bars: ChartBar[] } | null>(null);
  const bars = chart && chart.range === range ? chart.bars : null;
  const [chartLoading, setChartLoading] = useState(true);
  const [chartFailed, setChartFailed] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, FeedThumb>>(new Map());
  const [next, setNext] = useState<HistoryCursor | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [feedStatus, setFeedStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  const [menu, setMenu] = useState<FeedMenuRequest | null>(null);
  const [monthScene, setMonthScene] = useState<{ scene: Scene; month: string } | null>(null);
  const [sharingMonth, setSharingMonth] = useState(false);

  // What the screen shows was read at this stamp (`historyStamp`); the chart keeps each range.
  const shownAt = useRef<string | null>(null);
  const chartCache = useRef(new Map<string, ChartBar[]>());
  const gen = useRef(0);
  const loaded = useRef(0);
  loaded.current = items.length;
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const loadChart = useCallback(async (r: ChartRange, stamp: string | null) => {
    const key = stamp == null ? null : `${stamp}|${r}`;
    const kept = key ? chartCache.current.get(key) : undefined;
    if (kept) {
      setChart({ range: r, bars: kept });
      setChartFailed(false);
      setChartLoading(false);
      return;
    }
    setChartLoading(true);
    try {
      // Phone test run 38144864717: a read that fails for a moment is tried again first.
      const b = await readWithRetry(() => getHistoryChart(r), { wanted: () => rangeRef.current === r });
      if (rangeRef.current !== r) return;
      if (key) chartCache.current.set(key, b);
      setChart({ range: r, bars: b });
      setChartFailed(false);
    } catch {
      if (rangeRef.current === r) setChartFailed(true);
    } finally {
      if (rangeRef.current === r) setChartLoading(false);
    }
  }, []);

  const loadAll = useCallback(
    async (stamp: string | null) => {
      const mine = ++gen.current;
      const mark = writeQueueMark();
      shownAt.current = null;
      if (stamp == null || !chartCache.current.has(`${stamp}|${rangeRef.current}`)) chartCache.current.clear();
      let ok = true;
      const retry = { wanted: () => mine === gen.current };
      await Promise.all([
        readWithRetry(getProfileHeader, retry)
          .then((h) => {
            if (mine !== gen.current) return;
            setHeader(h);
            setHeaderFailed(false);
          })
          .catch(() => {
            ok = false;
            if (mine === gen.current) setHeaderFailed(true);
          }),
        loadChart(rangeRef.current, stamp),
        readWithRetry(() => Promise.all([getFeedUpTo(loaded.current), getMonthCounts(null)]), retry)
          .then(([page, c]) => {
            if (mine !== gen.current) return;
            setItems(page.items);
            setThumbs(page.thumbs);
            setNext(page.next);
            setCounts(c);
            setMore('idle');
            setFeedStatus('ready');
          })
          .catch(() => {
            ok = false;
            if (mine === gen.current) setFeedStatus((s) => (s === 'ready' ? s : 'error'));
          }),
      ]);
      // A failed part, or a save while reading, is read again on the next visit.
      if (mine === gen.current && ok && quietSince(mark)) shownAt.current = stamp;
    },
    [loadChart],
  );

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const stamp = await historyStamp().catch(() => null);
        if (stamp != null && shownAt.current === stamp) {
          // Review fix: the workouts did not change, but Edit profile may have (name, photo, bio,
          // link are not workouts): the header is one small read, so it is read on every visit.
          void getProfileHeader()
            .then((h) => setHeader(h))
            .catch(() => undefined);
          return;
        }
        await loadAll(stamp);
      })();
    }, [loadAll]),
  );

  // A part still failed after its retries: read again when the app is back in front or after
  // the next save (not only on a tap on Try again).
  useRereadWhenFailed(headerFailed || chartFailed || feedStatus === 'error', () => void loadAll(null));

  const pickRange = (r: ChartRange): void => {
    setRange(r);
    rangeRef.current = r;
    void historyStamp()
      .catch(() => null)
      .then((stamp) => loadChart(r, stamp));
  };

  const loadMore = useCallback(async (): Promise<void> => {
    if (!next || more === 'loading') return;
    const mine = gen.current;
    setMore('loading');
    try {
      const page = await getFeedPage(next);
      if (mine !== gen.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.item.id));
        return [...prev, ...page.items.filter((x) => !seen.has(x.item.id))];
      });
      setThumbs((prev) => new Map([...prev, ...page.thumbs]));
      setNext(page.next);
      setMore('idle');
    } catch {
      if (mine === gen.current) setMore('error');
    }
  }, [next, more]);

  const rows: Row[] = useMemo(
    () => feedRows(items.map((f) => ({ id: f.item.id, dateISO: f.item.dateISO, feed: f })), counts),
    [items, counts],
  );

  const onTile = (t: DashboardTile): void => {
    // Hevy's Dashboard: Statistics, Exercises, Measures, Calendar (R3; Exercises gets its own
    // screen in R5 — until then the exercise library).
    if (t === 'statistics') router.push('/stats');
    else if (t === 'exercises') router.push('/exercises');
    else if (t === 'measures') router.push('/measures');
    else router.push('/calendar');
  };

  const shareBusy = useRef(false);
  const onShareMonth = (): void => {
    if (shareBusy.current) return;
    shareBusy.current = true;
    const month = monthOf(todayISO());
    getMonthReport(month)
      .then(({ report, records }) => {
        setMonthScene({ scene: monthShareScene(report, liftsBeatingBest(records)), month });
        setSharingMonth(true);
      })
      .catch(() => void tell('Could not make the picture', 'Something went wrong. Please try again.'))
      .finally(() => {
        shareBusy.current = false;
      });
  };

  const openWorkout = useCallback((id: string) => router.push({ pathname: '/session/[id]', params: { id } }), [router]);
  const onMore = useCallback((id: string) => setMenu({ id, mode: 'menu' }), []);
  const onShare = useCallback((id: string) => setMenu({ id, mode: 'share' }), []);

  const name = header?.name?.trim() || 'Profile';
  const photo = header?.photoUri ?? null;

  const top = (
    <View style={{ gap: space.xl, paddingBottom: space.md }}>
      {/* Gym branding: the member's gym, small, under the title (branded gyms only). */}
      <GymBrandMark />
      {header ? (
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <Avatar uri={photo} name={name} size={76} />
            <View style={{ flex: 1, minWidth: 0, gap: space.sm }}>
              <Text numberOfLines={1} style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{name}</Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Stat label="Workouts" value={fmtInt(header.workouts)} />
                <Stat label="Streak" value={fmtInt(header.weeksInARow)} unit={header.weeksInARow === 1 ? 'week' : 'weeks'} spoken={`Weeks in a row: ${fmtInt(header.weeksInARow)}`} />
                <Stat label="Records" value={fmtInt(header.records)} />
              </View>
            </View>
          </View>
          {header.bio ? <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 21, color: color.ink }}>{header.bio}</Text> : null}
          {header.link ? (
            <Pressable
              onPress={() => {
                const link = header.link as string;
                Linking.openURL(link).catch(() => void tell('Couldn’t open the link', 'Check it in Edit profile.'));
              }}
              accessibilityRole="link"
              accessibilityLabel={`Open ${linkLabel(header.link)}`}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.accent }}>{linkLabel(header.link)}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : headerFailed ? (
        <LoadError compact what="your profile" onRetry={() => void loadAll(null)} />
      ) : (
        <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
          <Skeleton width={84} height={84} radius={42} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Skeleton width="60%" height={18} radius={radius.sm} />
            <Skeleton width="100%" height={36} radius={radius.sm} />
          </View>
        </View>
      )}

      <HistoryChartCard
        bars={bars}
        metric={metric}
        range={range}
        units={units}
        today={today}
        loading={chartLoading}
        failed={chartFailed}
        workoutsEver={header ? header.workouts : null}
        onMetric={setMetric}
        onRange={pickRange}
        onRetry={() => void historyStamp().catch(() => null).then((stamp) => loadChart(rangeRef.current, stamp))}
      />

      <DashboardTiles onOpen={onTile} />

      {/* 12 Oct 2026: no "Workouts" heading over the feed — the first month line ("October ·
          12 workouts") already heads it, and the two stacked with a gap. */}
      {feedStatus === 'loading' && items.length === 0 ? (
        <View style={{ gap: space.md }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} width="100%" height={160} radius={radius.lg} />
          ))}
        </View>
      ) : feedStatus === 'error' && items.length === 0 ? (
        <LoadError compact what="your workouts" onRetry={() => void loadAll(null)} />
      ) : feedStatus === 'ready' && items.length === 0 ? (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>
          No workouts yet. Each one you finish shows here.
        </Text>
      ) : null}
    </View>
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'month' ? (
        <View style={{ paddingTop: space.lg, paddingBottom: space.xs, borderBottomWidth: 1, borderBottomColor: color.border }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>
            {feedMonthLine(item.ym, item.count, todayISO())}
          </Text>
        </View>
      ) : (
        <FeedCard
          feed={item.item.feed}
          thumbs={thumbs}
          name={name}
          photoUri={photo}
          units={units}
          onOpen={openWorkout}
          onMore={onMore}
          onShare={onShare}
        />
      ),
    [thumbs, name, photo, units, openWorkout, onMore, onShare],
  );

  const footer =
    more === 'loading' ? (
      <View style={{ paddingVertical: space.lg }}>
        <ActivityIndicator color={color.accent} />
      </View>
    ) : more === 'error' ? (
      <View style={{ paddingVertical: space.lg, gap: space.sm }}>
        <InlineError message="Couldn't load older workouts." />
        <GhostButton label="Try again" onPress={() => void loadMore()} />
      </View>
    ) : null;

  return (
    <Screen
      // The tab's own name, short enough never to wrap; the member's name shows once, beside the
      // photo (it showed twice, and a long name broke the title onto two lines and left the
      // three buttons floating — owner's phone, 12 Oct 2026).
      title="Profile"
      scroll={false}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <HeaderButton glyph="pencil" label="Edit profile" onPress={() => router.push('/edit-profile')} />
          <HeaderButton glyph="share" label="Share this month as a picture" onPress={onShareMonth} />
          <HeaderButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
        </View>
      }
    >
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        ListHeaderComponent={top}
        ListFooterComponent={footer}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: space.xxl }}
      />
      <FeedMenu
        request={menu}
        onClose={() => setMenu(null)}
        onDeleted={() => void historyStamp().catch(() => null).then((stamp) => loadAll(stamp))}
      />
      {monthScene ? (
        <ShareSheet
          visible={sharingMonth}
          scene={monthScene.scene}
          fileName={`forgeai-month-${monthScene.month}`}
          onClose={() => setSharingMonth(false)}
        />
      ) : null}
    </Screen>
  );
}
