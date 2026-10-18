/**
 * One exercise on the Start / Resume screen (app/today.tsx), OWNER-INBOX #9 (decided 18 Oct 2026):
 * its name, its Target line, and the kg to beat with the % on last time. Tap to open it: each
 * set's weight × reps. An exercise with no kg to beat (a first time, a hold, an easy week) shows
 * its Target line only and doesn't open. Words: tracker/lib/kgTarget.ts (tested).
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { fmtInt, fmtWeight, kgToDisplay, weightUnit } from '@/lib/format';
import { color, space, type } from '@/theme/tokens';
import type { UnitSystem } from '@/types/models';

import { targetLine } from '../engine/progression';
import { kgPlan, kgSetLines, kgToBeatLine } from '../lib/kgTarget';
import type { KgTarget } from '../services/coachTargets';

export function ExerciseKgRow({ target: t, index, units }: { target: KgTarget; index: number; units: UnitSystem }) {
  const [open, setOpen] = useState(false);
  const weight = (kg: number) => fmtWeight(kg, units);
  const line = targetLine(t, weight);
  const plan = useMemo(() => kgPlan(t, t.lastSets ?? []), [t]);
  // Dumbbells counted per hand add up per hand: say so.
  const toBeat = plan ? kgToBeatLine(plan, (kg) => `${fmtInt(Math.round(kgToDisplay(kg, units)))} ${weightUnit(units)}${t.each ? ' each' : ''}`) : null;
  const sets = plan && open ? kgSetLines(plan, weight) : null;

  const body = (
    <>
      <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted, width: 18 }}>{index + 1}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink }}>{t.exerciseName}</Text>
        <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkSecondary }}>{line}</Text>
        {toBeat ? <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accentBright }}>{toBeat}</Text> : null}
        {sets ? (
          <View style={{ gap: 2, marginTop: space.xs }}>
            {sets.map((s) => (
              <Text key={s} style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkSecondary }}>
                {s}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      {plan ? (
        <View style={{ paddingTop: 2, transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevron-right" size={18} color={color.inkMuted} />
        </View>
      ) : null}
    </>
  );
  const rowStyle = { flexDirection: 'row' as const, gap: space.md, paddingVertical: space.sm + 2, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: color.border };

  if (!plan) {
    return (
      <View accessibilityLabel={`${t.exerciseName}. ${line}`} style={rowStyle}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${t.exerciseName}. ${line}. ${toBeat}.`}
      accessibilityHint={open ? 'Hides the weight and reps of each set' : 'Shows the weight and reps of each set'}
      style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.7 : 1 }]}
    >
      {body}
    </Pressable>
  );
}
