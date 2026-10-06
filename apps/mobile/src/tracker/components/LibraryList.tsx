/**
 * Standalone exercise-library list: search (name + aliases), 2-axis filter
 * (muscle × equipment), a pinned "Recent" section, and a "New exercise"
 * affordance. Rows navigate to detail (browse), unlike the mid-workout
 * ExercisePickerList which adds to the active draft. Read-only over frozen repos.
 *
 * Phase 2: 400+ exercises, each with a small still picture (tap it for the moving demo),
 * finer muscle filters (front / side / rear shoulders…) and ranked search.
 */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';

import { Chip, EmptyState, GhostButton, Icon } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';
import type { Exercise } from '@/types/models';

import { MUSCLE_LABEL, MUSCLES, type Muscle } from '../catalog/muscles';
import { getRecentSessionDetailsBatched } from '../db/sessionDetails';
import { getAllTrackerExercises, type TrackerExercise } from '../db/exerciseInfo';
import { filterExercises } from '../services/exerciseSearch';
import { ExerciseDemoSheet } from './ExerciseDemoSheet';
import { ExerciseListRow } from './ExerciseListRow';

type Equipment = Exercise['equipment'];

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

const sectionLabel = {
  fontFamily: type.heading,
  fontSize: type.size.sub,
  color: color.inkSecondary,
} as const;

export function LibraryList({
  onSelectExercise,
  onCreateNew,
}: {
  onSelectExercise: (ex: Exercise) => void;
  onCreateNew: () => void;
}) {
  const [all, setAll] = useState<TrackerExercise[]>([]);
  const [recent, setRecent] = useState<TrackerExercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [demo, setDemo] = useState<TrackerExercise | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getAllTrackerExercises(),
      getRecentSessionDetailsBatched(12).catch(() => []), // batched: ~3 queries, not 1 + 2×12
    ])
      .then(([list, sessions]) => {
        if (!alive) return;
        setAll(list);
        const byId = new Map(list.map((e) => [e.id, e]));
        const seen = new Set<string>();
        const out: TrackerExercise[] = [];
        for (const s of sessions) {
          for (const e of s.exercises) {
            const ex = byId.get(e.exercise.id);
            if (!ex || seen.has(ex.id)) continue;
            seen.add(ex.id);
            out.push(ex);
            if (out.length >= 6) break;
          }
          if (out.length >= 6) break;
        }
        setRecent(out);
      })
      .catch(() => {
        /* unseeded / transient — list stays empty */
      });
    return () => {
      alive = false;
    };
  }, []);

  const muscles = useMemo(() => {
    const seen = new Set<Muscle>();
    for (const e of all) for (const m of e.muscles.primary) seen.add(m);
    return MUSCLES.filter((m) => seen.has(m));
  }, [all]);

  const equipments = useMemo(() => {
    const seen = new Set<Equipment>();
    for (const e of all) seen.add(e.equipment);
    return [...seen].sort();
  }, [all]);

  const filtered = useMemo(() => filterExercises(all, { query, muscle, equipment }), [all, query, muscle, equipment]);

  const showRecent = query === '' && muscle === null && equipment === null && recent.length > 0;

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
        <Icon name="dumbbell" size={16} color={color.inkMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={all.length > 0 ? `Search ${all.length} exercises` : 'Search exercises'}
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
        keyExtractor={(m) => `m-${m}`}
        contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}
        ListHeaderComponent={
          <View style={{ marginRight: space.sm }}>
            <Chip label="All muscles" selected={muscle === null} onPress={() => setMuscle(null)} />
          </View>
        }
        renderItem={({ item }) => (
          <Chip
            label={MUSCLE_LABEL[item]}
            selected={muscle === item}
            onPress={() => setMuscle((cur) => (cur === item ? null : item))}
          />
        )}
        style={{ flexGrow: 0 }}
      />

      {/* equipment filter chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={equipments}
        keyExtractor={(eq) => `e-${eq}`}
        contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}
        ListHeaderComponent={
          <View style={{ marginRight: space.sm }}>
            <Chip label="All gear" selected={equipment === null} onPress={() => setEquipment(null)} />
          </View>
        }
        renderItem={({ item }) => (
          <Chip
            label={cap(item)}
            selected={equipment === item}
            onPress={() => setEquipment((cur) => (cur === item ? null : item))}
          />
        )}
        style={{ flexGrow: 0 }}
      />

      {/* results */}
      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={{ gap: space.sm, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.sm, marginBottom: space.sm }}>
            <GhostButton label="New exercise" icon="plus" onPress={onCreateNew} />
            {showRecent ? (
              <>
                <Text style={sectionLabel}>Recent</Text>
                {recent.map((ex) => (
                  <ExerciseListRow
                    key={`r-${ex.id}`}
                    ex={ex}
                    trailing="chevron-right"
                    actionLabel="View"
                    onPress={onSelectExercise}
                    onDemo={setDemo}
                  />
                ))}
                <Text style={[sectionLabel, { marginTop: space.xs }]}>All exercises</Text>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="dumbbell" title="No exercises found" body="Try a different search, or create a new exercise." />
        }
        renderItem={({ item }) => (
          <ExerciseListRow ex={item} trailing="chevron-right" actionLabel="View" onPress={onSelectExercise} onDemo={setDemo} />
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
