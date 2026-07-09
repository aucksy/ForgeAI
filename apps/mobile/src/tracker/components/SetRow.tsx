/**
 * One editable set row: SET cell (tap = toggle warm-up) · PREVIOUS · KG · REPS · ✓.
 * The ✓ fires a crisp haptic on finger-DOWN (house rule) and auto-fills blanks from
 * the PREVIOUS value on completion (handled in the store).
 *
 * Advanced set logging (opt-in, Phase 5b): when enabled, the SET cell shows the set
 * TYPE glyph (W/D/F) and a compact second line adds a type selector + RPE input.
 * When disabled the row is byte-for-byte the original 2-tap experience.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Chip, Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { trimNum } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';

import { useActiveWorkout } from '../store/activeWorkoutStore';
import type { DraftSet } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';

interface SetRowProps {
  exKey: string;
  set: DraftSet;
  /** SET-cell label: the working-set ordinal, or 'W' for a warm-up. */
  label: string;
  previous: { weightKg: number; reps: number } | null;
}

type TypeChoice = 'normal' | 'warmup' | 'drop' | 'failure';
const TYPE_CHOICES: { id: TypeChoice; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'warmup', label: 'Warm' },
  { id: 'drop', label: 'Drop' },
  { id: 'failure', label: 'Fail' },
];

function parseNum(text: string, integer: boolean): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = integer ? parseInt(t, 10) : parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

export function SetRow({ exKey, set, label, previous }: SetRowProps) {
  const updateSet = useActiveWorkout((s) => s.updateSet);
  const toggleWarmup = useActiveWorkout((s) => s.toggleWarmup);
  const toggleDone = useActiveWorkout((s) => s.toggleDone);
  const deleteSetWithUndo = useActiveWorkout((s) => s.deleteSetWithUndo);
  const setSetType = useActiveWorkout((s) => s.setSetType);
  const setRpe = useActiveWorkout((s) => s.setRpe);
  const startRest = useRestTimer((s) => s.start);
  const advanced = useTrackerPrefs((s) => s.advancedSets);

  const [wText, setWText] = useState(set.weightKg == null ? '' : String(set.weightKg));
  const [rText, setRText] = useState(set.reps == null ? '' : String(set.reps));
  const [rpeText, setRpeText] = useState(set.rpe == null ? '' : String(set.rpe));

  // Sync back only when the store value diverges from what's typed (e.g. auto-fill
  // on complete), so typing "82." isn't clobbered mid-decimal.
  useEffect(() => {
    if (parseNum(wText, false) !== set.weightKg) {
      setWText(set.weightKg == null ? '' : String(set.weightKg));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.weightKg]);
  useEffect(() => {
    if (parseNum(rText, true) !== set.reps) {
      setRText(set.reps == null ? '' : String(set.reps));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.reps]);
  useEffect(() => {
    if (parseNum(rpeText, false) !== (set.rpe ?? null)) {
      setRpeText(set.rpe == null ? '' : String(set.rpe));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.rpe]);

  const onWeight = (t: string): void => {
    setWText(t);
    updateSet(exKey, set.key, { weightKg: parseNum(t, false) });
  };
  const onReps = (t: string): void => {
    setRText(t);
    updateSet(exKey, set.key, { reps: parseNum(t, true) });
  };
  const onRpe = (t: string): void => {
    setRpeText(t);
    setRpe(exKey, set.key, parseNum(t, false));
  };

  const prevText = previous ? `${trimNum(previous.weightKg)} × ${previous.reps}` : '—';
  const done = set.done;
  // Opaque so the Swipeable reveal is clean (the card behind is also color.surface).
  const rowBg = done ? 'rgba(12, 163, 12, 0.12)' : color.surface;

  // Advanced mode shows the TYPE glyph in the SET cell; plain mode shows W / ordinal.
  const currentType: TypeChoice = set.isWarmup ? 'warmup' : set.setType ?? 'normal';
  let setGlyph = label;
  let setGlyphColor: string = color.inkSecondary;
  if (set.isWarmup) {
    setGlyph = 'W';
    setGlyphColor = color.warning;
  } else if (advanced && set.setType === 'drop') {
    setGlyph = 'D';
    setGlyphColor = color.accent;
  } else if (advanced && set.setType === 'failure') {
    setGlyph = 'F';
    setGlyphColor = color.critical;
  }

  return (
    <Swipeable
      renderRightActions={() => (
        <Pressable
          onPress={() => deleteSetWithUndo(exKey, set.key)}
          style={{
            width: 76,
            marginLeft: 6,
            borderRadius: radius.sm,
            backgroundColor: color.critical,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 4,
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete set"
        >
          <Icon name="close" size={16} color="#FFFFFF" />
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: '#FFFFFF' }}>
            Delete
          </Text>
        </Pressable>
      )}
      overshootRight={false}
      rightThreshold={40}
    >
      <View style={{ borderRadius: radius.sm, backgroundColor: rowBg, paddingVertical: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingVertical: 6,
            paddingHorizontal: space.xs,
          }}
        >
          {/* SET cell — tap toggles warm-up (plain mode); shows type glyph in advanced mode */}
          <Pressable
            onPress={() => {
              tap();
              toggleWarmup(exKey, set.key);
            }}
            hitSlop={6}
            style={{ width: 34, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={
              set.isWarmup ? 'Warm-up set, tap to make working set' : 'Working set, tap to make warm-up'
            }
          >
            <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: setGlyphColor }}>
              {setGlyph}
            </Text>
          </Pressable>

          {/* PREVIOUS */}
          <Text
            numberOfLines={1}
            style={{ width: 74, fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}
          >
            {prevText}
          </Text>

          {/* KG */}
          <TextInput
            value={wText}
            onChangeText={onWeight}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder={previous ? String(previous.weightKg) : '—'}
            placeholderTextColor={color.inkFaint}
            style={inputStyle}
          />
          {/* REPS */}
          <TextInput
            value={rText}
            onChangeText={onReps}
            keyboardType="number-pad"
            selectTextOnFocus
            placeholder={previous ? String(previous.reps) : '—'}
            placeholderTextColor={color.inkFaint}
            style={inputStyle}
          />

          {/* ✓ complete — haptic on finger-DOWN */}
          <Pressable
            onPressIn={() => tap()}
            onPress={() => {
              const wasDone = set.done;
              toggleDone(exKey, set.key);
              // Auto-start the rest timer on completing a working set (not on undo/warm-up).
              if (!wasDone && !set.isWarmup) startRest();
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={done ? 'Set complete, tap to undo' : 'Mark set complete'}
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: done ? color.good : color.surfaceRaised,
              borderWidth: 1,
              borderColor: done ? color.good : color.border,
            }}
          >
            <Icon name="check" size={18} color={done ? '#05140A' : color.inkMuted} />
          </Pressable>
        </View>

        {/* advanced second line: type selector + RPE (opt-in) */}
        {advanced ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: space.xs,
              paddingHorizontal: space.xs,
              paddingBottom: 6,
            }}
          >
            {TYPE_CHOICES.map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                selected={currentType === c.id}
                onPress={() => setSetType(exKey, set.key, c.id)}
              />
            ))}
            <View style={{ flex: 1 }} />
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}>
              RPE
            </Text>
            <TextInput
              value={rpeText}
              onChangeText={onRpe}
              keyboardType="decimal-pad"
              selectTextOnFocus
              placeholder="—"
              placeholderTextColor={color.inkFaint}
              style={{
                width: 48,
                height: 32,
                borderRadius: radius.sm,
                backgroundColor: color.surfaceSunken,
                borderWidth: 1,
                borderColor: color.border,
                textAlign: 'center',
                fontFamily: type.monoBold,
                fontSize: type.size.sub,
                color: color.ink,
                paddingVertical: 0,
              }}
            />
          </View>
        ) : null}
      </View>
    </Swipeable>
  );
}

const inputStyle = {
  flex: 1,
  height: 38,
  borderRadius: radius.sm,
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.border,
  textAlign: 'center' as const,
  fontFamily: type.monoBold,
  fontSize: type.size.body,
  color: color.ink,
  paddingVertical: 0,
};
