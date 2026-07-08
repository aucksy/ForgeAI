/** Searchable, muscle-filterable exercise list used mid-workout to add exercises. */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Chip, EmptyState, Icon } from '@/components/ui';
import { getAllExercises } from '@/db/repos/exerciseRepo';
import { color, radius, space, type } from '@/theme/tokens';
import type { Exercise, MuscleGroup } from '@/types/models';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function ExercisePickerList({ onSelect }: { onSelect: (ex: Exercise) => void }) {
  const [all, setAll] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  useEffect(() => {
    let alive = true;
    getAllExercises()
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
    const seen = new Set<MuscleGroup>();
    for (const e of all) seen.add(e.muscleGroup);
    return [...seen].sort();
  }, [all]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return all.filter((e) => {
      if (muscle && e.muscleGroup !== muscle) return false;
      if (!q) return true;
      if (normalize(e.name).includes(q)) return true;
      return e.aliases.some((a) => normalize(a).includes(q));
    });
  }, [all, query, muscle]);

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
            label={cap(item)}
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
        contentContainerStyle={{ gap: space.sm, paddingBottom: space.xxl }}
        ListEmptyComponent={
          <EmptyState icon="dumbbell" title="No exercises found" body="Try a different search or muscle group." />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
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
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name}`}
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
              <Text
                numberOfLines={1}
                style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}
              >
                {item.name}
              </Text>
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
                {cap(item.muscleGroup)} · {cap(item.equipment)}
              </Text>
            </View>
            <Icon name="plus" size={18} color={color.accent} />
          </Pressable>
        )}
      />
    </View>
  );
}
