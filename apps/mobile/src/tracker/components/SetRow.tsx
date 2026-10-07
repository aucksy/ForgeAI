/**
 * One editable set row: SET · PREVIOUS · (inputs for this exercise's type) · (RPE) · ✓.
 *
 * Phase 1 (Hevy parity, calmer screen):
 *  - Tapping the SET number opens the set-type sheet (warm-up / drop / failure /
 *    remove). The old always-visible second row of chips is gone.
 *  - "Track RPE" adds one narrow RPE cell, coloured by effort; tap it for the sheet.
 *  - Empty inputs show a grey hint — last workout's numbers, or for an extra set
 *    the set above — and ticking fills it in.
 *  - Ticking a set: decides the rest timer (per-exercise length, no rest before a
 *    drop set, supersets rest per round) and announces a new record on the spot.
 *
 * Phase 2 — the inputs follow the exercise's type (engine/logTypes):
 *   weight × reps: KG · REPS        bodyweight: REPS        weighted: +KG · REPS
 *   assisted: ASSIST · REPS         time: TIME + a stopwatch button
 *   distance: KM (or M)             distance + time: KM · TIME
 * A TIME cell reads digits like a microwave ("130" = 1:30) because a number pad has
 * no colon; it shows the tidy "1:30" once you leave it.
 *
 * The ✓ fires its haptic on finger-DOWN (house rule).
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Icon } from '@/components/ui';
import { success, tap } from '@/lib/haptics';
import { trimNum } from '@/lib/format';
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
  type DistUnit,
  type LogType,
} from '../engine/logTypes';
import { rpeColor } from '../lib/rpe';
import { liveRecordHits, recordLabel } from '../services/liveRecords';
import type { RecordKind } from '../services/liveRecords';
import { afterSetCompleted } from '../services/restRules';
import { playWorkoutSound } from '../services/workoutSounds';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import type { DraftSet, PrevSet, SetFill } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { useWorkoutUi } from '../store/workoutUiStore';
import { Glyph } from './TrackerGlyph';

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
}

function parseNum(text: string, integer: boolean): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = integer ? parseInt(t, 10) : parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

/** What the PREVIOUS cell says for last time's set. PURE (exported for tests). */
export function prevLabel(p: PrevSet | null, lt: LogType, unit: DistUnit): string {
  if (!p) return '—';
  switch (lt) {
    case 'reps':
      return p.weightKg ? `+${trimNum(p.weightKg)} × ${p.reps}` : `${p.reps} reps`;
    case 'weighted':
      return p.weightKg > 0 ? `+${trimNum(p.weightKg)} × ${p.reps}` : `${p.reps} reps`;
    case 'assisted':
      return `${trimNum(p.weightKg)} × ${p.reps}`;
    case 'time':
      return p.durationSec ? fmtDuration(p.durationSec) : '—';
    case 'distance':
      return p.distanceM ? `${trimNum(distanceToUnit(p.distanceM, unit))} ${unit}` : '—';
    case 'time_distance': {
      const d = p.distanceM ? trimNum(distanceToUnit(p.distanceM, unit)) : '';
      const t = p.durationSec ? fmtDuration(p.durationSec) : '';
      return d && t ? `${d} · ${t}` : d || t || '—';
    }
    default:
      return `${trimNum(p.weightKg)} × ${p.reps}`;
  }
}

/** After a tick lands in the store: record alert + rest timer + superset hand-off. */
export function afterTick(exKey: string, setKey: string): void {
  const st = useActiveWorkout.getState();
  if (st.editingSessionId) return; // correcting a past workout — no timers, no fanfare
  const ex = st.exercises.find((e) => e.key === exKey);
  const done = ex?.sets.find((s) => s.key === setKey);
  if (!ex || !done?.done) return; // a blank set with nothing to fill stays unticked

  const hit = liveRecordHits(ex).get(setKey);
  if (hit) {
    success();
    playWorkoutSound('record');
    useWorkoutUi
      .getState()
      .showRecord(ex.name, recordLabel(hit, { logType: ex.logType ?? 'weight_reps', loadMode: ex.loadMode ?? 'one', distUnit: ex.distUnit ?? 'km' }));
  }

  const timer = useRestTimer.getState();
  const d = afterSetCompleted(st.exercises, exKey, setKey, timer.defaultSec);
  const nextName = st.exercises.find((e) => e.key === (d.nextExKey ?? exKey))?.name ?? null;
  if (d.restSec) timer.start(d.restSec, nextName);
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
}: SetRowProps) {
  const updateSet = useActiveWorkout((s) => s.updateSet);
  const toggleDone = useActiveWorkout((s) => s.toggleDone);
  const deleteSetWithUndo = useActiveWorkout((s) => s.deleteSetWithUndo);
  const showRpe = useTrackerPrefs((s) => s.advancedSets);

  const [wText, setWText] = useState(set.weightKg == null ? '' : String(set.weightKg));
  const [rText, setRText] = useState(set.reps == null ? '' : String(set.reps));
  const [tText, setTText] = useState(set.durationSec ? fmtDuration(set.durationSec) : '');
  const [dText, setDText] = useState(set.distanceM ? String(distanceToUnit(set.distanceM, distUnit)) : '');
  const [tFocused, setTFocused] = useState(false);

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
  }, [set.distanceM]);

  const onWeight = (t: string): void => {
    setWText(t);
    updateSet(exKey, set.key, { weightKg: parseNum(t, false) });
  };
  const onReps = (t: string): void => {
    setRText(t);
    updateSet(exKey, set.key, { reps: parseNum(t, true) });
  };
  const onTime = (t: string): void => {
    const digits = t.replace(/[^\d:]/g, '');
    setTText(digits);
    updateSet(exKey, set.key, { durationSec: parseDuration(digits) });
  };
  const onDistance = (t: string): void => {
    setDText(t);
    const v = parseNum(t, false);
    updateSet(exKey, set.key, { distanceM: v == null ? null : distanceFromUnit(v, distUnit) });
  };

  const prevText = prevLabel(previous, logType, distUnit);
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
  const which = `${typeName.toLowerCase()} ${label}`;
  const weightName = logType === 'assisted' ? 'Assistance in kilograms' : logType === 'weighted' ? 'Added weight in kilograms' : 'Weight in kilograms';

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
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: '#FFFFFF' }}>Delete</Text>
        </Pressable>
      )}
      overshootRight={false}
      rightThreshold={40}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingVertical: 6,
          paddingHorizontal: space.xs,
          borderRadius: radius.sm,
          backgroundColor: rowBg,
        }}
      >
        {/* SET cell — tap for the set-type sheet */}
        <Pressable
          onPress={() => {
            tap();
            onOpenType(set.key);
          }}
          hitSlop={6}
          style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel={`${typeName} ${set.isWarmup ? '' : label}. Change set type`}
        >
          <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: setGlyphColor }}>{setGlyph}</Text>
          {record ? (
            <View style={{ position: 'absolute', top: -2, right: -4 }} accessibilityElementsHidden>
              <Glyph name="medal" size={14} color={color.accentBright} />
            </View>
          ) : null}
        </Pressable>

        {/* PREVIOUS */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ width: 70, fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted }}
        >
          {prevText}
        </Text>

        {/* DISTANCE */}
        {hasDistance(logType) ? (
          <TextInput
            value={dText}
            onChangeText={onDistance}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder={fill?.distanceM ? String(distanceToUnit(fill.distanceM, distUnit)) : '—'}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel={`Distance in ${distUnit === 'km' ? 'kilometres' : 'metres'}, ${which}`}
            style={inputStyle}
          />
        ) : null}

        {/* WEIGHT (+KG / ASSIST) */}
        {hasWeight(logType) ? (
          <TextInput
            value={wText}
            onChangeText={onWeight}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder={fill && (logType === 'weight_reps' || fill.weightKg) ? trimNum(fill.weightKg) : '—'}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel={`${weightName}, ${which}`}
            style={inputStyle}
          />
        ) : null}

        {/* REPS */}
        {hasReps(logType) ? (
          <TextInput
            value={rText}
            onChangeText={onReps}
            keyboardType="number-pad"
            selectTextOnFocus
            placeholder={fill && fill.reps > 0 ? String(fill.reps) : '—'}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel={`Reps, ${which}`}
            style={inputStyle}
          />
        ) : null}

        {/* TIME */}
        {hasTime(logType) ? (
          <TextInput
            value={tText}
            onChangeText={onTime}
            onFocus={() => {
              setTFocused(true);
              if (set.durationSec) setTText(durationDigits(set.durationSec));
            }}
            onBlur={() => {
              setTFocused(false);
              setTText(set.durationSec ? fmtDuration(set.durationSec) : '');
            }}
            keyboardType="number-pad"
            selectTextOnFocus
            placeholder={fill?.durationSec ? fmtDuration(fill.durationSec) : '0:00'}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel={`Time, minutes and seconds, ${which}`}
            style={inputStyle}
          />
        ) : null}

        {/* stopwatch / countdown (timed holds) */}
        {logType === 'time' && onOpenTimer ? (
          <Pressable
            onPress={() => {
              tap();
              onOpenTimer(set.key);
            }}
            disabled={done}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Start the timer for ${which}`}
            style={{
              width: 34,
              height: 34,
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

        {/* RPE (opt-in) */}
        {showRpe ? (
          <Pressable
            onPress={() => onOpenType(set.key)}
            hitSlop={4}
            disabled={set.isWarmup}
            accessibilityRole="button"
            accessibilityLabel={set.rpe != null ? `RPE ${set.rpe}. Change` : 'Add RPE'}
            style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: rpeColor(set.rpe) }}>
              {set.isWarmup ? '' : set.rpe != null ? trimNum(set.rpe) : '—'}
            </Text>
          </Pressable>
        ) : null}

        {/* ✓ complete — haptic on finger-DOWN */}
        <Pressable
          onPressIn={() => tap()}
          onPress={() => {
            const wasDone = set.done;
            toggleDone(exKey, set.key, fill);
            if (!wasDone) afterTick(exKey, set.key);
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
    </Swipeable>
  );
});

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
