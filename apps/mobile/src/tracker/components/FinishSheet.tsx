/**
 * The calm Finish (Phase 2, LW-02 / -03 / -07 / -10 / -30). One stray tap no longer ends a
 * workout: Finish opens this sheet, which says in one glance what will be saved
 * ("5 exercises · 18 sets · 52 min") and asks only what matters:
 *  - rows that hold numbers but were never ticked — "Leave them out" (default) / "Save them";
 *  - a workout left open for hours — "Ended at 6:42 pm" (default) / "Now";
 *  - the workout's name (the routine's, else "Evening workout") and an optional note.
 * "Finish workout" saves; "Keep going", ×, back or a tap outside closes it and changes nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { GhostButton, PrimaryButton, Sheet } from '@/components/ui';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';

import {
  clockTime,
  durationText,
  endDefault,
  finishOverview,
  lastActivity,
  overviewLine,
  suggestedEnd,
  untickedWithNumbers,
} from '../services/finishCheck';
import { phoneUses24Hour } from '../services/restCard';
import type { DraftExercise } from '../store/activeWorkoutStore';

export interface FinishChoice {
  keepUnticked: boolean;
  /** null = now. */
  endedAt: number | null;
  name: string;
  note: string;
}

export interface FinishSheetProps {
  visible: boolean;
  exercises: DraftExercise[];
  startedAt: number;
  /** The routine's name, else "Evening workout" — editable here. */
  defaultName: string;
  /** The default rest, for "ended at the last tick + one rest". */
  defaultRestSec: number;
  saving: boolean;
  onFinish: (choice: FinishChoice) => void;
  onClose: () => void;
}

/** One-of-many choice with a radio circle (DESIGN-LANGUAGE: Choices). 48 dp. */
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 48,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: selected ? color.accentSoft : pressed ? color.surface : 'transparent',
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? color.accent : color.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent }} /> : null}
      </View>
      <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: selected ? color.accent : color.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Question({ text }: { text: string }) {
  return <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{text}</Text>;
}

const field = {
  minHeight: 48,
  paddingHorizontal: space.md,
  paddingVertical: 10,
  borderRadius: radius.md,
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.borderStrong,
  fontFamily: type.body,
  fontSize: type.size.body,
  color: color.ink,
} as const;

export function FinishSheet({ visible, exercises, startedAt, defaultName, defaultRestSec, saving, onFinish, onClose }: FinishSheetProps) {
  // Everything below is decided when the sheet opens, so the numbers stand still while it's up.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const unticked = useMemo(() => untickedWithNumbers(exercises), [exercises]);
  const tickedOnly = useMemo(() => finishOverview(exercises, false), [exercises]);
  const [keepUnticked, setKeepUnticked] = useState(false);
  // #6: from the member's last action — a tick (plus its rest) or a number typed after it.
  const suggested = useMemo(() => {
    const last = lastActivity(exercises, defaultRestSec);
    return suggestedEnd({ startedAt, lastTickAt: last.at, restSec: last.restSec, now: openedAt });
  }, [exercises, startedAt, defaultRestSec, openedAt]);
  const [useSuggested, setUseSuggested] = useState(true);
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    const now = Date.now();
    setOpenedAt(now);
    // Leave unticked rows out — unless that would leave nothing at all to save.
    const keep = tickedOnly.sets === 0 && unticked > 0;
    setKeepUnticked(keep);
    setUseSuggested(endDefault({ keepUnticked: keep, startedAt, now }) === 'suggested');
    setName(defaultName);
    setNote('');
    // Reset only when the sheet opens (or the default name arrives), not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, defaultName]);

  // #6: "Save them" means the member was still lifting after the last tick — the end moves to
  // Now (unless the workout has been open over 3 h). "Leave them out" goes back to the suggestion.
  const pickKeep = (keep: boolean): void => {
    setKeepUnticked(keep);
    setUseSuggested(endDefault({ keepUnticked: keep, startedAt, now: openedAt }) === 'suggested');
  };
  // #8: the phone's 12/24-hour setting (Android's own, else the locale's), read when it opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const h24 = useMemo(() => phoneUses24Hour(), [visible]);

  const overview = finishOverview(exercises, keepUnticked);
  const endedAt = suggested != null && useSuggested ? suggested : null;
  const durationMs = (endedAt ?? openedAt) - startedAt;
  const nothing = overview.sets === 0;

  return (
    <Sheet
      visible={visible}
      title="Finish workout?"
      subtitle={overviewLine(overview, durationMs)}
      onClose={onClose}
      closeLabel="Keep going"
      footer={
        <View style={{ gap: space.sm }}>
          <PrimaryButton
            label={nothing ? 'Tick a set to finish' : 'Finish workout'}
            icon="check"
            loading={saving}
            disabled={nothing || saving}
            onPress={() => onFinish({ keepUnticked, endedAt, name, note })}
          />
          <GhostButton label="Keep going" onPress={onClose} />
        </View>
      }
    >
      {unticked > 0 ? (
        <View style={{ gap: space.xs }}>
          <Question
            text={`${countWord(unticked, 'set')} ${unticked === 1 ? 'has' : 'have'} numbers but ${unticked === 1 ? "isn't" : "aren't"} ticked.`}
          />
          <Choice label="Leave them out" selected={!keepUnticked} onPress={() => pickKeep(false)} />
          <Choice label="Save them" selected={keepUnticked} onPress={() => pickKeep(true)} />
        </View>
      ) : null}

      {suggested != null ? (
        <View style={{ gap: space.xs }}>
          <Question text={`Open for ${durationText(openedAt - startedAt)}. When did you finish?`} />
          <Choice label={`Ended at ${clockTime(suggested, openedAt, h24)}`} selected={useSuggested} onPress={() => setUseSuggested(true)} />
          <Choice label="Now" selected={!useSuggested} onPress={() => setUseSuggested(false)} />
        </View>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Question text="Name" />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={defaultName}
          placeholderTextColor={color.inkFaint}
          maxLength={60}
          returnKeyType="done"
          accessibilityLabel="Workout name"
          style={[field, { fontFamily: type.bodySemi }]}
        />
      </View>
      <View style={{ gap: space.xs, marginBottom: space.sm }}>
        <Question text="Note (optional)" />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="How did it go?"
          placeholderTextColor={color.inkFaint}
          multiline
          maxLength={500}
          accessibilityLabel="Workout note, optional"
          style={[field, { textAlignVertical: 'top' }]}
        />
      </View>
    </Sheet>
  );
}
