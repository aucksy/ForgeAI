/** Create a custom exercise → frozen exerciseRepo.createExercise (unlimited). */
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Chip, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { createExercise, getAllExercises } from '@/db/repos/exerciseRepo';
import { color, radius, space, type } from '@/theme/tokens';
import type { Exercise, MuscleGroup } from '@/types/models';

type Equipment = Exercise['equipment'];

const MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
];
const EQUIPMENTS: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];
const INCREMENTS = [0.5, 1, 2.5, 5];

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

function defaultIncrement(eq: Equipment): number {
  switch (eq) {
    case 'machine':
      return 5;
    case 'bodyweight':
      return 1;
    default:
      return 2.5;
  }
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.inkSecondary }}>{children}</Text>;
}

export default function NewExerciseScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [isCompound, setIsCompound] = useState(false);
  const [increment, setIncrement] = useState<number>(2.5);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const pickEquipment = (eq: Equipment): void => {
    setEquipment(eq);
    setIncrement(defaultIncrement(eq));
  };

  const toggleSecondary = (m: MuscleGroup): void => {
    setSecondary((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  };

  const canSave = name.trim().length > 0 && muscle !== null && equipment !== null && !saving;

  const onSave = async (): Promise<void> => {
    if (savingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed || muscle === null || equipment === null) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Exact (case/space-insensitive) name-collision guard only — NOT the fuzzy
      // findExerciseByName matcher, which would block valid distinct names
      // (e.g. "Bulgarian Split Squat" when "Squat" exists).
      const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');
      const all = await getAllExercises();
      const target = norm(trimmed);
      const existing = all.find((e) => norm(e.name) === target) ?? null;
      if (existing) {
        savingRef.current = false;
        setSaving(false);
        Alert.alert('Already in your library', `"${existing.name}" already exists.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open it',
            onPress: () => router.replace({ pathname: '/exercise/[id]', params: { id: existing.id } }),
          },
        ]);
        return;
      }
      const created = await createExercise({
        name: trimmed,
        aliases: [],
        muscleGroup: muscle,
        secondaryMuscles: secondary.filter((m) => m !== muscle),
        equipment,
        isCompound,
        incrementKg: increment,
      });
      router.replace({ pathname: '/exercise/[id]', params: { id: created.id } });
    } catch {
      savingRef.current = false;
      setSaving(false);
      Alert.alert('Could not save', 'Something went wrong creating the exercise. Please try again.');
    }
  };

  return (
    <Screen
      title="New exercise"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <View style={{ gap: space.lg }}>
        {/* name */}
        <View style={{ gap: space.sm }}>
          <FieldLabel>Name</FieldLabel>
          <View
            style={{
              height: 46,
              paddingHorizontal: space.md,
              justifyContent: 'center',
              borderRadius: radius.md,
              backgroundColor: color.surfaceSunken,
              borderWidth: 1,
              borderColor: color.border,
            }}
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Incline Bench Press"
              placeholderTextColor={color.inkMuted}
              autoCorrect={false}
              style={{
                fontFamily: type.bodyMedium,
                fontSize: type.size.body,
                color: color.ink,
                paddingVertical: 0,
              }}
            />
          </View>
        </View>

        {/* primary muscle */}
        <View style={{ gap: space.sm }}>
          <FieldLabel>Primary muscle</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {MUSCLES.map((m) => (
              <Chip key={m} label={cap(m)} selected={muscle === m} onPress={() => setMuscle(m)} />
            ))}
          </View>
        </View>

        {/* equipment */}
        <View style={{ gap: space.sm }}>
          <FieldLabel>Equipment</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {EQUIPMENTS.map((eq) => (
              <Chip key={eq} label={cap(eq)} selected={equipment === eq} onPress={() => pickEquipment(eq)} />
            ))}
          </View>
        </View>

        {/* secondary muscles (optional) */}
        <View style={{ gap: space.sm }}>
          <FieldLabel>Secondary muscles (optional)</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {MUSCLES.filter((m) => m !== muscle).map((m) => (
              <Chip key={m} label={cap(m)} selected={secondary.includes(m)} onPress={() => toggleSecondary(m)} />
            ))}
          </View>
        </View>

        {/* compound */}
        <View style={{ gap: space.sm }}>
          <FieldLabel>Movement type</FieldLabel>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="Compound" selected={isCompound} onPress={() => setIsCompound(true)} />
            <Chip label="Isolation" selected={!isCompound} onPress={() => setIsCompound(false)} />
          </View>
        </View>

        {/* increment */}
        <View style={{ gap: space.sm }}>
          <FieldLabel>Weight increment</FieldLabel>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {INCREMENTS.map((n) => (
              <Chip key={n} label={`${n} kg`} selected={increment === n} onPress={() => setIncrement(n)} />
            ))}
          </View>
        </View>

        <PrimaryButton label="Save exercise" icon="check" loading={saving} disabled={!canSave} onPress={() => void onSave()} />
      </View>
    </Screen>
  );
}
