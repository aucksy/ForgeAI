/**
 * Standalone exercise-library list: search (name + aliases), 2-axis filter
 * (muscle group × equipment), a pinned "Recent" section, and a "New exercise"
 * affordance. Rows navigate to detail (browse), unlike the mid-workout
 * ExercisePickerList which adds to the active draft. Read-only over frozen repos.
 */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Chip, EmptyState, GhostButton, Icon } from '@/components/ui';
import { getAllExercises } from '@/db/repos/exerciseRepo';
import { getRecentSessionDetails } from '@/db/repos/workoutRepo';
import { color, radius, space, type } from '@/theme/tokens';
import type { Exercise, MuscleGroup } from '@/types/models';

type Equipment = Exercise['equipment'];

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

const sectionLabel = {
  fontFamily: type.heading,
  fontSize: type.size.sub,
  color: color.inkSecondary,
} as const;

function ExerciseRow({ ex, onPress }: { ex: Exercise; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${ex.name}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: color.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="dumbbell" size={18} color={color.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
          {ex.name}
        </Text>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
          {cap(ex.muscleGroup)} · {cap(ex.equipment)}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </Pressable>
  );
}

export function LibraryList({
  onSelectExercise,
  onCreateNew,
}: {
  onSelectExercise: (ex: Exercise) => void;
  onCreateNew: () => void;
}) {
  const [all, setAll] = useState<Exercise[]>([]);
  const [recent, setRecent] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  useEffect(() => {
    let alive = true;
    getAllExercises()
      .then((list) => {
        if (alive) setAll(list);
      })
      .catch(() => {
        /* unseeded / transient — list stays empty */
      });
    getRecentSessionDetails(12)
      .then((sessions) => {
        if (!alive) return;
        const seen = new Set<string>();
        const out: Exercise[] = [];
        for (const s of sessions) {
          for (const e of s.exercises) {
            if (seen.has(e.exercise.id)) continue;
            seen.add(e.exercise.id);
            out.push(e.exercise);
            if (out.length >= 6) break;
          }
          if (out.length >= 6) break;
        }
        setRecent(out);
      })
      .catch(() => {
        /* no history yet — no recent section */
      });
    return () => {
      alive = false;
    };
  }, []);

  const muscles = useMemo(() => {
    const seen = new Set<MuscleGroup>();
    for (const e of all) seen.add(e.muscleGroup);
    return [...seen].sort();
  }, [all]);

  const equipments = useMemo(() => {
    const seen = new Set<Equipment>();
    for (const e of all) seen.add(e.equipment);
    return [...seen].sort();
  }, [all]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return all.filter((e) => {
      if (muscle && e.muscleGroup !== muscle) return false;
      if (equipment && e.equipment !== equipment) return false;
      if (!q) return true;
      if (normalize(e.name).includes(q)) return true;
      return e.aliases.some((a) => normalize(a).includes(q));
    });
  }, [all, query, muscle, equipment]);

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
          placeholder="Search exercises"
          placeholderTextColor={color.inkMuted}
          autoCorrect={false}
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
            label={cap(item)}
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
        contentContainerStyle={{ gap: space.sm, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.sm, marginBottom: space.sm }}>
            <GhostButton label="New exercise" icon="plus" onPress={onCreateNew} />
            {showRecent ? (
              <>
                <Text style={sectionLabel}>Recent</Text>
                {recent.map((ex) => (
                  <ExerciseRow key={`r-${ex.id}`} ex={ex} onPress={() => onSelectExercise(ex)} />
                ))}
                <Text style={[sectionLabel, { marginTop: space.xs }]}>All exercises</Text>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="dumbbell" title="No exercises found" body="Try a different search, or create a new exercise." />
        }
        renderItem={({ item }) => <ExerciseRow ex={item} onPress={() => onSelectExercise(item)} />}
      />
    </View>
  );
}
