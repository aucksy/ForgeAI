/**
 * Searchable, muscle-filterable exercise list used mid-workout to add exercises.
 * Phase 2: small still pictures (tap one for the moving demo — the row itself adds the
 * exercise), finer muscles, ranked search over 400+ exercises.
 */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Chip, EmptyState, Icon, LoadError, Skeleton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { viewOf } from '@/lib/loadState';
import { color, radius, space, type } from '@/theme/tokens';
import type { Exercise } from '@/types/models';

import { MUSCLE_LABEL, MUSCLES, type Muscle } from '../catalog/muscles';
import { getAllTrackerExercises, type TrackerExercise } from '../db/exerciseInfo';
import { createOffer, filterExercises } from '../services/exerciseSearch';
import { ExerciseDemoSheet } from './ExerciseDemoSheet';
import { ExerciseListRow } from './ExerciseListRow';

export function ExercisePickerList({
  onSelect,
  actionLabel = 'Add',
  isMarked,
  only,
  onCreate,
  error,
}: {
  onSelect: (ex: TrackerExercise) => void;
  /** Screen-reader verb for each row (Phase 4: "Leave out" in the plan builder). */
  actionLabel?: string;
  /** Phase 4: rows already chosen show a tick instead of the plus. Pass a new function when the marks change. */
  isMarked?: (ex: TrackerExercise) => boolean;
  /** Phase 4: show only these (the plan builder lists library exercises only). Keep it stable. */
  only?: (ex: TrackerExercise) => boolean;
  /** v0.28.0: offer "Create “<typed>”" at the end of the results (inside a workout). */
  onCreate?: (typed: string) => void;
  /** EX-10: a short line when the last pick failed ("Couldn't add it. Try again."); the list stays usable. */
  error?: string | null;
}) {
  const [all, setAll] = useState<TrackerExercise[]>([]);
  // EX-16: until the first read answers, show placeholders — not "No exercises found" (and no
  // Create row, which would offer to duplicate an exercise that is merely still loading).
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [demo, setDemo] = useState<TrackerExercise | null>(null);

  useEffect(() => {
    let alive = true;
    getAllTrackerExercises()
      .then((list) => {
        if (!alive) return;
        setAll(list);
        setLoaded(true);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = (): void => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  const shown = useMemo(() => (only ? all.filter(only) : all), [all, only]);

  const muscles = useMemo(() => {
    const seen = new Set<Muscle>();
    for (const e of shown) for (const m of e.muscles.primary) seen.add(m);
    return MUSCLES.filter((m) => seen.has(m));
  }, [shown]);

  const filtered = useMemo(() => filterExercises(shown, { query, muscle, equipment: null }), [shown, query, muscle]);
  const createName = onCreate && loaded ? createOffer(query, shown) : null;
  const view = viewOf({ loaded, failed, count: filtered.length });
  const createRow = createName ? (
    <Pressable
      onPress={() => onCreate?.(createName)}
      accessibilityRole="button"
      accessibilityLabel={`Create “${createName}”`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        borderStyle: 'dashed',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name="plus" size={18} color={color.accent} />
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink }}>
        Create “{createName}”
      </Text>
    </Pressable>
  ) : null;

  return (
    <View style={{ flex: 1, gap: space.md }}>
      {/* search */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          height: 46,
          paddingHorizontal: space.md,
          borderRadius: radius.md,
          backgroundColor: color.surfaceSunken,
          borderWidth: 1,
          borderColor: color.border,
        }}
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
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
      </View>

      {/* muscle filter chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={muscles}
        keyExtractor={(m) => m}
        contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}
        ListHeaderComponent={
          <View style={{ marginRight: space.sm }}>
            <Chip label="All" selected={muscle === null} onPress={() => setMuscle(null)} />
          </View>
        }
        renderItem={({ item }) => (
          <Chip
            label={MUSCLE_LABEL[item]}
            selected={muscle === item}
            onPress={() => setMuscle((cur) => (cur === item ? null : item))}
          />
        )}
        // Never shrink: under a 400-row list the row was squeezed and the chip text clipped.
        style={{ flexGrow: 0, flexShrink: 0 }}
      />

      <InlineError message={error} />

      {/* results */}
      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
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
          ) : createRow ? null : (
            <EmptyState icon="dumbbell" title="No exercises found" body="Try a different search or muscle group." />
          )
        }
        ListFooterComponent={createRow}
        extraData={isMarked}
        renderItem={({ item }) => (
          <ExerciseListRow
            ex={item}
            trailing={isMarked?.(item) ? 'check' : 'plus'}
            actionLabel={isMarked?.(item) ? 'Keep' : actionLabel}
            onPress={onSelect}
            onDemo={setDemo}
          />
        )}
      />

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
