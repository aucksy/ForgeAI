/**
 * Searchable, muscle-filterable exercise list used mid-workout to add exercises.
 * Phase 2: small still pictures (tap one for the moving demo — the row itself adds the
 * exercise), finer muscles, ranked search over 400+ exercises.
 */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { Chip, EmptyState } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';
import type { Exercise } from '@/types/models';

import { MUSCLE_LABEL, MUSCLES, type Muscle } from '../catalog/muscles';
import { getAllTrackerExercises, type TrackerExercise } from '../db/exerciseInfo';
import { filterExercises } from '../services/exerciseSearch';
import { ExerciseDemoSheet } from './ExerciseDemoSheet';
import { ExerciseListRow } from './ExerciseListRow';

export function ExercisePickerList({ onSelect }: { onSelect: (ex: Exercise) => void }) {
  const [all, setAll] = useState<TrackerExercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [demo, setDemo] = useState<TrackerExercise | null>(null);

  useEffect(() => {
    let alive = true;
    getAllTrackerExercises()
      .then((list) => {
        if (alive) setAll(list);
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

  const filtered = useMemo(() => filterExercises(all, { query, muscle, equipment: null }), [all, query, muscle]);

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
        ListEmptyComponent={
          <EmptyState icon="dumbbell" title="No exercises found" body="Try a different search or muscle group." />
        }
        renderItem={({ item }) => (
          <ExerciseListRow ex={item} trailing="plus" actionLabel="Add" onPress={onSelect} onDemo={setDemo} />
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
