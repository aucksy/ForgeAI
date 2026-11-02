/**
 * F186 (owner idea R-251): the guided first routine, four steps on one page:
 *   1. Name your folder ("My plan" ready to keep)   2. Name your routine (tap Push Day, … or type)
 *   3. Pick your exercises (THE exercise list, tick several)   4. Check and save.
 * Each step has one short hint under the title; "Skip" in the top bar is always there and hides
 * the guide for good (it asks first only when exercises are picked). The back arrow and the
 * phone's back go one step back; from step 1 they leave and the card stays for next time.
 * Rules and words: `tracker/lib/firstRoutine.ts`; the save: `tracker/services/firstRoutineGuide.ts`.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Pressable, Text, TextInput, View } from 'react-native';

import { Chip, PrimaryButton, Screen, askConfirm } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { goBack } from '@/lib/goBack';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';
import type { DayType } from '@/types/models';

import { ExercisePickerList } from '@/tracker/components/ExercisePickerList';
import type { TrackerExercise } from '@/tracker/db/exerciseInfo';
import {
  DEFAULT_FOLDER_NAME,
  NAME_MAX,
  ROUTINE_NAME_CHOICES,
  START_SETS,
  STEP_WORDS,
  canGoOn,
  cleanName,
  nextLabel,
  nextStep,
  prevStep,
  stepLabel,
  type GuideStep,
} from '@/tracker/lib/firstRoutine';
import { markGuideDone, saveFirstRoutine } from '@/tracker/services/firstRoutineGuide';
import { forgetWorkoutFolders } from '@/tracker/services/workoutFolders';
import { useFolderOpen } from '@/tracker/store/folderOpenStore';

const SAVE_FAILED = "Couldn't save your routine. Try again.";

/** The name fields (read when drawn, so a gym's colours repaint them). */
const fieldStyle = () => ({
  height: 52,
  paddingHorizontal: space.md,
  borderRadius: radius.md,
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.border,
  fontFamily: type.bodySemi,
  fontSize: type.size.body,
  color: color.ink,
});

export default function FirstRoutineScreen() {
  const router = useRouter();
  const [step, setStep] = useState<GuideStep>(1);
  const [folderName, setFolderName] = useState(DEFAULT_FOLDER_NAME);
  const [routineName, setRoutineName] = useState('');
  /** The day a tapped ready name means (cleared when the name is typed). */
  const [dayType, setDayType] = useState<DayType | null>(null);
  const [picked, setPicked] = useState<TrackerExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const state = { folderName, routineName, exerciseIds: picked.map((p) => p.id) };
  const ok = canGoOn(step, state);

  const leave = useCallback(() => goBack(router), [router]);

  /** One step back; from step 1, out of the guide (the card stays). */
  const back = useCallback((): void => {
    const p = prevStep(step);
    setError(null);
    if (p) setStep(p);
    else leave();
  }, [step, leave]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        back();
        return true;
      });
      return () => sub.remove();
    }, [back]),
  );

  const skip = async (): Promise<void> => {
    tap();
    if (picked.length > 0) {
      const sure = await askConfirm({
        title: 'Leave without saving?',
        body: 'Your routine is not saved yet. You can still make one any time with New routine.',
        confirmLabel: 'Leave',
        cancelLabel: 'Keep going',
      });
      if (!sure) return;
    }
    await markGuideDone();
    leave();
  };

  const save = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const { folderId } = await saveFirstRoutine({ folderName, routineName, dayType, exerciseIds: state.exerciseIds });
      forgetWorkoutFolders();
      useFolderOpen.getState().setOpen(folderId, true);
      leave();
    } catch (e) {
      console.warn('[first routine] the routine could not be saved', e);
      setError(SAVE_FAILED);
      busy.current = false;
      setSaving(false);
    }
  };

  const onNext = (): void => {
    if (!ok) return;
    tap();
    if (step === 4) {
      void save();
      return;
    }
    setStep(nextStep(step));
  };

  const togglePick = (ex: TrackerExercise): void => {
    setPicked((cur) => (cur.some((p) => p.id === ex.id) ? cur.filter((p) => p.id !== ex.id) : [...cur, ex]));
  };
  const isMarked = useCallback((ex: TrackerExercise) => picked.some((p) => p.id === ex.id), [picked]);

  const words = STEP_WORDS[step];
  const hint = (
    <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{words.hint}</Text>
  );
  const nextButton = (
    <PrimaryButton
      label={nextLabel(step, picked.length)}
      icon={step === 4 ? 'check' : undefined}
      disabled={!ok || saving}
      loading={saving}
      onPress={onNext}
    />
  );

  return (
    <Screen
      scroll={step !== 3}
      title={words.title}
      subtitle={stepLabel(step)}
      onBack={back}
      right={
        <Pressable
          onPress={() => void skip()}
          accessibilityRole="button"
          accessibilityLabel="Skip making a routine now"
          style={{ minHeight: 48, minWidth: 56, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Skip</Text>
        </Pressable>
      }
    >
      {step === 1 ? (
        <View style={{ gap: space.lg }}>
          {hint}
          <TextInput
            value={folderName}
            onChangeText={setFolderName}
            placeholder={DEFAULT_FOLDER_NAME}
            placeholderTextColor={color.inkMuted}
            maxLength={NAME_MAX}
            returnKeyType="next"
            onSubmitEditing={onNext}
            accessibilityLabel="Folder name"
            style={fieldStyle()}
          />
          {nextButton}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: space.lg }}>
          {hint}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {ROUTINE_NAME_CHOICES.map((c) => (
              <Chip
                key={c.label}
                label={c.label}
                role="radio"
                selected={cleanName(routineName) === c.label}
                onPress={() => {
                  setRoutineName(c.label);
                  setDayType(c.dayType);
                }}
              />
            ))}
          </View>
          <TextInput
            value={routineName}
            onChangeText={(t) => {
              setRoutineName(t);
              setDayType(ROUTINE_NAME_CHOICES.find((c) => c.label === cleanName(t))?.dayType ?? null);
            }}
            placeholder="Routine name, like Push Day"
            placeholderTextColor={color.inkMuted}
            maxLength={NAME_MAX}
            returnKeyType="next"
            onSubmitEditing={onNext}
            accessibilityLabel="Routine name"
            style={fieldStyle()}
          />
          {nextButton}
        </View>
      ) : null}

      {step === 3 ? (
        <>
          <View style={{ paddingBottom: space.sm }}>{hint}</View>
          <ExercisePickerList actionLabel="Select" markedLabel="Unselect" isMarked={isMarked} onSelect={togglePick} />
          <View style={{ paddingTop: space.sm }}>{nextButton}</View>
        </>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: space.lg }}>
          {hint}
          <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: space.md, gap: space.sm }}>
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
              {`Folder: ${cleanName(folderName)}`}
            </Text>
            <Text style={{ fontFamily: type.heading, fontSize: type.size.body, color: color.ink }}>{cleanName(routineName)}</Text>
            {picked.map((ex) => (
              <View key={ex.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, minHeight: 32 }}>
                <Text style={{ flexShrink: 1, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{ex.name}</Text>
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{`${START_SETS} sets`}</Text>
              </View>
            ))}
          </View>
          <InlineError message={error} />
          {nextButton}
        </View>
      ) : null}
    </Screen>
  );
}
