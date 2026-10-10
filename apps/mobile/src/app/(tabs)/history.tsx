/**
 * History tab (Phase 3 packet C — HI-01): every workout ever logged, however many.
 *
 *  - List: an endless list (30 at a time as the member scrolls), grouped by month under a
 *    sticky heading with the month's count ("October 2026 · 12 workouts").
 *  - Calendar: one month at a time back to the first workout; a dot on each day trained; tap a
 *    day to see its workouts.
 *  - Search: by exercise or workout name, across ALL history.
 *  - "+ Log a past workout": the day, start and length, then the normal editor.
 *
 * Coming back to the tab re-reads quietly what is already on screen (an edit or a delete shows
 * at once) without jumping back to the top. Audit Phase 8 (five years of data): with nothing
 * saved since (and the same day), the list stays exactly as it was — no read at all. The list's
 * stamp is kept only when the whole read worked (the streak and the 13-week squares too) and no
 * queued write ran during it, so a failed part or a rolled-back write is read again next visit.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { quietSince, writeQueueMark } from '@/db/writeQueue';

import { Heatmap } from '@/components/charts';
import { Card, EmptyState, GhostButton, Icon, LoadError, Screen, SectionHeader, Skeleton, StatTile } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { dateWithYear, monthTitle, todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { streakText } from '@/lib/streak';
import { color, radius, space, type } from '@/theme/tokens';
import type { ConsistencyCell } from '@/types/models';

import { LogPastSheet, type PastWorkoutChoice } from '@/tracker/components/LogPastSheet';
import { MonthCalendar } from '@/tracker/components/MonthCalendar';
import { WorkoutCard } from '@/tracker/components/WorkoutCard';
import { getWeekStreak } from '@/tracker/services/history';
import type { WeekStreak } from '@/tracker/services/history';
import {
  HISTORY_PAGE,
  getFirstWorkoutDate,
  getHistoryOnDay,
  getHistoryPage,
  getHistoryUpTo,
  getMonthCounts,
  getWorkoutDays,
  historyRows,
  historyStamp,
  monthHeadingIndexes,
  type HistoryCursor,
  type HistoryItem,
  type HistoryRow,
} from '@/tracker/services/historyFeed';
import { getConsistencyCells } from '@/tracker/services/volumeService';
import { askAboutOpenWorkout, openActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

const CAL_WEEKS = 13;
const SEARCH_PAUSE_MS = 250;

type Mode = 'list' | 'calendar';
type Status = 'loading' | 'error' | 'ready';

const workoutsWord = (n: number): string => (n === 1 ? '1 workout' : `${fmtInt(n)} workouts`);

export default function HistoryScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('list');
  const [past, setPast] = useState(false);

  // ------------------------------------------------ the list (and search)
  const [queryText, setQueryText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryText.trim()), SEARCH_PAUSE_MS);
    return () => clearTimeout(t);
  }, [queryText]);

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [next, setNext] = useState<HistoryCursor | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  const [streak, setStreak] = useState<WeekStreak | null>(null);
  const [cells, setCells] = useState<ConsistencyCell[]>([]);
  const [firstDay, setFirstDay] = useState<string | null>(null);
  // A newer read (another search, a refocus) makes older answers stale.
  const gen = useRef(0);
  const loaded = useRef(0);
  loaded.current = items.length;
  // Audit Phase 8: what the list on screen was read at (`historyStamp` + the search), so coming
  // back with nothing changed reads nothing.
  const shownAt = useRef<string | null>(null);

  /**
   * Read the first `keep` workouts again (at least a page) — quietly when something is shown.
   * True when the list on screen was replaced.
   */
  const refresh = useCallback(async (q: string, keep: number, quiet: boolean, known?: string | null): Promise<boolean> => {
    const mine = ++gen.current;
    if (!quiet) setStatus('loading');
    shownAt.current = null;
    // A queued write (import, Finish, edit) running during the read: its rows may roll back.
    const mark = writeQueueMark();
    // Taken BEFORE the read: a save during the read is read again on the next visit.
    const stamp = known !== undefined ? known : await historyStamp().catch(() => null);
    const at = stamp == null ? null : `${stamp}|${q}`;
    try {
      const [page, monthCounts, allCounts, first] = await Promise.all([
        // Everything already shown is read again (in pages), so the list never shrinks and jumps.
        getHistoryUpTo({ query: q, keep: Math.max(HISTORY_PAGE, keep) }),
        getMonthCounts(q),
        q ? getMonthCounts(null) : Promise.resolve(null),
        getFirstWorkoutDate(),
      ]);
      if (mine !== gen.current) return false;
      setItems(page.items);
      setNext(page.next);
      setCounts(monthCounts);
      const all = allCounts ?? monthCounts;
      setTotal(Object.values(all).reduce((a, b) => a + b, 0));
      setFirstDay(first);
      setMore('idle');
      setStatus('ready');
      // The search's list is all there is to it; the full list also waits for its extras.
      if (q && quietSince(mark)) shownAt.current = at;
    } catch {
      if (mine !== gen.current) return false;
      // HI-11: a failed read never says "No workouts yet" — keep what is shown, else say so.
      setStatus((s) => (quiet && s === 'ready' ? s : 'error'));
      return false;
    }
    // The extras never blank the list. Either failing leaves the list unmarked: read again next visit.
    if (!q) {
      let failed = false;
      void Promise.all([
        getWeekStreak()
          .then((s) => mine === gen.current && setStreak(s))
          .catch(() => {
            failed = true;
          }),
        getConsistencyCells(CAL_WEEKS * 7)
          .then((c) => mine === gen.current && setCells(c))
          .catch(() => {
            failed = true;
          }),
      ]).then(() => {
        if (mine === gen.current && !failed && quietSince(mark)) shownAt.current = at;
      });
    }
    return true;
  }, []);

  // A new search starts from the top.
  const queryRef = useRef(query);
  queryRef.current = query;
  const firstQuery = useRef(true);
  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    void refresh(query, 0, false);
  }, [query, refresh]);

  // Focus (first open, back from a workout, an edit or a delete): nothing saved since → keep the
  // list as it is; else re-read everything shown (quietly when something is shown), so the list
  // never shrinks and the scroll position stays where the member left it.
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const stamp = await historyStamp().catch(() => null);
        const q = queryRef.current;
        const shown = loaded.current;
        if (shown > 0 && stamp != null && shownAt.current === `${stamp}|${q}`) return;
        await refresh(q, shown, shown > 0, stamp);
      })();
    }, [refresh]),
  );

  const loadMore = useCallback(async (): Promise<void> => {
    if (!next || more === 'loading') return;
    const mine = gen.current;
    setMore('loading');
    try {
      const page = await getHistoryPage({ query: queryRef.current, after: next });
      if (mine !== gen.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...page.items.filter((x) => !seen.has(x.id))];
      });
      setNext(page.next);
      setMore('idle');
    } catch {
      if (mine === gen.current) setMore('error');
    }
  }, [next, more]);

  const rows = useMemo(() => historyRows(items, counts), [items, counts]);
  // +1: the list's header is the first child of the scroll view.
  const sticky = useMemo(() => monthHeadingIndexes(rows).map((i) => i + 1), [rows]);

  // ------------------------------------------------ the calendar
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [day, setDay] = useState<string | null>(null);
  const [dayItems, setDayItems] = useState<HistoryItem[] | null>(null);
  const [calError, setCalError] = useState(false);
  const loadMonth = useCallback(async (m: string) => {
    setCalError(false);
    try {
      setMarks(await getWorkoutDays(m));
    } catch {
      setCalError(true);
    }
  }, []);
  useEffect(() => {
    if (mode === 'calendar') void loadMonth(ym);
  }, [mode, ym, loadMonth]);
  const loadDay = useCallback(async (d: string) => {
    setDay(d);
    setDayItems(null);
    try {
      setDayItems(await getHistoryOnDay(d));
    } catch {
      setDayItems([]);
      setCalError(true);
    }
  }, []);
  // Coming back to the tab re-reads the month and day on screen. Read through refs: with `ym` /
  // `day` as dependencies, every day tap or month change re-ran this effect while focused — a
  // second read on top of the tap's own (the month's own effect reads it), and the day's list flashing back to its skeleton.
  const ymRef = useRef(ym);
  ymRef.current = ym;
  const dayRef = useRef(day);
  dayRef.current = day;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useFocusEffect(
    useCallback(() => {
      if (modeRef.current !== 'calendar') return;
      void loadMonth(ymRef.current);
      if (dayRef.current) void loadDay(dayRef.current);
    }, [loadMonth, loadDay]),
  );

  // ------------------------------------------------ log a past workout
  const startPast = async (c: PastWorkoutChoice): Promise<string | null> => {
    // A workout already open is never a dead end: Resume it, or discard it and log this one.
    const open = await askAboutOpenWorkout({ startLabel: 'Discard it and log the past one' });
    if (open === 'resume') {
      setPast(false);
      openActiveWorkout(router);
      return null;
    }
    const why = useActiveWorkout.getState().startPastWorkout(c);
    if (why) return why;
    setPast(false);
    openActiveWorkout(router);
    return null;
  };

  const open = useCallback((id: string) => router.push({ pathname: '/session/[id]', params: { id } }), [router]);

  // ------------------------------------------------ pieces
  const toggle = (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      {(['list', 'calendar'] as const).map((m) => {
        const on = mode === m;
        return (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? color.surfaceRaised : 'transparent',
              borderWidth: on ? 1 : 0,
              borderColor: color.borderStrong,
            }}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: on ? color.ink : color.inkSecondary }}>
              {m === 'list' ? 'List' : 'Calendar'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const logPast = <GhostButton label="Log a past workout" icon="plus" onPress={() => setPast(true)} />;

  const search = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        height: 48,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Icon name="search" size={16} color={color.inkMuted} />
      <TextInput
        value={queryText}
        onChangeText={setQueryText}
        placeholder="Search by exercise or workout name"
        placeholderTextColor={color.inkMuted}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search your workouts by exercise or workout name"
        style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink, paddingVertical: 0 }}
      />
      {queryText ? (
        <Pressable
          onPress={() => setQueryText('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="close" size={16} color={color.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  const searching = query.length > 0;
  const subtitle = total > 0 ? `${workoutsWord(total)}${firstDay ? ` since ${monthTitle(firstDay.slice(0, 7))}` : ''}` : 'Every workout you log.';

  const listHeader = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      {toggle}
      {logPast}
      {search}
      {!searching && streak ? (
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            {/* D9: the app's one streak (weeks in a row, lib/streak) and its one label. */}
            <StatTile label="Streak" value={streakText(streak.weeks)} icon="flame" />
          </View>
          <View style={{ flex: 1 }}>
            <StatTile label="Rest days" value={streak.restDays} icon="calendar" />
          </View>
        </View>
      ) : null}
      {!searching && cells.length > 0 ? (
        <View>
          <SectionHeader title="Last 13 weeks" />
          <Card>
            <Heatmap cells={cells} weeks={CAL_WEEKS} />
          </Card>
        </View>
      ) : null}
      {searching && status === 'ready' ? (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
          {items.length === 0 ? `No workouts match “${query}”.` : `${workoutsWord(Object.values(counts).reduce((a, b) => a + b, 0))} match “${query}”.`}
        </Text>
      ) : null}
    </View>
  );

  const renderRow = useCallback(
    ({ item }: { item: HistoryRow }) =>
      item.kind === 'month' ? (
        <View style={{ backgroundColor: color.bg, paddingVertical: space.sm }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>
            {monthTitle(item.ym)} · {workoutsWord(item.count)}
          </Text>
        </View>
      ) : (
        <View style={{ paddingBottom: space.md }}>
          <WorkoutCard session={item.item} onPress={() => open(item.item.id)} />
        </View>
      ),
    [open],
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
    ) : items.length > 0 && !next ? (
      <Text style={{ textAlign: 'center', paddingVertical: space.lg, fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
        {searching ? 'That’s every match.' : firstDay ? `That’s everything, back to ${dateWithYear(firstDay)}.` : 'That’s everything.'}
      </Text>
    ) : null;

  return (
    <Screen title="History" subtitle={subtitle} scroll={false}>
      {status === 'loading' && items.length === 0 ? (
        <View style={{ gap: space.md }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={88} radius={radius.lg} />
          ))}
        </View>
      ) : status === 'error' && items.length === 0 ? (
        <LoadError what="your workouts" onRetry={() => void refresh(queryRef.current, 0, false)} />
      ) : total === 0 && !searching ? (
        <View style={{ gap: space.lg }}>
          <EmptyState
            icon="dumbbell"
            title="No workouts yet"
            body="Head to the Workout tab and log your first one — or add one you did earlier."
          />
          {logPast}
        </View>
      ) : mode === 'list' ? (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          ListFooterComponent={footer}
          stickyHeaderIndices={sticky}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.6}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          windowSize={9}
          contentContainerStyle={{ paddingBottom: space.xxl }}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.lg, paddingBottom: space.xxl }}>
          {toggle}
          {logPast}
          <Card>
            <MonthCalendar
              ym={ym}
              onMonth={(m) => {
                setYm(m);
                setDay(null);
                setDayItems(null);
              }}
              firstYm={firstDay ? firstDay.slice(0, 7) : null}
              selected={day}
              onPick={(d) => void loadDay(d)}
              marks={marks}
            />
          </Card>
          {calError ? (
            <LoadError
              what="this month"
              onRetry={() => {
                void loadMonth(ym);
                if (day) void loadDay(day);
              }}
            />
          ) : null}
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
            {day
              ? dateWithYear(day)
              : `${monthTitle(ym)} · ${workoutsWord(Object.values(marks).reduce((a, b) => a + b, 0))}. Tap a day to see its workouts.`}
          </Text>
          {day ? (
            dayItems == null ? (
              <Skeleton width="100%" height={88} radius={radius.lg} />
            ) : dayItems.length === 0 ? (
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>No workout that day.</Text>
            ) : (
              <View style={{ gap: space.md }}>
                {dayItems.map((s) => (
                  <WorkoutCard key={s.id} session={s} onPress={() => open(s.id)} />
                ))}
              </View>
            )
          ) : null}
        </ScrollView>
      )}
      <LogPastSheet visible={past} onClose={() => setPast(false)} onStart={startPast} />
    </Screen>
  );
}
