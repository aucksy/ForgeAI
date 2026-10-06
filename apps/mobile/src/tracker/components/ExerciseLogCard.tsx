/**
 * One exercise inside the active workout.
 *
 * Phase 1 — calmer, Hevy-style card:
 *  - ONE "more" button holds the occasional tools (note, rest timer, warm-up sets,
 *    plate calculator, superset, remove). The card body is just the exercise, its
 *    note, its rest time, the set table and "Add set".
 *  - The rest time sits beside the muscle tag; tap it to change it for this
 *    exercise (remembered for next time).
 *  - Notes carry forward from the last workout with this exercise.
 *  - Sets that beat the member's history get a medal as they are ticked.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import type { TextInput as TextInputType } from 'react-native';

import { Badge, GhostButton, Icon } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { getExerciseById } from '@/db/repos/exerciseRepo';
import { color, radius, space, type } from '@/theme/tokens';
import { columnHeads, LOAD_MODE_LABEL, LOAD_MODES, repsPerSide, weightIsEach } from '@/tracker/engine/logTypes';
import { targetBadge, targetFill, targetLine, type ProgressionTarget } from '@/tracker/engine/progression';

import { supersetLabel } from '../lib/superset';
import { liveRecordFlags } from '../services/liveRecords';
import { effectiveRestSec, fmtRest } from '../services/restRules';
import { computeWarmups } from '../services/warmupMath';
import { fillForSet, useActiveWorkout } from '../store/activeWorkoutStore';
import type { DraftExercise } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { ExerciseDemoSheet } from './ExerciseDemoSheet';
import { ExerciseThumb } from './ExerciseThumb';
import { HoldTimerSheet } from './HoldTimerSheet';
import { PlateCalcSheet } from './PlateCalcSheet';
import { RestPickerSheet } from './RestPickerSheet';
import { afterTick, SetRow } from './SetRow';
import { SetTypeSheet } from './SetTypeSheet';
import { SupersetSheet } from './SupersetSheet';
import { Glyph } from './TrackerGlyph';
import { SheetRow, TrackerSheet } from './TrackerSheet';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

// A word only when the weight changes — same words as the chat card.
const BADGE_TONE: Record<NonNullable<ReturnType<typeof targetBadge>>, BadgeProps['tone']> = {
  Up: 'accent',
  Lighter: 'warn',
};


type SheetName = 'menu' | 'rest' | 'plates' | 'superset' | 'counting' | 'demo' | null;

/** Dumbbell-style exercises get the "Counting" choice (how the typed weight counts). */
function hasCountingChoice(ex: Pick<DraftExercise, 'equipment' | 'logType' | 'loadMode'>): boolean {
  if ((ex.logType ?? 'weight_reps') !== 'weight_reps') return false;
  return ex.equipment !== 'barbell' || (ex.loadMode ?? 'one') !== 'one';
}

/**
 * Memoised: the store rebuilds only the edited exercise, so editing one card leaves
 * the others with identical props. Holds only while the caller keeps
 * `existingGroups` and `target` referentially stable (active.tsx does).
 */
export const ExerciseLogCard = memo(function ExerciseLogCard({
  exercise,
  existingGroups,
  target,
}: {
  exercise: DraftExercise;
  /** Distinct superset groups in the whole workout (for the chooser). */
  existingGroups: number[];
  /** Progressive-overload prescription for this exercise (v2 engine); null when
   *  the exercise isn't part of the plan day (Start-Empty / ad-hoc add). */
  target?: ProgressionTarget | null;
}) {
  const addSet = useActiveWorkout((s) => s.addSet);
  const removeExercise = useActiveWorkout((s) => s.removeExercise);
  const insertWarmupSets = useActiveWorkout((s) => s.insertWarmupSets);
  const setSupersetGroup = useActiveWorkout((s) => s.setSupersetGroup);
  const setExerciseNote = useActiveWorkout((s) => s.setExerciseNote);
  const setRestSec = useActiveWorkout((s) => s.setRestSec);
  const setSetType = useActiveWorkout((s) => s.setSetType);
  const setRpe = useActiveWorkout((s) => s.setRpe);
  const deleteSetWithUndo = useActiveWorkout((s) => s.deleteSetWithUndo);
  const setLoadMode = useActiveWorkout((s) => s.setLoadMode);
  const swapExercise = useActiveWorkout((s) => s.swapExercise);
  const completeTimedSet = useActiveWorkout((s) => s.completeTimedSet);
  const defaultRest = useRestTimer((s) => s.defaultSec);
  const showRpe = useTrackerPrefs((s) => s.advancedSets);

  const [sheet, setSheet] = useState<SheetName>(null);
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [timerFor, setTimerFor] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  // Phase 2: how this exercise is logged and counted (older drafts: weight × reps, as typed).
  const logType = exercise.logType ?? 'weight_reps';
  const loadMode = exercise.loadMode ?? 'one';
  const distUnit = exercise.distUnit ?? 'km';
  const heads = columnHeads(logType, loadMode, distUnit);

  // Two RN Modals swapping in the same frame can drop the second on Android —
  // let the first finish sliding out.
  const openAfterMenu = (next: SheetName): void => {
    setSheet(null);
    setTimeout(() => setSheet(next), 260);
  };

  const group = exercise.supersetGroup ?? null;
  const otherGroups = existingGroups.filter((g) => g !== group);
  const nextGroup = (existingGroups.length > 0 ? Math.max(...existingGroups) : 0) + 1;

  // Note — local text (pushed to the store), synced back on external change.
  const noteRef = useRef<TextInputType>(null);
  const [noteText, setNoteText] = useState(exercise.note ?? '');
  const [noteOpen, setNoteOpen] = useState(!!exercise.note?.trim());
  useEffect(() => {
    if ((exercise.note ?? '') !== noteText) setNoteText(exercise.note ?? '');
    if (exercise.note?.trim()) setNoteOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.note]);

  // Target weight + rep goal for the set rows' hints (null off-plan). Memoised so the
  // rows (and SetRow's memo) keep identity while the target is unchanged.
  const fillTarget = useMemo(() => (target ? targetFill(target) : null), [target]);
  // The Target line says "each" / "per side" when the columns do.
  const line = target
    ? targetLine({ ...target, each: weightIsEach(loadMode), perSide: repsPerSide(loadMode) })
    : null;

  // Working weight = first entered working set, else today's Target, else last session's first working set.
  const firstWorking = exercise.sets.find((s) => !s.isWarmup && s.weightKg != null);
  const workingWeight = firstWorking?.weightKg ?? fillTarget?.weightKg ?? exercise.previousSets[0]?.weightKg ?? null;

  const restSec = effectiveRestSec(exercise, defaultRest);
  const restIsCustom = exercise.restSec != null;

  // Per-row derived values, memoised on the exercise object (rebuilt only on edit).
  const rows = useMemo(() => {
    const flags = liveRecordFlags(exercise);
    let working = 0;
    return exercise.sets.map((s) => {
      // PREVIOUS aligns by WORKING-set ordinal (previousSets excludes warm-ups),
      // matching prevForSet() in the store so display + auto-fill agree.
      let label: string;
      let previous: DraftExercise['previousSets'][number] | null;
      if (s.isWarmup) {
        label = 'W';
        previous = null;
      } else {
        previous = exercise.previousSets[working] ?? null;
        label = String(working + 1);
        working += 1;
      }
      return { set: s, label, previous, fill: fillForSet(exercise, s.key, fillTarget), record: flags.get(s.key) ?? null };
    });
  }, [exercise, fillTarget]);

  const onOpenType = useCallback((setKey: string) => setTypeFor(setKey), []);
  const onOpenTimer = useCallback((setKey: string) => setTimerFor(setKey), []);
  const typeSet = typeFor ? exercise.sets.find((s) => s.key === typeFor) ?? null : null;
  const timerRow = timerFor ? rows.find((r) => r.set.key === timerFor) ?? null : null;
  const timerGoal = timerRow ? timerRow.set.durationSec ?? timerRow.fill?.durationSec ?? null : null;

  // "Try a harder / easier version": switch this card to the linked exercise, while
  // nothing has been ticked yet (logged sets stay with the exercise they were done on).
  const version = target?.version ?? null;
  const canSwitch = version?.id != null && !exercise.sets.some((s) => s.done);
  const onSwitch = async (): Promise<void> => {
    if (!version?.id) return;
    const next = await getExerciseById(version.id).catch(() => null);
    if (!next) {
      Alert.alert('Not in your library', `${version.name} is not in your exercise library.`);
      return;
    }
    const ok = await swapExercise(exercise.key, next);
    if (!ok) Alert.alert('Already started', 'Finish this exercise as it is. Try the other version next time.');
  };

  const confirmRemove = (): void => {
    Alert.alert('Remove exercise?', `Remove ${exercise.name} and its sets from this workout.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeExercise(exercise.key) },
    ]);
  };

  const onWarmup = (): void => {
    if (workingWeight == null || workingWeight <= 0) {
      Alert.alert('Set a working weight first', 'Enter a weight on a working set, then add warm-up sets.');
      return;
    }
    const w = computeWarmups(workingWeight, exercise.incrementKg ?? 2.5);
    if (w.length > 0) insertWarmupSets(exercise.key, w);
  };

  const onNote = (t: string): void => {
    setNoteText(t);
    setExerciseNote(exercise.key, t);
  };

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: color.border,
        borderLeftWidth: group != null ? 3 : 1,
        borderLeftColor: group != null ? color.accent : color.border,
        padding: space.lg,
        gap: space.sm,
      }}
    >
      {/* header — the small picture opens the moving demo (never autoplays here) */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <ExerciseThumb
          catalogKey={exercise.catalogKey ?? null}
          name={exercise.name}
          size={44}
          media={{ uri: exercise.mediaUri ?? null, type: exercise.mediaType ?? null }}
          onPress={() => setSheet('demo')}
        />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            {exercise.name}
          </Text>
          <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Badge label={exercise.muscleLabel ?? cap(exercise.muscleGroup)} tone="accent" />
            {group != null ? (
              <Pressable onPress={() => setSheet('superset')} accessibilityRole="button" accessibilityLabel="Edit superset">
                <Badge label={`Superset ${supersetLabel(group)}`} tone="neutral" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setSheet('rest')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={restSec > 0 ? `Rest timer ${fmtRest(restSec)}. Change` : 'Rest timer off. Change'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Icon name="clock" size={13} color={restIsCustom ? color.accent : color.inkMuted} />
              <Text
                style={{
                  fontFamily: type.bodySemi,
                  fontSize: type.size.caption,
                  color: restIsCustom ? color.accent : color.inkMuted,
                }}
              >
                {restSec > 0 ? fmtRest(restSec) : 'Off'}
              </Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={() => setSheet('menu')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`More for ${exercise.name}`}
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: color.surfaceRaised,
            borderWidth: 1,
            borderColor: color.border,
          }}
        >
          <Glyph name="more" size={20} color={color.inkSecondary} />
        </Pressable>
      </View>

      {/* note — carries forward to the next workout with this exercise */}
      {noteOpen ? (
        <TextInput
          ref={noteRef}
          value={noteText}
          onChangeText={onNote}
          onBlur={() => {
            if (!noteText.trim()) setNoteOpen(false);
          }}
          placeholder="Note, e.g. seat height 6"
          placeholderTextColor={color.inkFaint}
          multiline
          accessibilityLabel={`Note for ${exercise.name}`}
          style={{
            minHeight: 36,
            borderRadius: radius.sm,
            backgroundColor: color.surfaceSunken,
            borderWidth: 1,
            borderColor: color.border,
            paddingHorizontal: space.md,
            paddingTop: 8,
            paddingBottom: 8,
            fontFamily: type.body,
            fontSize: type.size.sub,
            color: color.inkSecondary,
          }}
        />
      ) : null}

      {/* coach target (Phase C1) — inline prescription, tap for the why */}
      {target && line ? (
        <Pressable
          onPress={() => setShowWhy((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Target ${line}. Tap for why.`}
          style={{
            gap: 4,
            borderRadius: radius.sm,
            backgroundColor: color.surfaceSunken,
            borderWidth: 1,
            borderColor: color.border,
            paddingHorizontal: space.md,
            paddingVertical: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Icon name="target" size={14} color={color.accentBright} />
            <Text
              style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accentBright }}
              numberOfLines={1}
            >
              {line}
            </Text>
            {targetBadge(target) ? (
              <Badge label={targetBadge(target)!} tone={BADGE_TONE[targetBadge(target)!]} />
            ) : null}
            <Glyph name="info" size={16} color={showWhy ? color.accent : color.inkMuted} />
          </View>
          {showWhy && target.reason ? (
            <Text
              style={{
                fontFamily: type.body,
                fontSize: type.size.sub,
                fontStyle: 'italic',
                color: color.inkSecondary,
                lineHeight: 18,
              }}
            >
              {target.reason}
            </Text>
          ) : null}
          {showWhy && version && canSwitch ? (
            <Pressable
              onPress={() => void onSwitch()}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${version.name}`}
              style={{
                marginTop: 4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                alignSelf: 'flex-start',
                paddingHorizontal: space.md,
                height: 34,
                borderRadius: radius.pill,
                backgroundColor: color.accentSoft,
              }}
            >
              <Glyph name="swap" size={16} color={color.accent} />
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
                Switch to {version.name}
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      ) : null}

      {/* column header — the words say what to type ("KG EACH" = one dumbbell) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs }}>
        <Text style={[colHead, { width: 34, textAlign: 'center' }]}>SET</Text>
        <Text style={[colHead, { width: 70 }]}>PREVIOUS</Text>
        {heads.distance ? <Text style={[colHead, { flex: 1, textAlign: 'center' }]}>{heads.distance}</Text> : null}
        {heads.weight ? (
          <Text numberOfLines={1} style={[colHead, { flex: 1, textAlign: 'center' }]}>
            {heads.weight}
          </Text>
        ) : null}
        {heads.reps ? (
          <Text numberOfLines={1} style={[colHead, { flex: 1, textAlign: 'center' }]}>
            {heads.reps}
          </Text>
        ) : null}
        {heads.time ? <Text style={[colHead, { flex: 1, textAlign: 'center' }]}>{heads.time}</Text> : null}
        {logType === 'time' ? <View style={{ width: 34 }} /> : null}
        {showRpe ? <Text style={[colHead, { width: 38, textAlign: 'center' }]}>RPE</Text> : null}
        <View style={{ width: 34 }} />
      </View>

      {rows.map((r) => (
        <SetRow
          key={r.set.key}
          exKey={exercise.key}
          set={r.set}
          label={r.label}
          previous={r.previous}
          fill={r.fill}
          record={r.record}
          onOpenType={onOpenType}
          logType={logType}
          distUnit={distUnit}
          onOpenTimer={logType === 'time' ? onOpenTimer : undefined}
        />
      ))}

      <View style={{ marginTop: space.xs }}>
        <GhostButton label="Add set" icon="plus" onPress={() => addSet(exercise.key)} />
      </View>

      {/* ---- sheets ---- */}
      <TrackerSheet visible={sheet === 'menu'} title={exercise.name} onClose={() => setSheet(null)}>
        <View style={{ gap: 2 }}>
          <SheetRow
            label={noteOpen ? 'Edit note' : 'Add note'}
            leading={<Glyph name="pencil" size={20} color={color.accent} />}
            onPress={() => {
              setSheet(null);
              setNoteOpen(true);
              setTimeout(() => noteRef.current?.focus(), 300);
            }}
          />
          <SheetRow
            label="Rest timer"
            value={restSec > 0 ? fmtRest(restSec) : 'Off'}
            leading={<Icon name="clock" size={20} color={color.accent} />}
            onPress={() => openAfterMenu('rest')}
          />
          {logType === 'weight_reps' ? (
            <SheetRow
              label="Add warm-up sets"
              leading={<Icon name="flame" size={20} color={color.accent} />}
              onPress={() => {
                setSheet(null);
                onWarmup();
              }}
            />
          ) : null}
          {hasCountingChoice(exercise) ? (
            <SheetRow
              label="Counting"
              value={LOAD_MODE_LABEL[loadMode].title}
              leading={<Glyph name="scale-split" size={20} color={color.accent} />}
              onPress={() => openAfterMenu('counting')}
            />
          ) : null}
          {exercise.equipment === 'barbell' && logType === 'weight_reps' ? (
            <SheetRow
              label="Plate calculator"
              leading={<Icon name="scale" size={20} color={color.accent} />}
              onPress={() => openAfterMenu('plates')}
            />
          ) : null}
          <SheetRow
            label="Superset"
            value={group != null ? supersetLabel(group) : undefined}
            leading={<Icon name="zap" size={20} color={color.accent} />}
            onPress={() => openAfterMenu('superset')}
          />
          <SheetRow
            label="Remove exercise"
            danger
            leading={<Glyph name="trash" size={20} color={color.criticalText} />}
            onPress={() => {
              setSheet(null);
              setTimeout(confirmRemove, 260);
            }}
          />
        </View>
      </TrackerSheet>

      <RestPickerSheet
        visible={sheet === 'rest'}
        title="Rest timer"
        subtitle={`For ${exercise.name}. Remembered for next time.`}
        value={exercise.restSec ?? null}
        defaultSec={defaultRest}
        onChoose={(sec) => {
          setRestSec(exercise.key, sec);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <PlateCalcSheet visible={sheet === 'plates'} initialKg={workingWeight ?? 0} onClose={() => setSheet(null)} />
      <SupersetSheet
        visible={sheet === 'superset'}
        currentGroup={group}
        otherGroups={otherGroups}
        nextGroup={nextGroup}
        onChoose={(g) => {
          setSupersetGroup(exercise.key, g);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <SetTypeSheet
        visible={typeSet != null}
        set={typeSet}
        showRpe={showRpe}
        onType={(t) => {
          if (typeSet) setSetType(exercise.key, typeSet.key, t);
          // With RPE on, stay open so effort can be set in the same visit.
          if (!showRpe || t === 'warmup') setTypeFor(null);
        }}
        onRpe={(v) => {
          if (typeSet) setRpe(exercise.key, typeSet.key, v);
        }}
        onRemove={() => {
          if (typeSet) deleteSetWithUndo(exercise.key, typeSet.key);
          setTypeFor(null);
        }}
        onClose={() => setTypeFor(null)}
      />

      {/* Counting — what the typed weight means (Hevy's top complaint). */}
      <TrackerSheet
        visible={sheet === 'counting'}
        title="Counting"
        subtitle={`How ${exercise.name} is typed and counted from now on. Past workouts keep theirs.`}
        onClose={() => setSheet(null)}
      >
        <View style={{ gap: 2 }}>
          {LOAD_MODES.map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setLoadMode(exercise.key, m);
                setSheet(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: m === loadMode }}
              accessibilityLabel={`${LOAD_MODE_LABEL[m].title}. ${LOAD_MODE_LABEL[m].detail}`}
              style={{
                paddingVertical: space.sm,
                paddingHorizontal: space.md,
                borderRadius: radius.md,
                backgroundColor: m === loadMode ? color.accentSoft : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily: type.bodySemi,
                  fontSize: type.size.body,
                  color: m === loadMode ? color.accent : color.ink,
                }}
              >
                {LOAD_MODE_LABEL[m].title}
              </Text>
              <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 2 }}>
                {LOAD_MODE_LABEL[m].detail}
              </Text>
            </Pressable>
          ))}
        </View>
      </TrackerSheet>

      <HoldTimerSheet
        visible={timerRow != null}
        title={`${exercise.name} · ${timerRow?.label === 'W' ? 'Warm-up' : `Set ${timerRow?.label ?? ''}`}`}
        goalSec={timerGoal}
        onSave={(sec) => {
          const key = timerFor;
          setTimerFor(null);
          if (!key) return;
          completeTimedSet(exercise.key, key, sec);
          afterTick(exercise.key, key);
        }}
        onClose={() => setTimerFor(null)}
      />

      <ExerciseDemoSheet
        visible={sheet === 'demo'}
        catalogKey={exercise.catalogKey ?? null}
        name={exercise.name}
        media={{ uri: exercise.mediaUri ?? null, type: exercise.mediaType ?? null }}
        onClose={() => setSheet(null)}
      />
    </View>
  );
});

const colHead = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 0.4,
} as const;
