import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { fmtGrams, fmtInt } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';

import type { MealView } from '../payload';
import { CardShell } from './CardShell';

function Macro({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <View style={styles.macroBox}>
      <Text
        numberOfLines={1}
        style={[styles.macroValue, highlight ? { color: color.accentBright } : null]}
      >
        {value}
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

/** Logged-meal card: description + the 4 macro mini-stats. */
export function MealCard({ meal }: { meal: MealView }) {
  return (
    <CardShell icon="meal" title={meal.description} subtitle="Meal logged to nutrition">
      {meal.photoUri ? (
        <Image
          source={{ uri: meal.photoUri }}
          style={{ width: '100%', height: 140, borderRadius: radius.md, marginTop: space.md }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
        <Macro value={fmtInt(meal.calories)} label="kcal" highlight />
        <Macro value={fmtGrams(meal.proteinG)} label="protein" />
        <Macro value={fmtGrams(meal.carbsG)} label="carbs" />
        <Macro value={fmtGrams(meal.fatG)} label="fat" />
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  macroBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.md,
    paddingVertical: space.md - 2,
    paddingHorizontal: 2,
  },
  macroValue: {
    fontFamily: type.monoBold,
    fontSize: 14,
    color: color.ink,
  },
  macroLabel: {
    fontFamily: type.bodyMedium,
    fontSize: type.size.caption,
    color: color.inkMuted,
    marginTop: 2,
  },
});
