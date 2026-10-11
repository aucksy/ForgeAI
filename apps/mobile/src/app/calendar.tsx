/**
 * Calendar (R3, PLAN §4.4 — Hevy's Calendar), opened from Profile's Dashboard tile.
 *   Streak and Rest days at the top · every month back to the first workout, workout days filled ·
 *   tap a day → its workout (one opens straight away; more are listed) · "Log a past workout" ·
 *   the search icon (top right) searches every workout, as History's box did · a Year view of
 *   12 small months.
 * Reuses History's reads (streak, search, a day's workouts) and its past-workout sheet.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { leavePage } from '@/components/stats/parts';
import { EmptyState, GhostButton, Icon, IconButton, LoadError, Screen, Sheet, Skeleton, StatTile } from '@/components/ui';
import { dateWithYear, todayISO } from '@/lib/date';
import { streakText } from '@/lib/streak';
import { useLoad } from '@/lib/useLoad';
import { color, radius, space, type } from '@/theme/tokens';
import { LogPastSheet, type PastWorkoutChoice } from '@/tracker/components/LogPastSheet';
import { WorkoutCard } from '@/tracker/components/WorkoutCard';
import { calendarMonths, calendarYears, dayISO, dayTap, monthTotal, monthWeeks, workoutsLine, yearTotal } from '@/tracker/lib/calendarView';
import { monthName, monthTitle } from '@/tracker/lib/months';
import { getAllWorkoutDays } from '@/tracker/services/calendarService';
import { getWeekStreak } from '@/tracker/services/history';
import { getFirstWorkoutDate, getHistoryOnDay, getHistoryPage, type HistoryCursor, type HistoryItem } from '@/tracker/services/historyFeed';
import { askAboutOpenWorkout, openActiveWorkout } from '@/tracker/services/workoutStart';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

type View_ = 'month' | 'year';
const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SEARCH_PAUSE_MS = 250;

export default function CalendarScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<View_>('month');
  const [searching, setSearching] = useState(false);
  const [past, setPast] = useState(false);
  const [dayOpen, setDayOpen] = useState<{ day: string; items: HistoryItem[] | null } | null>(null);
  const list = useRef<FlatList<string>>(null);

  const data = useLoad(
    async () => {
      const [days, first, streak] = await Promise.all([getAllWorkoutDays(), getFirstWorkoutDate(), getWeekStreak()]);
      return { days, first, streak, today: todayISO() };
    },
    [],
    { onFocus: true },
  );
  const today = data.data?.today ?? todayISO();
  const months = calendarMonths(data.data?.first ?? null, today);
  const years = calendarYears(data.data?.first ?? null, today);
  const [year, setYear] = useState(Number(today.slice(0, 4)));

  const openSession = useCallback((id: string) => router.push({ pathname: '/session/[id]', params: { id } }), [router]);

  const onDay = useCallback(
    async (day: string, count: number) => {
      const what = dayTap(count);
      if (what === 'none') return;
      setDayOpen({ day, items: null });
      const items = await getHistoryOnDay(day).catch(() => [] as HistoryItem[]);
      if (what === 'open' && items.length === 1) {
        setDayOpen(null);
        openSession(items[0].id);
        return;
      }
      setDayOpen({ day, items });
    },
    [openSession],
  );

  const startPast = async (c: PastWorkoutChoice): Promise<string | null> => {
    // As on History: a workout already open is never a dead end.
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

  const jumpToMonth = (ym: string) => {
    setMode('month');
    const at = months.indexOf(ym);
    if (at >= 0) setTimeout(() => list.current?.scrollToIndex({ index: at, animated: false }), 60);
  };

  const days = data.data?.days ?? {};

  const top = (
    <View style={{ gap: space.lg, paddingBottom: space.lg, paddingHorizontal: space.screenX }}>
      {data.data ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          <View style={{ flexGrow: 1, flexBasis: '45%', minWidth: 150 }}>
            {/* D9: the app's one streak (weeks in a row) and its one label. */}
            <StatTile label="Streak" value={streakText(data.data.streak.weeks)} icon="flame" />
          </View>
          <View style={{ flexGrow: 1, flexBasis: '45%', minWidth: 150 }}>
            <StatTile label="Rest days" value={data.data.streak.restDays} icon="calendar" />
          </View>
        </View>
      ) : null}
      <Toggle mode={mode} onMode={setMode} />
      <GhostButton label="Log a past workout" icon="plus" onPress={() => setPast(true)} />
    </View>
  );

  const content = (() => {
    if (searching) return <SearchPanel onOpen={openSession} />;
    if (data.state === 'error') {
      return (
        <View style={{ paddingHorizontal: space.screenX }}>
          <LoadError what="your calendar" onRetry={data.retry} />
        </View>
      );
    }
    if (!data.data) {
      return (
        <View style={{ gap: space.md, paddingHorizontal: space.screenX }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} width="100%" height={260} radius={radius.lg} />
          ))}
        </View>
      );
    }
    if (mode === 'year') {
      return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
          {top}
          <YearView year={year} years={years} days={days} today={today} onYear={setYear} onMonth={jumpToMonth} />
        </ScrollView>
      );
    }
    return (
      <FlatList
        ref={list}
        data={months}
        keyExtractor={(m) => m}
        ListHeaderComponent={top}
        renderItem={({ item }) => <MonthBlock ym={item} days={days} today={today} onDay={onDay} />}
        initialNumToRender={3}
        windowSize={5}
        onScrollToIndexFailed={(e) => setTimeout(() => list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: false }), 50)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListFooterComponent={
          <Text style={{ textAlign: 'center', paddingVertical: space.lg, fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {data.data.first ? `Back to your first workout, ${dateWithYear(data.data.first)}.` : 'Workouts you log show on these days.'}
          </Text>
        }
      />
    );
  })();

  return (
    <Screen
      title={searching ? 'Search workouts' : 'Calendar'}
      onBack={() => (searching ? setSearching(false) : leavePage(router))}
      right={
        <IconButton
          icon={searching ? 'close' : 'search'}
          onPress={() => setSearching((s) => !s)}
          accessibilityLabel={searching ? 'Close search' : 'Search workouts'}
        />
      }
      scroll={false}
      noPad
    >
      {content}
      <LogPastSheet visible={past} onClose={() => setPast(false)} onStart={startPast} />
      <Sheet
        visible={dayOpen != null}
        title={dayOpen ? dateWithYear(dayOpen.day) : ''}
        subtitle={dayOpen?.items ? workoutsLine(dayOpen.items.length) : undefined}
        onClose={() => setDayOpen(null)}
      >
        {dayOpen?.items == null ? (
          <ActivityIndicator color={color.accent} />
        ) : dayOpen.items.length === 0 ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>No workout that day.</Text>
        ) : (
          <View style={{ gap: space.md }}>
            {dayOpen.items.map((s) => (
              <WorkoutCard
                key={s.id}
                session={s}
                onPress={() => {
                  setDayOpen(null);
                  openSession(s.id);
                }}
              />
            ))}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

function Toggle({ mode, onMode }: { mode: View_; onMode: (m: View_) => void }) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: color.surfaceSunken, borderWidth: 1, borderColor: color.border }}
    >
      {(['month', 'year'] as const).map((m) => {
        const on = mode === m;
        return (
          <Pressable
            key={m}
            onPress={() => onMode(m)}
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
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: on ? color.ink : color.inkSecondary }}>{m === 'month' ? 'Month' : 'Year'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One month: its title and count, then the days — workout days filled; a filled day is a 48 dp button. */
function MonthBlock({ ym, days, today, onDay }: { ym: string; days: Record<string, number>; today: string; onDay: (day: string, count: number) => void }) {
  const total = monthTotal(days, ym);
  return (
    <View style={{ paddingHorizontal: space.sm, paddingBottom: space.xl }}>
      <Text accessibilityRole="header" style={{ paddingHorizontal: space.md, marginBottom: space.sm, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {monthTitle(ym)}
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{`  ·  ${workoutsLine(total)}`}</Text>
      </Text>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {HEAD.map((h, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
            {h}
          </Text>
        ))}
      </View>
      {monthWeeks(ym).map((week, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {week.map((d, c) => {
            if (d == null) return <View key={c} style={{ flex: 1, height: 48 }} />;
            const iso = dayISO(ym, d);
            const n = days[iso] ?? 0;
            const on = n > 0;
            const isToday = iso === today;
            const circle = (
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? color.accent : 'transparent',
                  borderWidth: isToday && !on ? 1 : 0,
                  borderColor: color.borderStrong,
                }}
              >
                <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: on ? type.monoBold : type.mono, fontSize: type.size.sub, color: on ? '#1F0D05' : iso > today ? color.inkDisabled : color.inkSecondary }}>
                  {d}
                </Text>
              </View>
            );
            return on ? (
              <Pressable
                key={c}
                onPress={() => onDay(iso, n)}
                accessibilityRole="button"
                accessibilityLabel={`${DAY_NAMES[c]} ${d} ${monthName(ym)}, ${workoutsLine(n).toLowerCase()}`}
                style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                {circle}
              </Pressable>
            ) : (
              <View key={c} style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {circle}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Twelve small months of one year; tap a month to open it in the Month view. */
function YearView({ year, years, days, today, onYear, onMonth }: { year: number; years: number[]; days: Record<string, number>; today: string; onYear: (y: number) => void; onMonth: (ym: string) => void }) {
  const older = years.includes(year - 1);
  const newer = years.includes(year + 1);
  return (
    <View style={{ paddingHorizontal: space.screenX, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconButton icon="chevron-left" onPress={() => older && onYear(year - 1)} disabled={!older} accessibilityLabel={`Show ${year - 1}`} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h2, color: color.ink }}>
            {year}
          </Text>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{workoutsLine(yearTotal(days, year))}</Text>
        </View>
        <IconButton icon="chevron-right" onPress={() => newer && onYear(year + 1)} disabled={!newer} accessibilityLabel={`Show ${year + 1}`} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((ym) => {
          const n = monthTotal(days, ym);
          const future = ym > today.slice(0, 7);
          return (
            <Pressable
              key={ym}
              onPress={() => !future && onMonth(ym)}
              disabled={future}
              accessibilityRole="button"
              accessibilityLabel={`${monthTitle(ym)}, ${workoutsLine(n).toLowerCase()}`}
              style={{ flexGrow: 1, flexBasis: '28%', minWidth: 96, padding: space.sm, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, opacity: future ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink, marginBottom: 4 }}>{monthName(ym).slice(0, 3)}</Text>
              {monthWeeks(ym).map((week, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {week.map((d, c) => (
                    <View key={c} style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                      {d != null ? (
                        <View
                          style={{
                            width: '70%',
                            height: '70%',
                            borderRadius: 99,
                            backgroundColor: (days[dayISO(ym, d)] ?? 0) > 0 ? color.accent : color.surfaceRaised,
                          }}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "Search workouts": every workout by exercise or workout name, as History's box did. */
function SearchPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [next, setNext] = useState<HistoryCursor | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const gen = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), SEARCH_PAUSE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const run = useCallback(async (q: string, after: HistoryCursor | null) => {
    const mine = ++gen.current;
    if (!q) {
      setItems([]);
      setNext(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    try {
      const page = await getHistoryPage({ query: q, after });
      if (mine !== gen.current) return;
      setItems((prev) => (after ? [...prev, ...page.items.filter((x) => !prev.some((p) => p.id === x.id))] : page.items));
      setNext(page.next);
      setStatus('ready');
    } catch {
      if (mine === gen.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    void run(query, null);
  }, [query, run]);

  return (
    <FlatList
      data={items}
      keyExtractor={(s) => s.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: space.screenX, paddingBottom: space.xxl }}
      ListHeaderComponent={
        <View style={{ gap: space.md, paddingBottom: space.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              minHeight: 48,
              paddingHorizontal: space.md,
              borderRadius: radius.md,
              backgroundColor: color.surfaceSunken,
              borderWidth: 1,
              borderColor: color.border,
            }}
          >
            <Icon name="search" size={16} color={color.inkMuted} />
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              placeholder="Search workouts"
              placeholderTextColor={color.inkMuted}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search your workouts by exercise or workout name"
              style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink, paddingVertical: space.sm }}
            />
            {text ? (
              <Pressable onPress={() => setText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={16} color={color.inkMuted} />
              </Pressable>
            ) : null}
          </View>
          {status === 'idle' ? (
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>Type an exercise or a workout name.</Text>
          ) : status === 'loading' && items.length === 0 ? (
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>Searching…</Text>
          ) : status === 'error' ? (
            <LoadError compact what="this search" onRetry={() => void run(query, null)} />
          ) : status === 'ready' && items.length === 0 ? (
            <EmptyState icon="search" title={`No workouts match “${query}”`} />
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={{ paddingBottom: space.md }}>
          <WorkoutCard session={item} onPress={() => onOpen(item.id)} />
        </View>
      )}
      onEndReached={() => {
        if (next && status === 'ready') void run(query, next);
      }}
      onEndReachedThreshold={0.6}
      ListFooterComponent={
        status === 'loading' && items.length > 0 ? (
          <ActivityIndicator color={color.accent} />
        ) : items.length > 0 && !next ? (
          <Text style={{ textAlign: 'center', paddingVertical: space.lg, fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>That’s every match.</Text>
        ) : null
      }
    />
  );
}
