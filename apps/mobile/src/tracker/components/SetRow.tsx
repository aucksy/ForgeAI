/**
 * One editable set row: SET · PREVIOUS · (inputs for this exercise's type) · (RPE) · ✓.
 *
 * Phase 1 (Hevy parity, calmer screen):
 *  - Tapping the SET number opens the set-type sheet (warm-up / drop / failure /
 *    remove). The old always-visible second row of chips is gone.
 *  - "Track RPE" adds one narrow RPE cell, coloured by effort; tap it for the sheet.
 *  - Ticking a set: decides the rest timer (per-exercise length, the same for every set type,
 *    supersets rest per round) and announces a new record on the spot.
 *
 * Phase 2 — the inputs follow the exercise's type (engine/logTypes):
 *   weight × reps: KG · REPS        bodyweight: REPS        weighted: +KG · REPS
 *   assisted: ASSIST · REPS         time: TIME + a stopwatch button
 *   distance: KM (or M)             distance + time: KM · TIME
 * A TIME cell reads digits like a microwave ("130" = 1:30) because a number pad has
 * no colon; it shows the tidy "1:30" once you leave it.
 *
 * Phase 2, packet B — every tick saves exactly what's on screen:
 *  - An empty box shows its grey hint as REAL text (not a placeholder that can vanish while a
 *    tick still saves it), in `inkFaint` (4.5:1). The hint is `fillForSet`'s one rule, and a
 *    tick on an empty box saves exactly it.
 *  - Boxes keep only valid numbers as they are typed: digits and one comma or point, no minus,
 *    no spaces (LW-06).
 *  - A tick with nothing to save shakes gently and says what is missing ("Add reps first",
 *    LW-13); a blank weight on a weight × reps lift is missing, not 0 kg (TG-07).
 *  - D7: a ticked number far above the member's best asks once, inline: "300 kg — that's 4×
 *    your best. Keep it?" [Keep] [Fix]. It never refuses; Keep keeps it as typed.
 *  - LW-27 / SH-22: ✓, SET, RPE, the timer and every box are 48 dp to touch, and each says
 *    which exercise and set it is ("Mark Bench Press set 2 complete").
 *  - 13 Oct 2026 (replaces LW-17's "RPE moves into the sheet under 380 dp"): with "Track RPE" on
 *    the RPE cell shows at every width and text size, as in Hevy. On a phone under 400 dp the
 *    table uses narrower SET / RPE / ✓ cells (48 dp to the finger through their touch margins)
 *    and reaches into the card's padding; PREVIOUS wraps onto a second line instead of cutting
 *    its numbers off, and shows last time's RPE under them ("@ 9"). The set-number sheet still
 *    sets RPE too. Widths: `rowLayout` (setRowLayout.ts).
 *
 * The ✓ fires its haptic on finger-DOWN (house rule).
 */
import { memo, useEffect, useRef, useState, type JSX, type RefObject } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { TextInput as TextInputType } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Icon } from '@/components/ui';
import { deltaWords } from '@/components/ui/a11y';
import { success, tap, warn } from '@/lib/haptics';
import { trimNum } from '@/lib/format';
import { displayUnits } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';

import {
  distanceFromUnit,
  typedDistanceMatches,
  distanceToUnit,
  durationDigits,
  fmtDuration,
  hasDistance,
  hasReps,
  hasTime,
  hasWeight,
  parseDuration,
  shownDistUnit,
  type DistUnit,
  type LogType,
} from '../engine/logTypes';
import { rpeColor } from '../lib/rpe';
import { recordLabel, toastHit } from '../services/liveRecords';
import type { EntryField } from '../services/setEntry';
import { vsLastTimeText } from '../services/vsLastTime';
import type { RecordKind } from '../services/liveRecords';
import { afterSetCompleted, nextUpLabel } from '../services/restRules';
import { nextForCard } from '../services/restDoneRun';
import { missingText, typoCheck, typoText, type TickMissing } from '../services/setTick';
import { playWorkoutSound } from '../services/workoutSounds';
import { flushDraft, isCorrecting, prevForSet, useActiveWorkout } from '../store/activeWorkoutStore';
import type { DraftSet, PrevSet, SetFill } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { useWorkoutUi } from '../store/workoutUiStore';
import { Glyph } from './TrackerGlyph';
import { boxFontSize, hintTexts, prevLabel, rowLayout, SET_ROW, touchSlop, type RowLayout } from './setRowLayout';
import { boxLabel, cleanTyped, distWord, kgToTyped, parseTyped, typedToKg, typedWeightMatches } from './unitText';

export { hintTexts, prevLabel, rowLayout, SET_ROW } from './setRowLayout';

interface SetRowProps {
  exKey: string;
  set: DraftSet;
  /** SET-cell label: the working-set ordinal, or 'W' for a warm-up. */
  label: string;
  /** Last workout's matching set (PREVIOUS column). */
  previous: PrevSet | null;
  /** Grey hint in the inputs, and what a tick fills in. */
  fill: SetFill | null;
  /** This set beats the member's history so far. */
  record: RecordKind | null;
  onOpenType: (setKey: string) => void;
  /** Phase 2: how this exercise is logged (absent = weight × reps). */
  logType?: LogType;
  distUnit?: DistUnit;
  /** Time exercises: open the stopwatch / countdown for this set. */
  onOpenTimer?: (setKey: string) => void;
  /** LW-27: the exercise's name, for labels a screen reader can tell apart. */
  exName?: string;
  /** LW-27: how the row is spoken: "set 2", "warm-up 1", "drop set 3". */
  spoken?: string;
}

const parseNum = parseTyped;

/** The same layout, following the window and text size (the card's header uses it too). */
export function useRowLayout(logType: LogType = 'weight_reps'): RowLayout {
  const { width, fontScale } = useWindowDimensions();
  const showRpe = useTrackerPrefs((s) => s.advancedSets);
  return rowLayout(width, showRpe, { fontScale, logType });
}

/** After a tick lands in the store: record alert + rest timer + superset hand-off. */
export function afterTick(exKey: string, setKey: string): void {
  const st = useActiveWorkout.getState();
  if (st.editingSessionId) return; // correcting a past workout — no timers, no fanfare
  const ex = st.exercises.find((e) => e.key === exKey);
  const done = ex?.sets.find((s) => s.key === setKey);
  if (!ex || !done?.done) return; // a blank set with nothing to fill stays unticked

  // Phase 3 review: the pop-up counts the same lift on other cards, and stays quiet for a set
  // already beaten by another ticked set (the medal still follows set order).
  // Phase 4: an easy week stays out of records, so it never claims one.
  const hit = st.easyWeek ? null : toastHit(st.exercises, exKey, setKey);
  if (hit) {
    success();
    playWorkoutSound('record');
    useWorkoutUi
      .getState()
      .showRecord(ex.name, recordLabel(hit, { logType: ex.logType ?? 'weight_reps', loadMode: ex.loadMode ?? 'one', distUnit: ex.distUnit ?? 'km' }));
  } else if (!st.easyWeek && !isCorrecting(st) && !done.isWarmup && done.setType !== 'drop') {
    // Review fix: a drop set is lighter on purpose, and last time's same place may have been a
    // different kind of set (PREVIOUS carries no type), so drop sets are never compared.
    // Not a record, but better than the same set last time (the PREVIOUS the row shows): one
    // quiet line in the record toast's place. No sound; the tick's own haptic is enough. Equal
    // or worse says nothing. An easy week is lighter on purpose, so it is never compared.
    const text = vsLastTimeText(
      done,
      prevForSet(ex, setKey),
      ex.logType ?? 'weight_reps',
      ex.loadMode ?? 'one',
      displayUnits(),
      ex.distUnit ?? 'km',
    );
    if (text) {
      useWorkoutUi.getState().showLastTime(ex.name, text);
      AccessibilityInfo.announceForAccessibility(`${ex.name}, ${deltaWords(text)}`);
    }
  }

  const timer = useRestTimer.getState();
  const d = afterSetCompleted(st.exercises, exKey, setKey, timer.defaultSec);
  // v0.26.1: "Bench Press, set 3" for the watch card and "Rest is over". Phase 6: the card's
  // "Done" ticks exactly the row it names, so the name comes from that row.
  const card = nextForCard(d.nextExKey ?? exKey);
  const nextName = card.label ?? nextUpLabel(st.exercises, d.nextExKey ?? exKey);
  if (d.restSec) timer.start(d.restSec, nextName, card.done);
  // Ticked during an older rest, and this set means "no rest" (drop set next,
  // mid-superset, rest off) → the old bell must not ring mid-set.
  else if (timer.endsAt != null) timer.skip();
  if (d.nextExKey) useWorkoutUi.getState().requestScroll(d.nextExKey);
}

/**
 * Memoised: the store rebuilds only the edited set's object, so every untouched row
 * keeps prop identity (`previous`/`fill` are memoised by the card, `record` and the
 * rest are primitives, `onOpenType` is a stable callback).
 */
export const SetRow = memo(function SetRow({
  exKey,
  set,
  label,
  previous,
  fill,
  record,
  onOpenType,
  logType = 'weight_reps',
  distUnit = 'km',
  onOpenTimer,
  exName = 'Exercise',
  spoken,
}: SetRowProps) {
  const updateSet = useActiveWorkout((s) => s.updateSet);
  const toggleDone = useActiveWorkout((s) => s.toggleDone);
  const deleteSetWithUndo = useActiveWorkout((s) => s.deleteSetWithUndo);
  const showRpe = useTrackerPrefs((s) => s.advancedSets);
  const L = useRowLayout(logType);
  const { prevW, rpeCell } = L;
  const { fontScale } = useWindowDimensions();
  // v0.27.0: kg or lb — typed pounds are stored as kg; the box shows the member's unit.
  const units = useUnits();

  const [wText, setWText] = useState(kgToTyped(set.weightKg, units));
  const [rText, setRText] = useState(set.reps == null ? '' : String(set.reps));
  const [tText, setTText] = useState(set.durationSec ? fmtDuration(set.durationSec) : '');
  const [dText, setDText] = useState(set.distanceM ? String(distanceToUnit(set.distanceM, distUnit)) : '');
  const [tFocused, setTFocused] = useState(false);
  // Packet B: what a tick could not save (LW-13), and the typo question (D7).
  const [note, setNote] = useState<string | null>(null);
  const [typo, setTypo] = useState<{ text: string; kind: 'weight' | 'reps' } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeX = useRef(new Animated.Value(0)).current;
  const wRef = useRef<TextInputType>(null);
  const rRef = useRef<TextInputType>(null);
  const tRef = useRef<TextInputType>(null);
  const dRef = useRef<TextInputType>(null);

  // Sync back only when the store value diverges from what's typed (e.g. auto-fill
  // on complete), so typing "82." (or "135" lb) isn't clobbered mid-decimal.
  useEffect(() => {
    if (!typedWeightMatches(wText, set.weightKg, units)) {
      setWText(kgToTyped(set.weightKg, units));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.weightKg, units]);
  useEffect(() => {
    if (parseNum(rText, true) !== set.reps) {
      setRText(set.reps == null ? '' : String(set.reps));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.reps]);
  useEffect(() => {
    if (tFocused && parseDuration(tText) === (set.durationSec ?? null)) return;
    setTText(set.durationSec ? (tFocused ? durationDigits(set.durationSec) : fmtDuration(set.durationSec)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.durationSec]);
  useEffect(() => {
    // Compare in stored metres, rounded the way typing stores them: "100.5" m stays as
    // typed instead of jumping to "101" mid-typing.
    if (typedDistanceMatches(parseNum(dText, false), set.distanceM ?? null, distUnit)) return;
    const stored = set.distanceM != null ? distanceToUnit(set.distanceM, distUnit) : null;
    setDText(stored == null ? '' : String(stored));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.distanceM, units]);
  // Unticked (here or by an undo elsewhere): the typo question has nothing left to ask about.
  useEffect(() => {
    if (!set.done) setTypo(null);
  }, [set.done]);
  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  const clearNote = (): void => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = null;
    setNote(null);
  };

  // Typing saves the draft after a short pause (the store debounces); leaving a box saves it now.
  const saveNow = (): void => void flushDraft();

  // The entry bar above the keyboard follows the box with the cursor. Leaving waits a moment, so
  // moving from this row's weight to its reps never drops the bar for a frame.
  const blurTimers = useRef(new Map<EntryField, ReturnType<typeof setTimeout>>());
  const onBoxFocus = (field: EntryField): void => {
    const pending = blurTimers.current.get(field);
    if (pending) {
      clearTimeout(pending);
      blurTimers.current.delete(field);
    }
    useWorkoutUi.getState().focusEntry({ exKey, setKey: set.key, field });
  };
  const onBoxBlur = (field: EntryField): void => {
    const key = set.key;
    const timers = blurTimers.current;
    const old = timers.get(field);
    if (old) clearTimeout(old);
    timers.set(
      field,
      setTimeout(() => {
        timers.delete(field);
        useWorkoutUi.getState().blurEntry(exKey, key, field);
      }, 120),
    );
  };
  useEffect(() => {
    const timers = blurTimers.current;
    const key = set.key;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      // A row removed while typing in it (swipe-delete, Undo): the bar must not stay for it.
      useWorkoutUi.getState().blurEntry(exKey, key);
    };
  }, [exKey, set.key]);
  const onWeight = (t: string): void => {
    const clean = cleanTyped(t, { maxInt: 4, maxDec: 2 });
    setWText(clean);
    clearNote();
    updateSet(exKey, set.key, { weightKg: typedToKg(clean, units) });
  };
  const onReps = (t: string): void => {
    const clean = cleanTyped(t, { integer: true, maxInt: 3 });
    setRText(clean);
    clearNote();
    updateSet(exKey, set.key, { reps: parseNum(clean, true) });
  };
  const onTime = (t: string): void => {
    const digits = t.replace(/[^\d:]/g, '').slice(0, 6);
    setTText(digits);
    clearNote();
    updateSet(exKey, set.key, { durationSec: parseDuration(digits) });
  };
  const metres = shownDistUnit(distUnit) === 'm';
  const onDistance = (t: string): void => {
    const clean = cleanTyped(t, metres ? { maxInt: 5, maxDec: 1 } : { maxInt: 3, maxDec: 3 });
    setDText(clean);
    clearNote();
    const v = parseNum(clean, false);
    updateSet(exKey, set.key, { distanceM: v == null ? null : distanceFromUnit(v, distUnit) });
  };

  const shake = (): void => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (reduce) return;
        shakeX.setValue(0);
        Animated.sequence(
          [6, -6, 4, -4, 0].map((v) => Animated.timing(shakeX, { toValue: v, duration: 45, useNativeDriver: true })),
        ).start();
      });
  };

  const focusMissing = (m: TickMissing): void => {
    const ref = m === 'weight' ? wRef : m === 'reps' ? rRef : m === 'time' ? tRef : dRef;
    ref.current?.focus();
  };

  // Phase 6: the rest card's "Done" could not tick this row (nothing to save) and opened the app
  // here — the row says what is missing and puts the cursor there, as a tick on screen does.
  const rowNote = useWorkoutUi((s) => (s.rowNote && s.rowNote.exKey === exKey && s.rowNote.setKey === set.key ? s.rowNote : null));
  useEffect(() => {
    if (!rowNote || set.done) return;
    const line = missingText(rowNote.missing);
    setNote(line);
    AccessibilityInfo.announceForAccessibility(line);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 6000);
    focusMissing(rowNote.missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowNote?.id]);

  const onTick = (): void => {
    const wasDone = set.done;
    const missing = toggleDone(exKey, set.key, fill);
    if (missing) {
      // LW-13: say what is missing — gently, once — and put the cursor there.
      warn();
      shake();
      const line = missingText(missing);
      setNote(line);
      AccessibilityInfo.announceForAccessibility(line);
      if (noteTimer.current) clearTimeout(noteTimer.current);
      noteTimer.current = setTimeout(() => setNote(null), 3500);
      focusMissing(missing);
      return;
    }
    clearNote();
    if (wasDone) {
      setTypo(null);
      return;
    }
    afterTick(exKey, set.key);
    // D7: a number far above the member's best gets one question. It is already saved.
    const ex = useActiveWorkout.getState().exercises.find((e) => e.key === exKey);
    const now = ex?.sets.find((s) => s.key === set.key);
    if (ex && now?.done && !now.isWarmup) {
      const hit = typoCheck(logType, now, ex.bests);
      if (hit) {
        const text = typoText(hit, now, units);
        setTypo({ text, kind: hit.kind });
        AccessibilityInfo.announceForAccessibility(text);
      }
    }
  };

  const onFix = (): void => {
    const kind = typo?.kind ?? 'weight';
    setTypo(null);
    if (set.done) toggleDone(exKey, set.key, fill); // untick: the rest it started is cancelled too
    setTimeout(() => (kind === 'weight' ? wRef : rRef).current?.focus(), 50);
  };

  // 13 Oct 2026: with "Track RPE" on, last time's RPE goes on a second line ("@ 9").
  const [prevMain, prevRpe] = prevLabel(previous, logType, distUnit, units, showRpe).split('\n');
  const done = set.done;
  // Opaque so the Swipeable reveal is clean (the card behind is also color.surface).
  const rowBg = done ? 'rgba(12, 163, 12, 0.12)' : color.surface;

  let setGlyph = label;
  let setGlyphColor: string = color.inkSecondary;
  if (set.isWarmup) {
    setGlyph = 'W';
    setGlyphColor = color.warning;
  } else if (set.setType === 'drop') {
    setGlyph = 'D';
    setGlyphColor = color.accent;
  } else if (set.setType === 'failure') {
    setGlyph = 'F';
    setGlyphColor = color.criticalText;
  }
  const typeName = set.isWarmup ? 'Warm-up' : set.setType === 'drop' ? 'Drop' : set.setType === 'failure' ? 'Failure' : 'Set';
  const which = spoken ?? `${typeName.toLowerCase()} ${label}`;
  const who = `${exName} ${which}`;
  const weightBox = logType === 'assisted' ? 'assisted' : logType === 'weighted' ? 'weighted' : 'weight';
  const hints = hintTexts(fill, logType, distUnit, units);
  const rpeSpoken = set.rpe != null ? `, RPE ${trimNum(set.rpe)}` : '';

  /** A number box whose empty state shows the hint as real text (it can't vanish). */
  const box = (p: {
    inputRef: RefObject<TextInputType | null>;
    value: string;
    hint: string;
    onChangeText: (t: string) => void;
    onFocus?: () => void;
    onBlur: () => void;
    keyboardType: 'decimal-pad' | 'number-pad';
    a11y: string;
  }): JSX.Element => (
    // Packet B (Phase 7): the box is drawn 44 dp tall but the finger gets 48 — a tap on the
    // 2 dp above or below still lands in the box. The input stays the spoken element.
    <Pressable
      accessible={false}
      onPress={() => p.inputRef.current?.focus()}
      style={{ flex: 1, minHeight: SET_ROW.touch, justifyContent: 'center' }}
    >
      <TextInput
        ref={p.inputRef}
        value={p.value}
        onChangeText={p.onChangeText}
        onFocus={p.onFocus}
        onBlur={p.onBlur}
        keyboardType={p.keyboardType}
        selectTextOnFocus
        accessibilityLabel={p.a11y}
        accessibilityHint={p.value === '' && p.hint !== '—' ? `Empty. A tick saves ${p.hint}` : undefined}
        // A1 (13 Oct 2026 audit): the size already holds the phone's text scale, shrunk only so
        // the whole number fits its box ("102.5", never "102").
        allowFontScaling={false}
        style={inputStyle(boxFontSize(p.value, L.inputW, fontScale, type.size.body))}
      />
      {p.value === '' ? (
        <View pointerEvents="none" style={hintWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={hintStyle()}>
            {p.hint}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

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
          accessibilityLabel={`Delete ${who}`}
        >
          <Icon name="close" size={16} color="#FFFFFF" />
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: '#FFFFFF' }}>Delete</Text>
        </Pressable>
      )}
      overshootRight={false}
      rightThreshold={40}
    >
      <View style={{ borderRadius: radius.sm, backgroundColor: rowBg }}>
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: L.gap,
            // The boxes carry their own 48 dp touch height, so the row needs no padding of its own.
            minHeight: SET_ROW.touch,
            paddingHorizontal: L.padX,
            transform: [{ translateX: shakeX }],
          }}
        >
          {/* SET cell — tap for the set-type sheet (RPE too, with "Track RPE" on) */}
          <Pressable
            onPress={() => {
              tap();
              onOpenType(set.key);
            }}
            hitSlop={{ top: 2, bottom: 2, left: 4, right: Math.max(0, SET_ROW.touch - 4 - L.setW) }}
            style={{ width: L.setW, height: SET_ROW.height, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`${who}${rpeSpoken}. Change set type`}
          >
            <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: setGlyphColor }}>{setGlyph}</Text>
            {record ? (
              <View style={{ position: 'absolute', top: 2, right: 0 }} accessibilityElementsHidden>
                <Glyph name="medal" size={14} color={color.accentBright} />
              </View>
            ) : null}
          </Pressable>

          {/* PREVIOUS — the numbers (a second line rather than cut off), then "@ 9" with Track RPE */}
          <View style={{ width: prevW, marginHorizontal: L.prevGap - L.gap, justifyContent: 'center' }}>
            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={prevStyle()}>
              {prevMain}
            </Text>
            {prevRpe ? (
              <Text numberOfLines={1} accessibilityLabel={`RPE ${prevRpe.replace('@', '').trim()} last time`} style={prevStyle()}>
                {prevRpe}
              </Text>
            ) : null}
          </View>

          {/* DISTANCE */}
          {hasDistance(logType)
            ? box({
                inputRef: dRef,
                value: dText,
                hint: hints.distance,
                onChangeText: onDistance,
                onFocus: () => onBoxFocus('distance'),
                onBlur: () => {
                  saveNow();
                  onBoxBlur('distance');
                },
                keyboardType: 'decimal-pad',
                a11y: boxLabel(exName, which, { distance: distWord(shownDistUnit(distUnit)) }, units),
              })
            : null}

          {/* WEIGHT (+KG / ASSIST) */}
          {hasWeight(logType)
            ? box({
                inputRef: wRef,
                value: wText,
                hint: hints.weight,
                onChangeText: onWeight,
                onFocus: () => onBoxFocus('weight'),
                onBlur: () => {
                  saveNow();
                  onBoxBlur('weight');
                },
                keyboardType: 'decimal-pad',
                a11y: boxLabel(exName, which, weightBox, units),
              })
            : null}

          {/* REPS */}
          {hasReps(logType)
            ? box({
                inputRef: rRef,
                value: rText,
                hint: hints.reps,
                onChangeText: onReps,
                onFocus: () => onBoxFocus('reps'),
                onBlur: () => {
                  saveNow();
                  onBoxBlur('reps');
                },
                keyboardType: 'number-pad',
                a11y: boxLabel(exName, which, 'reps', units),
              })
            : null}

          {/* TIME */}
          {hasTime(logType)
            ? box({
                inputRef: tRef,
                value: tText,
                hint: hints.time,
                onChangeText: onTime,
                onFocus: () => {
                  setTFocused(true);
                  if (set.durationSec) setTText(durationDigits(set.durationSec));
                  onBoxFocus('time');
                },
                onBlur: () => {
                  saveNow();
                  onBoxBlur('time');
                  setTFocused(false);
                  setTText(set.durationSec ? fmtDuration(set.durationSec) : '');
                },
                keyboardType: 'number-pad',
                a11y: boxLabel(exName, which, 'time', units),
              })
            : null}

          {/* stopwatch / countdown (timed holds) */}
          {logType === 'time' && onOpenTimer ? (
            <Pressable
              onPress={() => {
                tap();
                onOpenTimer(set.key);
              }}
              disabled={done}
              hitSlop={{ top: 2, bottom: 2, left: touchSlop(L.checkW), right: touchSlop(L.checkW) }}
              accessibilityRole="button"
              accessibilityLabel={`Start the timer for ${who}`}
              style={{
                width: L.checkW,
                height: SET_ROW.height,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: color.surfaceRaised,
                borderWidth: 1,
                borderColor: color.border,
                opacity: done ? 0.4 : 1,
              }}
            >
              <Glyph name="timer" size={18} color={color.accent} />
            </Pressable>
          ) : null}

          {/* RPE (opt-in "Track RPE"; at every width since 13 Oct 2026) */}
          {rpeCell ? (
            <Pressable
              onPress={() => onOpenType(set.key)}
              hitSlop={{ top: 2, bottom: 2, left: touchSlop(L.rpeW), right: touchSlop(L.rpeW) }}
              disabled={set.isWarmup}
              accessibilityRole="button"
              accessibilityLabel={set.rpe != null ? `${who} RPE ${trimNum(set.rpe)}. Change` : `Add RPE for ${who}`}
              style={{ width: L.rpeW, height: SET_ROW.height, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: rpeColor(set.rpe) }}>
                {set.isWarmup ? '' : set.rpe != null ? trimNum(set.rpe) : '—'}
              </Text>
            </Pressable>
          ) : null}

          {/* ✓ complete — haptic on finger-DOWN */}
          <Pressable
            onPressIn={() => tap()}
            onPress={onTick}
            hitSlop={{ top: 2, bottom: 2, left: touchSlop(L.checkW), right: touchSlop(L.checkW) }}
            accessibilityRole="button"
            accessibilityState={{ checked: done }}
            accessibilityLabel={done ? `${who} complete. Tap to undo` : `Mark ${who} complete`}
            style={{
              width: L.checkW,
              height: SET_ROW.height,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: done ? color.good : color.surfaceRaised,
              borderWidth: 1,
              borderColor: done ? color.good : color.border,
            }}
          >
            <Icon name="check" size={20} color={done ? '#05140A' : color.inkMuted} />
          </Pressable>
        </Animated.View>

        {/* LW-13: what the tick is missing — one calm line under the row */}
        {note ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              paddingHorizontal: space.xs,
              paddingBottom: 4,
              textAlign: 'right',
              fontFamily: type.bodySemi,
              fontSize: type.size.sub,
              color: color.warning,
            }}
          >
            {note}
          </Text>
        ) : null}

        {/* D7: the gentle typo question — it never refuses */}
        {typo ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: space.sm,
              paddingHorizontal: space.xs,
              paddingBottom: 4,
            }}
          >
            <Text style={{ flex: 1, minWidth: 160, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
              {typo.text}
            </Text>
            <Pressable
              onPress={() => setTypo(null)}
              accessibilityRole="button"
              accessibilityLabel={`Keep ${typo.text.split(' — ')[0]}`}
              style={typoButton()}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>Keep</Text>
            </Pressable>
            <Pressable
              onPress={onFix}
              accessibilityRole="button"
              accessibilityLabel={typo.kind === 'weight' ? `Fix the weight of ${who}` : `Fix the reps of ${who}`}
              style={[typoButton(), { borderColor: color.accent }]}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Fix</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Swipeable>
  );
});

// Read when drawn: gym branding repaints the tokens.
const inputStyle = (fontSize: number) => ({
  width: '100%' as const,
  minHeight: SET_ROW.height,
  borderRadius: radius.sm,
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.border,
  textAlign: 'center' as const,
  fontFamily: type.monoBold,
  fontSize,
  color: color.ink,
  paddingVertical: 0,
  paddingHorizontal: 2,
});

// Read when drawn: gym branding repaints the tokens.
const prevStyle = () => ({ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }) as const;

const hintWrap = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 4,
};

// Read when drawn: gym branding repaints the tokens.
const hintStyle = () => ({
  fontFamily: type.monoBold,
  fontSize: type.size.body,
  color: color.inkFaint,
});

const typoButton = () => ({
  minHeight: 48,
  minWidth: 64,
  paddingHorizontal: space.md,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: color.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});
