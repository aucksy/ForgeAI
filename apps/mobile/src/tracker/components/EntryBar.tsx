/**
 * The entry bar — one slim row pinned on the keyboard while a set's number box has the cursor.
 *
 *   weight:   [− 2.5] [+ 2.5]      [Copy to sets below]
 *   reps:     [− 1]   [+ 1]        [Copy to sets below]
 *   time:     [− 15 s] [+ 15 s]    [Copy to sets below]
 *   distance:                      [Copy to sets below]
 *
 * It takes the Finish button's place only while the keyboard is open (the workout screen puts
 * Finish back the moment it closes), so it never covers a tick or Finish. It sits outside the
 * scrolling list, so a tap on it never closes the keyboard or moves the cursor.
 *
 * Every step starts from what the box shows (typed, or its grey hint); the rules are pure and
 * tested in services/setEntry.
 */
import type { JSX } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useKeyboardFrame } from '@/components/KeyboardRoom';
import { tap } from '@/lib/haptics';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { targetFill } from '@/tracker/engine/progression';

import { entryBarModel, type EntryBarModel } from '../services/setEntry';
import { fillForSet, useActiveWorkout } from '../store/activeWorkoutStore';
import { useTargets } from '../store/targetStore';
import { useWorkoutUi } from '../store/workoutUiStore';

/** The bar for the box with the cursor while the keyboard is open, else null. */
export function useEntryBar(): EntryBarModel | null {
  const kb = useKeyboardFrame();
  const focus = useWorkoutUi((s) => s.entryFocus);
  const units = useUnits();
  const ex = useActiveWorkout((s) => (focus ? s.exercises.find((e) => e.key === focus.exKey) : undefined));
  const target = useTargets((s) => (focus ? s.targets.get(focus.exKey) ?? null : null));
  if (!kb || !focus || !ex) return null;
  // The row's own hint (ExerciseLogCard passes the same Target fill to the row).
  const fill = fillForSet(ex, focus.setKey, target ? targetFill(target) : null);
  return entryBarModel(ex, focus.setKey, focus.field, fill, units);
}

export type { EntryBarModel };

export function EntryBar({ model }: { model: EntryBarModel }) {
  const stepSetValue = useActiveWorkout((s) => s.stepSetValue);
  const copySetDown = useActiveWorkout((s) => s.copySetDown);
  const { exKey, setKey, field, fill, who, steps, canCopy } = model;

  const onStep = (dir: 1 | -1): void => {
    if (stepSetValue(exKey, setKey, field, dir, fill)) tap();
  };
  const onCopy = (): void => {
    if (copySetDown(exKey, setKey, fill) > 0) tap();
  };

  const spokenStep = (dir: 1 | -1): string => {
    if (!steps) return '';
    if (field === 'reps') return dir > 0 ? `One more rep for ${who}` : `One rep fewer for ${who}`;
    return dir > 0 ? `Add ${steps.amount} to ${who}` : `Take ${steps.amount} off ${who}`;
  };

  const stepButton = (dir: 1 | -1): JSX.Element | null => {
    if (!steps) return null;
    const enabled = dir > 0 ? steps.canPlus : steps.canMinus;
    return (
      <Pressable
        onPress={() => onStep(dir)}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityLabel={spokenStep(dir)}
        accessibilityState={{ disabled: !enabled }}
        style={({ pressed }) => [stepStyle(), pressed && enabled ? { backgroundColor: color.accentSoft } : null, { opacity: enabled ? 1 : 0.4 }]}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={stepText()}>
          {dir > 0 ? steps.plus : steps.minus}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: 48,
      }}
    >
      {stepButton(-1)}
      {stepButton(1)}
      <View style={{ flex: 1 }} />
      {canCopy ? (
        <Pressable
          onPress={onCopy}
          accessibilityRole="button"
          accessibilityLabel={`Copy ${who} to the sets below`}
          style={({ pressed }) => [copyStyle(), pressed ? { backgroundColor: color.accentSoft } : null]}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={copyText()}>
            Copy to sets below
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Read when drawn: gym branding repaints the tokens.
const stepStyle = () => ({
  minHeight: 48,
  minWidth: 64,
  paddingHorizontal: space.md,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: color.border,
  backgroundColor: color.surfaceRaised,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});

// Read when drawn: gym branding repaints the tokens.
const stepText = () => ({
  fontFamily: type.monoBold,
  fontSize: type.size.body,
  color: color.ink,
});

const copyStyle = () => ({
  minHeight: 48,
  flexShrink: 1,
  paddingHorizontal: space.md,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: color.border,
  backgroundColor: color.surfaceRaised,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});

// Read when drawn: gym branding repaints the tokens.
const copyText = () => ({
  fontFamily: type.bodySemi,
  fontSize: type.size.sub,
  color: color.accent,
});
