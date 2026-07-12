import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/settings/ChipGroup';
import type { ChipOption } from '@/components/settings/ChipGroup';
import { Card, PrimaryButton } from '@/components/ui';
import { getProfile, updateProfile } from '@/db/repos/userRepo';
import { success } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';
import type { UserProfile } from '@/types/models';

const GOAL_OPTIONS = [
  { id: 'muscle', label: 'Build muscle' },
  { id: 'fat_loss', label: 'Lose fat' },
  { id: 'strength', label: 'Get stronger' },
  { id: 'general', label: 'General' },
] as const satisfies readonly ChipOption<UserProfile['goal']>[];

interface NumField {
  key: 'calorieTarget' | 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG';
  label: string;
  unit: string;
  min: number;
  max: number;
}

// Daily targets that drive the Home rings + the coach — the numbers a real member
// must be able to set instead of living with the seeded demo values.
const NUM_FIELDS: readonly NumField[] = [
  { key: 'calorieTarget', label: 'Calories', unit: 'kcal', min: 800, max: 8000 },
  { key: 'proteinTargetG', label: 'Protein', unit: 'g', min: 20, max: 500 },
  { key: 'carbsTargetG', label: 'Carbs', unit: 'g', min: 0, max: 1200 },
  { key: 'fatTargetG', label: 'Fat', unit: 'g', min: 0, max: 400 },
];

const inputStyle = {
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.borderStrong,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 10,
  color: color.ink,
  fontFamily: type.body,
  fontSize: type.size.sub,
} as const;

const overline = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
} as const;

/** Editable member profile — name, goal and daily targets. Reads/writes the frozen
 *  userRepo (getProfile/updateProfile); on save refreshes the dashboard so the
 *  greeting + calorie/protein rings reflect the new values. */
export function ProfileCard({ onSaved }: { onSaved?: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<UserProfile['goal']>('muscle');
  const [nums, setNums] = useState<Record<NumField['key'], string>>({
    calorieTarget: '',
    proteinTargetG: '',
    carbsTargetG: '',
    fatTargetG: '',
  });
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (!alive || seeded.current) return;
        seeded.current = true;
        setProfile(p);
        setName(p.name);
        setGoal(p.goal);
        setNums({
          calorieTarget: String(p.calorieTarget),
          proteinTargetG: String(p.proteinTargetG),
          carbsTargetG: String(p.carbsTargetG),
          fatTargetG: String(p.fatTargetG),
        });
      })
      .catch(() => {
        /* unseeded DB — the card simply stays empty; nothing to edit yet */
      });
    return () => {
      alive = false;
    };
  }, []);

  const onSave = async (): Promise<void> => {
    if (saving || !profile) return;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      Alert.alert('Name required', 'Enter your name.');
      return;
    }
    const patch: Partial<Omit<UserProfile, 'id'>> = {};
    if (trimmedName !== profile.name) patch.name = trimmedName;
    if (goal !== profile.goal) patch.goal = goal;
    for (const f of NUM_FIELDS) {
      const raw = nums[f.key].trim();
      const n = Number(raw);
      if (raw.length === 0 || !Number.isFinite(n) || !Number.isInteger(n) || n < f.min || n > f.max) {
        Alert.alert(`Check ${f.label}`, `Enter a whole number between ${f.min} and ${f.max} ${f.unit}.`);
        return;
      }
      if (n !== profile[f.key]) patch[f.key] = n;
    }
    if (Object.keys(patch).length === 0) {
      setJustSaved(true);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile(patch);
      setProfile(updated);
      success();
      setJustSaved(true);
      onSaved?.();
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving your profile — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Text style={overline}>Name</Text>
      <TextInput
        value={name}
        onChangeText={(t) => {
          setName(t);
          setJustSaved(false);
        }}
        placeholder="Your name"
        placeholderTextColor={color.inkFaint}
        maxLength={40}
        returnKeyType="done"
        style={inputStyle}
      />

      <View style={{ marginTop: space.lg }}>
        <ChipGroup
          label="Goal"
          options={GOAL_OPTIONS}
          selectedId={goal}
          onSelect={(g) => {
            setGoal(g);
            setJustSaved(false);
          }}
        />
      </View>

      <View style={{ marginTop: space.lg }}>
        <Text style={overline}>Daily targets</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {NUM_FIELDS.map((f) => (
            <View key={f.key} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Text
                style={{
                  fontFamily: type.bodyMedium,
                  fontSize: type.size.caption,
                  color: color.inkSecondary,
                  marginBottom: 4,
                }}
              >
                {f.label} ({f.unit})
              </Text>
              <TextInput
                value={nums[f.key]}
                onChangeText={(t) => {
                  setNums((prev) => ({ ...prev, [f.key]: t.replace(/[^0-9]/g, '') }));
                  setJustSaved(false);
                }}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={color.inkFaint}
                maxLength={5}
                style={inputStyle}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: space.lg }}>
        <PrimaryButton
          label={saving ? 'Saving…' : justSaved ? 'Saved ✓' : 'Save profile'}
          icon={justSaved ? 'check' : undefined}
          onPress={() => void onSave()}
          disabled={saving || !profile}
        />
      </View>
    </Card>
  );
}
