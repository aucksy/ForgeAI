/** Today's nutrition — view / add / delete meals. Frozen nutritionRepo, offline, kg.
 *  Meals were previously only creatable via chat and never viewable/editable; this
 *  gives the prominent Home calorie/protein rings a real management surface. */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import {
  Card,
  EmptyState,
  IconButton,
  PrimaryButton,
  Screen,
  SectionHeader,
  Skeleton,
} from '@/components/ui';
import { getProfile } from '@/db/repos/userRepo';
import { deleteMeal, getMealsForDay, logMeal } from '@/db/repos/nutritionRepo';
import { todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { success, tap } from '@/lib/haptics';
import { useDashboard } from '@/store/dashboardStore';
import { color, radius, space, type } from '@/theme/tokens';
import type { Meal, UserProfile } from '@/types/models';

interface MacroField {
  key: 'calories' | 'proteinG' | 'carbsG' | 'fatG';
  label: string;
  unit: string;
  target: (p: UserProfile) => number;
}

const MACROS: readonly MacroField[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', target: (p) => p.calorieTarget },
  { key: 'proteinG', label: 'Protein', unit: 'g', target: (p) => p.proteinTargetG },
  { key: 'carbsG', label: 'Carbs', unit: 'g', target: (p) => p.carbsTargetG },
  { key: 'fatG', label: 'Fat', unit: 'g', target: (p) => p.fatTargetG },
];

const inputStyle = {
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 10,
  color: color.ink,
  fontFamily: type.body,
  fontSize: type.size.sub,
} as const;

const emptyDraft = { description: '', calories: '', proteinG: '', carbsG: '', fatG: '' };

export default function NutritionScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [saving, setSaving] = useState(false);

  const reloadMeals = async (): Promise<void> => {
    setMeals(await getMealsForDay(todayISO()));
  };

  useEffect(() => {
    let alive = true;
    Promise.all([getProfile().catch(() => null), getMealsForDay(todayISO()).catch(() => [])])
      .then(([p, m]) => {
        if (!alive) return;
        setProfile(p);
        setMeals(m);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const onAdd = async (): Promise<void> => {
    if (saving) return;
    const description = draft.description.trim();
    if (description.length === 0) {
      Alert.alert('Describe the meal', 'Add a short description, e.g. "2 rotis, dal, paneer".');
      return;
    }
    const nums = {
      calories: Number(draft.calories.trim() || '0'),
      proteinG: Number(draft.proteinG.trim() || '0'),
      carbsG: Number(draft.carbsG.trim() || '0'),
      fatG: Number(draft.fatG.trim() || '0'),
    };
    for (const m of MACROS) {
      const v = nums[m.key];
      if (!Number.isFinite(v) || v < 0 || v > 100000) {
        Alert.alert(`Check ${m.label}`, `Enter a number in ${m.unit} (or leave it blank for 0).`);
        return;
      }
    }
    if (nums.calories === 0) {
      Alert.alert('Add calories', 'Enter at least the calories for this meal.');
      return;
    }
    setSaving(true);
    try {
      await logMeal({ dateISO: todayISO(), description, ...nums });
      success();
      setDraft({ ...emptyDraft });
      await reloadMeals();
      void useDashboard.getState().refresh();
    } catch {
      Alert.alert('Could not save', 'Something went wrong adding the meal — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (meal: Meal): void => {
    tap();
    Alert.alert('Delete meal?', `Remove "${meal.description}" from today?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteMeal(meal.id);
              await reloadMeals();
              void useDashboard.getState().refresh();
            } catch {
              Alert.alert('Could not delete', 'Something went wrong — please try again.');
            }
          })();
        },
      },
    ]);
  };

  return (
    <Screen
      title="Nutrition"
      subtitle="Today's meals"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <View style={{ gap: space.lg }}>
        {/* today's totals vs targets */}
        {profile ? (
          <Card>
            <View style={{ flexDirection: 'row' }}>
              {MACROS.map((m) => {
                const value = totals[m.key];
                const target = m.target(profile);
                return (
                  <View key={m.key} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontFamily: type.mono, fontSize: type.size.h3, color: color.ink }}>
                      {fmtInt(Math.round(value))}
                    </Text>
                    <Text
                      style={{
                        fontFamily: type.mono,
                        fontSize: type.size.caption,
                        color: color.inkMuted,
                        marginTop: 1,
                      }}
                    >
                      /{fmtInt(target)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: type.bodyMedium,
                        fontSize: type.size.caption,
                        color: color.inkSecondary,
                        marginTop: 3,
                      }}
                    >
                      {m.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : null}

        {/* quick add */}
        <Card>
          <View style={{ gap: space.sm }}>
            <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.inkSecondary }}>
              Add a meal
            </Text>
            <TextInput
              value={draft.description}
              onChangeText={(t) => setDraft((d) => ({ ...d, description: t }))}
              placeholder="e.g. 2 rotis, dal and paneer"
              placeholderTextColor={color.inkFaint}
              maxLength={120}
              style={inputStyle}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {MACROS.map((m) => (
                <View key={m.key} style={{ flexBasis: '47%', flexGrow: 1 }}>
                  <Text
                    style={{
                      fontFamily: type.bodyMedium,
                      fontSize: type.size.caption,
                      color: color.inkSecondary,
                      marginBottom: 4,
                    }}
                  >
                    {m.label} ({m.unit})
                  </Text>
                  <TextInput
                    value={draft[m.key]}
                    onChangeText={(t) =>
                      setDraft((d) => ({ ...d, [m.key]: t.replace(/[^0-9]/g, '') }))
                    }
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={color.inkFaint}
                    maxLength={6}
                    style={inputStyle}
                  />
                </View>
              ))}
            </View>
            <PrimaryButton
              label={saving ? 'Adding…' : 'Add meal'}
              icon="plus"
              onPress={() => void onAdd()}
              disabled={saving}
            />
          </View>
        </Card>

        {/* today's meals */}
        {loading ? (
          <Skeleton width="100%" height={160} radius={radius.lg} />
        ) : meals.length === 0 ? (
          <EmptyState
            icon="meal"
            title="No meals logged today"
            body="Add a meal above, or ask your coach to log one for you."
          />
        ) : (
          <View style={{ gap: space.sm }}>
            <SectionHeader title={`Today · ${meals.length} meal${meals.length === 1 ? '' : 's'}`} />
            {meals.map((m) => (
              <View
                key={m.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  paddingVertical: space.sm,
                  paddingHorizontal: space.md,
                  borderRadius: radius.md,
                  backgroundColor: color.surface,
                  borderWidth: 1,
                  borderColor: color.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}
                  >
                    {m.description}
                  </Text>
                  <Text
                    style={{
                      fontFamily: type.mono,
                      fontSize: type.size.caption,
                      color: color.inkMuted,
                      marginTop: 2,
                    }}
                  >
                    {fmtInt(Math.round(m.calories))} kcal · {Math.round(m.proteinG)}P · {Math.round(m.carbsG)}C · {Math.round(m.fatG)}F
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  size={34}
                  tint={color.inkMuted}
                  onPress={() => onDelete(m)}
                  accessibilityLabel={`Delete ${m.description}`}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
