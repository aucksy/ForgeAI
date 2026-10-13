/**
 * THE exercise list (audit Phase 4, EX-06): the library, Add exercise (in a workout and in a
 * routine), Swap and the plan builder all use this one list, so it works the same everywhere:
 *  - a forgiving search (EX-01: any order, plurals, one typo, Hevy titles);
 *  - "Recent" first while nothing is typed or filtered;
 *  - muscle AND gear filters;
 *  - "Did you mean Dumbbell Curl?" and "Create “<typed>”" when the typed name is not an exercise;
 *  - hidden exercises left out (EX-02);
 *  - it reads again when the member's exercises change (EX-03), keeping the search and filters.
 * Small still pictures: tap one for the demo; the rest of the row does the list's job (open the
 * exercise, add it, mark it).
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Chip, EmptyState, Icon, LoadError, Sheet, SheetRow, Skeleton } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { viewOf } from '@/lib/loadState';
import { color, radius, space, type } from '@/theme/tokens';
import type { Exercise } from '@/types/models';

import { MUSCLE_LABEL, MUSCLES, type Muscle } from '../catalog/muscles';
import { getAllTrackerExercises, type TrackerExercise } from '../db/exerciseInfo';
import { getHiddenExerciseIds } from '../db/exerciseManage';
import { getRecentExerciseIds } from '../db/recentExercises';
import { createOffer, didYouMean, filterExercises } from '../services/exerciseSearch';
import { BAND_TITLE, exercisesRows, lastDoneText, type ExercisesRow, type LastDone } from '../lib/exercisesView';
import { useExerciseList } from '../store/exerciseListStore';
import { ExerciseDemoSheet } from './ExerciseDemoSheet';
import { ExerciseListRow } from './ExerciseListRow';

type Equipment = Exercise['equipment'];

const GEAR_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  other: 'Other',
};

export function ExercisePickerList({
  onSelect,
  actionLabel = 'Add',
  isMarked,
  only,
  onCreate,
  error,
  recentIds = 'auto',
  markedLabel = 'Keep',
  trailing = 'plus',
  header,
  placeholderCount = false,
  lastDone,
  filterMenus = false,
  footer,
  onQueryChange,
}: {
  onSelect: (ex: TrackerExercise) => void;
  /** Screen-reader verb for each row ("Add", "View", "Leave out"). */
  actionLabel?: string;
  /** Rows already chosen show a tick instead of the plus. Pass a new function when the marks change. */
  isMarked?: (ex: TrackerExercise) => boolean;
  /** Show only these (the plan builder lists library exercises only). Keep it stable. */
  only?: (ex: TrackerExercise) => boolean;
  /** Offer "Create “<typed>”" when the typed name is not an exercise. */
  onCreate?: (typed: string) => void;
  /** A short line when the last pick failed ("Couldn't add it. Try again."); the list stays usable. */
  error?: string | null;
  /** "Recent" band: the given ids, or 'auto' (the last few workouts' exercises). */
  recentIds?: readonly string[] | 'auto';
  /** Screen-reader verb on a marked row (the plan builder: "Keep"; multi-select: "Unselect"). */
  markedLabel?: string;
  /** The row's end icon when not marked ("chevron-right" where a row opens the exercise). */
  trailing?: IconName;
  /** Shown above the results (the library's "New exercise"). */
  header?: ReactNode;
  /** The search box says how many exercises there are ("Search 402 exercises"). */
  placeholderCount?: boolean;
  /**
   * Redesign R5 (Profile → Exercises, Hevy's order): when each exercise was last done. Given,
   * the list shows Recent (done, newest first, "Last: 12 Oct") · Made by you · All exercises
   * while nothing is typed, instead of the "Recent" band of the last few workouts.
   */
  lastDone?: ReadonlyMap<string, LastDone>;
  /** Redesign R5: the filters as two buttons, Equipment and Muscle, each opening a list (Hevy's). */
  filterMenus?: boolean;
  /** Shown after the results (Profile → Exercises: "Hidden exercises"). */
  footer?: ReactNode;
  /** 13 Oct 2026: the search text as typed, for the screen's "Create" button (it prefills the name). */
  onQueryChange?: (query: string) => void;
}) {
  const version = useExerciseList((s) => s.version);
  const [all, setAll] = useState<TrackerExercise[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [autoRecent, setAutoRecent] = useState<string[]>([]);
  // EX-16: until the first read answers, show placeholders — not "No exercises found" (and no
  // Create row, which would offer to duplicate an exercise that is merely still loading).
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    onQueryChange?.(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [gear, setGear] = useState<Equipment | null>(null);
  const [demo, setDemo] = useState<TrackerExercise | null>(null);
  const [menu, setMenu] = useState<'gear' | 'muscle' | null>(null);

  const autoRecentMode = recentIds === 'auto';
  useEffect(() => {
    let alive = true;
    Promise.all([
      getAllTrackerExercises(),
      getHiddenExerciseIds().catch(() => new Set<string>()),
      autoRecentMode ? getRecentExerciseIds().catch(() => [] as string[]) : Promise.resolve([] as string[]),
    ])
      .then(([list, hide, rec]) => {
        if (!alive) return;
        setAll(list);
        setHidden(hide);
        setAutoRecent(rec);
        setLoaded(true);
        setFailed(false);
      })
      .catch(() => {
        // A re-read that fails keeps the list already on screen (EX-03).
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt, version, autoRecentMode]);

  const retry = (): void => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  const shown = useMemo(
    () => all.filter((e) => !hidden.has(e.id) && (!only || only(e))),
    [all, hidden, only],
  );

  const muscles = useMemo(() => {
    const seen = new Set<Muscle>();
    for (const e of shown) for (const m of e.muscles.primary) seen.add(m);
    return MUSCLES.filter((m) => seen.has(m));
  }, [shown]);
  const gears = useMemo(() => {
    const seen = new Set<Equipment>();
    for (const e of shown) seen.add(e.equipment);
    return (Object.keys(GEAR_LABEL) as Equipment[]).filter((g) => seen.has(g));
  }, [shown]);

  // Review fix (search speed): the box shows every letter at once; the list follows a beat behind
  // (React drops a stale search when the next letter arrives), so typing never waits on the search.
  const searched = useDeferredValue(query);
  const filtered = useMemo(() => filterExercises(shown, { query: searched, muscle, equipment: gear }), [shown, searched, muscle, gear]);
  // A new search or filter starts at the top: the best match is first, never left scrolled
  // out of sight above the list (phone run 38063413760, "pull-up" in the library).
  const resultsRef = useRef<FlatList<ExercisesRow<TrackerExercise>>>(null);
  useEffect(() => {
    resultsRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searched, muscle, gear]);
  // "Recent" first while nothing is typed or filtered (the full list follows, A→Z).
  const recent = useMemo(() => {
    const ids = recentIds === 'auto' ? autoRecent : recentIds;
    if (ids.length === 0) return [];
    const byId = new Map(shown.map((e) => [e.id, e]));
    return ids.flatMap((id) => {
      const e = byId.get(id);
      return e ? [e] : [];
    });
  }, [shown, recentIds, autoRecent]);
  const showRecent = !lastDone && recent.length > 0 && searched.trim() === '' && muscle == null && gear == null;
  // R5: Hevy's bands (or the search's order once something is typed).
  const rows = useMemo<ExercisesRow<TrackerExercise>[]>(
    () => (lastDone ? exercisesRows(filtered, lastDone, searched.trim() !== '') : filtered.map((ex) => ({ kind: 'exercise', key: ex.id, ex }))),
    [filtered, lastDone, searched],
  );
  const createName = onCreate && loaded ? createOffer(searched, all) : null;
  // EX-01: the nearest exercise, above the Create row ("Did you mean Dumbbell Curl?").
  const suggestion = createName ? didYouMean(searched, filtered) : null;
  const view = viewOf({ loaded, failed: failed && !loaded, count: filtered.length });

  const rowFor = (item: TrackerExercise, key?: string) => (
    <ExerciseListRow
      key={key}
      ex={item}
      trailing={isMarked?.(item) ? 'check' : trailing}
      actionLabel={isMarked?.(item) ? markedLabel : actionLabel}
      onPress={onSelect}
      onDemo={setDemo}
      note={lastDone ? lastDoneText(lastDone.get(item.id)) : null}
    />
  );

  const createRows = createName ? (
    <View style={{ gap: space.sm, marginTop: filtered.length > 0 ? space.sm : 0 }}>
      {suggestion ? (
        <Pressable
          onPress={() => onSelect(suggestion)}
          accessibilityRole="button"
          accessibilityLabel={`Did you mean ${suggestion.name}? ${actionLabel}`}
          style={({ pressed }) => [offerRow(), { borderStyle: 'solid', opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="check" size={18} color={color.accent} />
          <Text style={offerText()} numberOfLines={2}>
            Did you mean <Text style={{ fontFamily: type.bodySemi, color: color.accent }}>{suggestion.name}</Text>?
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onCreate?.(createName)}
        accessibilityRole="button"
        accessibilityLabel={`Create “${createName}”`}
        style={({ pressed }) => [offerRow(), { opacity: pressed ? 0.7 : 1 }]}
      >
        <Icon name="plus" size={18} color={color.accent} />
        <Text numberOfLines={2} style={offerText()}>
          Create “{createName}”
        </Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, gap: space.md }}>
      {/* search */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: 48,
          paddingLeft: space.md,
          borderRadius: radius.md,
          backgroundColor: color.surfaceSunken,
          borderWidth: 1,
          borderColor: color.border,
        }}
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholderCount && shown.length > 0 ? `Search ${shown.length} exercises` : 'Search exercises'}
          placeholderTextColor={color.inkMuted}
          autoCorrect={false}
          accessibilityLabel="Search exercises"
          style={{
            flex: 1,
            fontFamily: type.bodyMedium,
            fontSize: type.size.body,
            color: color.ink,
            paddingVertical: 0,
          }}
        />
        {query !== '' ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="close" size={18} color={color.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {filterMenus ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Chip
            label={gear ? GEAR_LABEL[gear] : 'All equipment'}
            selected={gear != null}
            onPress={() => setMenu('gear')}
            accessibilityLabel={`Equipment: ${gear ? GEAR_LABEL[gear] : 'all'}. Change`}
          />
          <Chip
            label={muscle ? MUSCLE_LABEL[muscle] : 'All muscles'}
            selected={muscle != null}
            onPress={() => setMenu('muscle')}
            accessibilityLabel={`Muscle: ${muscle ? MUSCLE_LABEL[muscle] : 'all'}. Change`}
          />
        </View>
      ) : null}

      {/* muscle filter chips */}
      {filterMenus ? null : (
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={muscles}
        keyExtractor={(m) => `m-${m}`}
        contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}
        ListHeaderComponent={
          <View style={{ marginRight: space.sm }}>
            <Chip label="All muscles" selected={muscle === null} onPress={() => setMuscle(null)} />
          </View>
        }
        renderItem={({ item }) => (
          <Chip label={MUSCLE_LABEL[item]} selected={muscle === item} onPress={() => setMuscle((cur) => (cur === item ? null : item))} />
        )}
        // Never shrink: under a 400-row list the row was squeezed and the chip text clipped.
        style={{ flexGrow: 0, flexShrink: 0 }}
      />
      )}

      {/* gear filter chips */}
      {!filterMenus && gears.length > 1 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={gears}
          keyExtractor={(g) => `g-${g}`}
          contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}
          ListHeaderComponent={
            <View style={{ marginRight: space.sm }}>
              <Chip label="All gear" selected={gear === null} onPress={() => setGear(null)} />
            </View>
          }
          renderItem={({ item }) => (
            <Chip label={GEAR_LABEL[item]} selected={gear === item} onPress={() => setGear((cur) => (cur === item ? null : item))} />
          )}
          style={{ flexGrow: 0, flexShrink: 0 }}
        />
      ) : null}

      <InlineError message={error} />

      {/* results */}
      <FlatList
        ref={resultsRef}
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={{ gap: space.sm, paddingBottom: space.xxl }}
        ListEmptyComponent={
          view === 'loading' ? (
            <View style={{ gap: space.sm }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} width="100%" height={64} radius={radius.md} />
              ))}
            </View>
          ) : view === 'error' ? (
            <LoadError compact what="your exercises" onRetry={retry} />
          ) : createRows ? null : (
            <EmptyState icon="dumbbell" title="No exercises found" body="Try a different search, muscle or gear." />
          )
        }
        ListHeaderComponent={
          header || showRecent ? (
            <View style={{ gap: space.sm, marginBottom: space.xs }}>
              {header}
              {showRecent ? (
                <>
                  <Text accessibilityRole="header" style={bandHead()}>
                    Recent
                  </Text>
                  {recent.map((item) => rowFor(item, `recent-${item.id}`))}
                  <Text accessibilityRole="header" style={[bandHead(), { marginTop: space.sm }]}>
                    All exercises
                  </Text>
                </>
              ) : null}
            </View>
          ) : null
        }
        ListFooterComponent={
          footer ? (
            <View style={{ gap: space.sm }}>
              {createRows}
              {footer}
            </View>
          ) : (
            createRows
          )
        }
        extraData={isMarked}
        renderItem={({ item }) =>
          item.kind === 'band' ? (
            <Text accessibilityRole="header" style={[bandHead(), { marginTop: item.band === 'recent' ? 0 : space.sm }]}>
              {BAND_TITLE[item.band]}
            </Text>
          ) : (
            rowFor(item.ex)
          )
        }
      />

      {filterMenus ? (
        <Sheet visible={menu != null} title={menu === 'gear' ? 'Equipment' : 'Muscle'} onClose={() => setMenu(null)}>
          <View style={{ gap: 2 }}>
            {menu === 'gear' ? (
              <>
                <SheetRow label="All equipment" selected={gear == null} onPress={() => { setGear(null); setMenu(null); }} />
                {gears.map((g) => (
                  <SheetRow key={g} label={GEAR_LABEL[g]} selected={gear === g} onPress={() => { setGear(g); setMenu(null); }} />
                ))}
              </>
            ) : menu === 'muscle' ? (
              <>
                <SheetRow label="All muscles" selected={muscle == null} onPress={() => { setMuscle(null); setMenu(null); }} />
                {muscles.map((m) => (
                  <SheetRow key={m} label={MUSCLE_LABEL[m]} selected={muscle === m} onPress={() => { setMuscle(m); setMenu(null); }} />
                ))}
              </>
            ) : null}
          </View>
        </Sheet>
      ) : null}

      <ExerciseDemoSheet
        visible={demo != null}
        catalogKey={demo?.catalogKey ?? null}
        name={demo?.name ?? ''}
        media={demo ? { uri: demo.mediaUri, type: demo.mediaType } : null}
        onClose={() => setDemo(null)}
      />
    </View>
  );
}

// Read when drawn: gym branding repaints the tokens.
const bandHead = () => ({
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
}) as const;

// Read when drawn: gym branding repaints the tokens.
const offerRow = () => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.sm,
  minHeight: 48,
  paddingHorizontal: space.md,
  paddingVertical: space.sm,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: color.border,
  borderStyle: 'dashed',
}) as const;

// Read when drawn: gym branding repaints the tokens.
const offerText = () => ({ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink }) as const;
