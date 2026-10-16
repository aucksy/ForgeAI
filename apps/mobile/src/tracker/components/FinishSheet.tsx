/**
 * The calm Finish (Phase 2, LW-02 / -03 / -07 / -10 / -30). One stray tap no longer ends a
 * workout: Finish opens this sheet, which says in one glance what will be saved
 * ("5 exercises · 18 sets · 52 min") and asks only what matters:
 *  - rows that hold numbers but were never ticked — "Leave them out" (default) / "Save them";
 *  - a workout left open for hours — "Ended at 6:42 pm" (default) / "Now";
 *  - the workout's name — asked ONLY for a workout with no routine ("Evening workout" says
 *    nothing later); a routine's workout simply takes the routine's name, so names stay the same
 *    and become habit (owner, 13 Oct 2026: a name box on every finish read as renaming the
 *    routine). It can still be renamed later from the workout's page — and an optional note.
 * "Finish workout" saves; "Keep going", ×, back or a tap outside closes it and changes nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { GhostButton, PrimaryButton, Sheet } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import {
  autoSpanText,
  clockTime,
  COUNT_IT,
  durationText,
  endDefault,
  finishOverview,
  lastActivity,
  overviewLine,
  suggestedEnd,
  untickedCounts,
  untickedQuestion,
  untickedWithNumbers,
} from '../services/finishCheck';
import { phoneUses24Hour } from '../services/restCard';
import { activeMs, type PauseState } from '../services/workoutPause';
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
  /** 15 Oct 2026: the workout timer's pauses — paused time never counts in the duration shown. */
  pause: PauseState;
  /** The routine's name, else "Evening workout". */
  defaultName: string;
  /** Show the Name box: only for a workout with no routine. */
  askName: boolean;
  /** The default rest, for "ended at the last tick + one rest". */
  defaultRestSec: number;
  saving: boolean;
  onFinish: (choice: FinishChoice) => void;
  onClose: () => void;
  /** Forgotten Finish: the time the app paused itself, which the member may still count. */
  autoSpan?: { from: number; to: number } | null;
  onCountAutoPause?: () => void;
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

// Read when drawn: gym branding repaints the tokens.
const field = () => ({
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
}) as const;

export function FinishSheet({
  visible,
  exercises,
  startedAt,
  pause,
  defaultName,
  askName,
  defaultRestSec,
  saving,
  onFinish,
  onClose,
  autoSpan,
  onCountAutoPause,
}: FinishSheetProps) {
  // Everything below is decided when the sheet opens, so the numbers stand still while it's up.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const unticked = useMemo(() => untickedWithNumbers(exercises), [exercises]);
  // C1-11 (16 Oct 2026 audit): the question counts working sets and warm-ups apart.
  const untickedLine = useMemo(() => untickedQuestion(untickedCounts(exercises)), [exercises]);
  const tickedOnly = useMemo(() => finishOverview(exercises, false), [exercises]);
  const [keepUnticked, setKeepUnticked] = useState(false);
  // #6: from the member's last action — a tick (plus its rest) or a number typed after it.
  const suggested = useMemo(() => {
    const last = lastActivity(exercises, defaultRestSec);
    return suggestedEnd({ startedAt, lastTickAt: last.at, restSec: last.restSec, now: openedAt, pause });
  }, [exercises, startedAt, defaultRestSec, openedAt, pause]);
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
    setUseSuggested(endDefault({ keepUnticked: keep, startedAt, now, pause }) === 'suggested');
    setName(defaultName);
    setNote('');
    // Reset only when the sheet opens (or the default name arrives), not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, defaultName]);

  // #6: "Save them" means the member was still lifting after the last tick — the end moves to
  // Now (unless the workout has been open over 3 h). "Leave them out" goes back to the suggestion.
  const pickKeep = (keep: boolean): void => {
    setKeepUnticked(keep);
    // C1-11: warm-ups alone are no sign of lifting after the last tick — the end stays put.
    const working = keep && untickedCounts(exercises).sets > 0;
    setUseSuggested(endDefault({ keepUnticked: working, startedAt, now: openedAt, pause }) === 'suggested');
  };
  // #8: the phone's 12/24-hour setting (Android's own, else the locale's), read when it opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const h24 = useMemo(() => phoneUses24Hour(), [visible]);

  const overview = finishOverview(exercises, keepUnticked);
  const endedAt = suggested != null && useSuggested ? suggested : null;
  // The duration that will be saved: paused time left out (as the store saves it).
  const durationMs = activeMs(startedAt, pause, endedAt ?? openedAt);
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
          <Question text={untickedLine ?? ''} />
          <Choice label="Leave them out" selected={!keepUnticked} onPress={() => pickKeep(false)} />
          <Choice label="Save them" selected={keepUnticked} onPress={() => pickKeep(true)} />
        </View>
      ) : null}

      {autoSpan && onCountAutoPause ? (
        <View style={{ gap: space.xs }}>
          <Question text={autoSpanText(autoSpan, openedAt, h24)} />
          <GhostButton label={COUNT_IT} accessibilityLabel="Count the paused time in the workout" onPress={onCountAutoPause} />
        </View>
      ) : null}

      {suggested != null ? (
        <View style={{ gap: space.xs }}>
          <Question text={`Open for ${durationText(activeMs(startedAt, pause, openedAt))}. When did you finish?`} />
          <Choice label={`Ended at ${clockTime(suggested, openedAt, h24)}`} selected={useSuggested} onPress={() => setUseSuggested(true)} />
          <Choice label="Now" selected={!useSuggested} onPress={() => setUseSuggested(false)} />
        </View>
      ) : null}

      {askName ? (
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
          style={[field(), { fontFamily: type.bodySemi }]}
        />
      </View>
      ) : null}
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
          style={[field(), { textAlignVertical: 'top' }]}
        />
      </View>
    </Sheet>
  );
}
