/**
 * The workout settings, one short card per Settings page (Release A, A8, docs/ux/MEMBER-APP-MAP.md
 * §3.3). Until Release A they were ONE card of 14 rows on Settings → Workouts, doing four jobs; the
 * Settings page's "Workouts" group now opens each job on its own page:
 *
 *  - Weekly goal            → `WeeklyGoalCard`   (Off, 1–7 workouts a week; a − N + stepper: eight
 *    round chips wrapped at large text, and squeezed into one row they were under 48 dp each);
 *  - Rest timer and sounds  → `RestPrefsCard`    (default rest, workout sounds, rest-over sound, ring
 *    through Do Not Disturb, the "In use" screen after each set, the rest-alert check);
 *  - How the app picks your next weight → `NextWeightCard` (weight step, reps to aim for, easy weeks
 *    of the plan you follow; the folder menu keeps its own Easy weeks shortcut);
 *  - Last time's numbers    → `LastTimeCard`     (where Previous, the Target and notes come from);
 *  - Rate how hard each set felt → `EffortCard`  (the effort column; AI coach notes while the coach is on);
 *  - Muscle tips            → `MuscleTipsCard`   (the Up next tips, and the muscles you asked to skip).
 * Plates and bars keeps its own page (`app/settings/plates.tsx`).
 *
 * Every setting keeps its store and its key, so nothing a member set is lost by the move.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card, Icon, SheetRow } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { tell } from '@/lib/tell';
import { color, radius, space, type } from '@/theme/tokens';

import { BODY_WEIGHT_SWITCH, PREVIOUS_FROM_CHOICES } from '../db/historyScope';
import { followedFolder } from '../db/folderRepo';
import { GROUP_WORDS } from '../engine/muscleBalance';
import { putAwayGroups, useMuscleTips } from '../store/muscleTipsStore';
import { refreshWidgets } from '../phone/widgets';
import { REST_SOUND_CHOICES, restSoundFootnote } from '../services/restSounds';
import { previewRestSound } from '../services/workoutSounds';
import { fmtRest } from '../services/restRules';
import { setEasyWeeks } from '../services/planState';
import {
  choiceDetail,
  choiceLabel,
  REP_RANGE_CHOICES,
  REP_RANGE_HELP,
  REP_RANGE_KEEP,
  WEIGHT_JUMP_CHOICES,
  WEIGHT_JUMP_HELP,
} from '../services/targetChoices';
import { useRestAlertPrefs } from '../store/restAlertPrefsStore';
import { useRestTimer } from '../store/restTimerStore';
import { stepWeeklyGoal, useTrackerPrefs } from '../store/trackerPrefsStore';
import { PrefChoiceSheet } from './PrefChoiceSheet';
import { RestAlertsStatusRow } from './RestAlertsStatusRow';
import { RestPickerSheet } from './RestPickerSheet';

/** The plain line under a section. Read when drawn: gym branding repaints the tokens. */
const SECTION_LINE = () => ({ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs, lineHeight: 17 }) as const;

/** The chosen value on the right of a row that opens a sheet. Read when drawn: gym branding repaints the tokens. */
const ROW_VALUE = () => ({ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent, maxWidth: 140, textAlign: 'right' }) as const;

/** The stepper's − and + : 48 dp round, dimmed (and inert) at the end of the range. */
function StepButton({ sign, label, disabled, onPress }: { sign: '−' | '+'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.borderStrong,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {sign === '+' ? (
        <Icon name="plus" size={20} color={color.ink} />
      ) : (
        <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: color.ink }} />
      )}
    </Pressable>
  );
}

/** Weekly goal: [−]  3 a week  [+]. Off when below 1. */
function WeeklyGoalStepper({ goal, onChange }: { goal: number | null; onChange: (next: number | null) => void }) {
  const spoken = goal ? `${goal} ${goal === 1 ? 'workout' : 'workouts'} a week` : 'Off';
  const down = () => onChange(stepWeeklyGoal(goal, -1));
  const up = () => onChange(stepWeeklyGoal(goal, 1));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <StepButton sign="−" label="Fewer workouts a week" disabled={goal == null} onPress={down} />
      <View
        accessible
        accessibilityRole="adjustable"
        // Not "Weekly goal": phone tests find the page's title by that exact text.
        accessibilityLabel="Workouts a week"
        accessibilityValue={{ text: spoken }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') up();
          else if (e.nativeEvent.actionName === 'decrement') down();
        }}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: space.xs }}
      >
        {/* Its own Text, so a phone test can find the number alone ("^3$", "^Off$"). */}
        <Text numberOfLines={1} style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: goal ? color.ink : color.inkSecondary }}>
          {goal ? String(goal) : 'Off'}
        </Text>
        {goal ? (
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
            a week
          </Text>
        ) : null}
      </View>
      <StepButton sign="+" label="More workouts a week" disabled={goal === 7} onPress={up} />
    </View>
  );
}

/** Settings → Weekly goal: the member's own workouts-a-week goal (Up next on the Workout tab, the widget). */
export function WeeklyGoalCard() {
  const weeklyGoal = useTrackerPrefs((s) => s.weeklyGoal);
  const setWeeklyGoal = useTrackerPrefs((s) => s.setWeeklyGoal);
  return (
    <Card style={{ paddingVertical: space.md }}>
      <WeeklyGoalStepper
        goal={weeklyGoal}
        onChange={(next) => {
          setWeeklyGoal(next);
          void refreshWidgets();
        }}
      />
      <Text style={SECTION_LINE()}>Workouts a week. The Workout tab shows how many are left.</Text>
    </Card>
  );
}

/**
 * Settings → Rest timer and sounds. Phase 2, packet D: "Rest alerts: …" (are rest alerts on time? one
 * tap fixes it), the optional "Ring through Do Not Disturb" (Android only, off by default, RT-12), and a
 * default rest that could not be saved says so (RT-11). R-55: the rest-over sound. R-70: "In use".
 */
export function RestPrefsCard() {
  const sounds = useTrackerPrefs((s) => s.sounds);
  const setSounds = useTrackerPrefs((s) => s.setSounds);
  const restSound = useTrackerPrefs((s) => s.restSound);
  const setRestSound = useTrackerPrefs((s) => s.setRestSound);
  const restSoundLabel = choiceLabel(REST_SOUND_CHOICES, restSound);
  const inUseAfterSet = useTrackerPrefs((s) => s.inUseAfterSet);
  const setInUseAfterSet = useTrackerPrefs((s) => s.setInUseAfterSet);
  const defaultSec = useRestTimer((s) => s.defaultSec);
  const setDefaultSec = useRestTimer((s) => s.setDefaultSec);
  const loadDefault = useRestTimer((s) => s.loadDefault);
  const ringThroughDnd = useRestAlertPrefs((s) => s.ringThroughDnd);
  const setRingThroughDnd = useRestAlertPrefs((s) => s.setRingThroughDnd);
  const watchOpen = useRestAlertPrefs((s) => s.watchOpen);
  const setWatchOpen = useRestAlertPrefs((s) => s.setWatchOpen);
  const [picking, setPicking] = useState(false);
  const [choosingSound, setChoosingSound] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadDefault().catch((e: unknown) => console.warn('[settings] default rest could not be read', e));
  }, [loadDefault]);

  return (
    <Card style={{ paddingVertical: space.xs }}>
      <Pressable
        onPress={() => setPicking(true)}
        accessibilityRole="button"
        accessibilityLabel={`Default rest, ${defaultSec > 0 ? fmtRest(defaultSec) : 'off'}. Change`}
      >
        <SettingRow
          icon="clock"
          title="Default rest"
          caption="Starts when you tick a set. Change it per exercise from the exercise's menu."
          right={<Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.accent }}>{defaultSec > 0 ? fmtRest(defaultSec) : 'Off'}</Text>}
        />
      </Pressable>
      <ToggleRow
        icon="volume"
        title="Workout sounds"
        caption="A bell when rest is over, a chime for a new record"
        value={sounds}
        onChange={setSounds}
        divider
      />
      {/* R-55 (owner backlog): which sound "Rest is over" plays, in the app and with the screen off. */}
      <Pressable onPress={() => setChoosingSound(true)} accessibilityRole="button" accessibilityLabel={`Rest-over sound, ${restSoundLabel}. Change`}>
        <SettingRow
          icon="volume"
          title="Rest-over sound"
          caption={sounds ? "Tell your rest from a gym friend's" : 'Workout sounds are off: Rest is over only buzzes'}
          right={
            <Text numberOfLines={2} style={ROW_VALUE()}>
              {restSoundLabel}
            </Text>
          }
          divider
        />
      </Pressable>
      {Platform.OS === 'android' ? (
        <ToggleRow
          icon="volume"
          title="Ring through Do Not Disturb"
          caption="Rest is over still rings while Do Not Disturb is on"
          value={ringThroughDnd}
          onChange={setRingThroughDnd}
          divider
        />
      ) : null}
      {/* 29 Oct 2026: starting a workout opens MettleUp on a Wear OS watch (watchOpen.ts). */}
      {Platform.OS === 'android' ? (
        <ToggleRow
          icon="clock"
          title="Open MettleUp on my watch"
          caption="When you start a workout, your watch opens MettleUp too"
          value={watchOpen}
          onChange={setWatchOpen}
          divider
        />
      ) : null}
      <RestAlertsStatusRow divider />
      {/* R-70 (owner, 22 Oct 2026): "In use" opens by itself when a set's rest starts. */}
      <ToggleRow
        icon="clock"
        title={'Show "In use" screen after each set'}
        caption="When rest starts, a big IN USE screen with the rest clock, so others know you are coming back"
        value={inUseAfterSet}
        onChange={setInUseAfterSet}
        divider
      />
      {/* Stays open after a tap, so each sound can be heard in turn. */}
      <PrefChoiceSheet
        visible={choosingSound}
        title="Rest-over sound"
        subtitle="The sound when your rest is over. The MettleUp chime is the default."
        footnote={restSoundFootnote(sounds)}
        choices={REST_SOUND_CHOICES}
        value={restSound}
        onChoose={(v) => {
          setRestSound(v);
          previewRestSound(v);
        }}
        onClose={() => setChoosingSound(false)}
      />
      <RestPickerSheet
        visible={picking}
        title="Default rest"
        subtitle="Used for every exercise that has no rest time of its own."
        value={defaultSec}
        error={saveError}
        onChoose={(sec) => {
          setSaveError(null);
          void setDefaultSec(sec ?? 0).then((saved) => {
            if (saved) setPicking(false);
            else setSaveError("Couldn't save it. It applies until the app closes.");
          });
        }}
        onClose={() => {
          setSaveError(null);
          setPicking(false);
        }}
      />
    </Card>
  );
}

type Followed = Awaited<ReturnType<typeof followedFolder>>;

/**
 * Settings → How the app picks your next weight. Oct 2026 (owner): the weight step ("Weight jumps"
 * before Release A) and the reps to aim for ("Rep range"), each a choice sheet with one plain line per
 * choice and the default tagged "Recommended"; the Target and the grey set hints follow both. Release
 * A: + Easy weeks for the plan you follow (it was only in the folder's ⋯ menu, which keeps it too).
 */
export function NextWeightCard() {
  const weightJump = useTrackerPrefs((s) => s.weightJump);
  const setWeightJump = useTrackerPrefs((s) => s.setWeightJump);
  const repRange = useTrackerPrefs((s) => s.repRange);
  const setRepRange = useTrackerPrefs((s) => s.setRepRange);
  const [choosing, setChoosing] = useState<'jump' | 'range' | null>(null);
  const jumpLabel = choiceLabel(WEIGHT_JUMP_CHOICES, weightJump);
  const rangeLabel = choiceLabel(REP_RANGE_CHOICES, repRange);
  const [plan, setPlan] = useState<Followed | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const readPlan = useCallback(() => {
    followedFolder()
      .then((f) => setPlan(f))
      .catch((e: unknown) => {
        console.warn('[settings] the followed plan could not be read', e);
        setPlan(null);
      });
  }, []);
  useFocusEffect(readPlan);

  const flipEasy = (on: boolean): void => {
    if (!plan || saving) return;
    setSaving(true);
    void setEasyWeeks(plan, on)
      .then(readPlan)
      .catch((e: unknown) => {
        console.warn('[settings] easy weeks could not be saved', e);
        void tell('Could not save', 'Please try again.');
      })
      .finally(() => setSaving(false));
  };

  return (
    <>
      <Card style={{ paddingVertical: space.xs }}>
        <Pressable onPress={() => setChoosing('jump')} accessibilityRole="button" accessibilityLabel={`Weight step, ${jumpLabel}. Change`}>
          <SettingRow
            icon="trend"
            title="Weight step"
            caption={choiceDetail(WEIGHT_JUMP_CHOICES, weightJump)}
            right={
              <Text numberOfLines={2} style={ROW_VALUE()}>
                {jumpLabel}
              </Text>
            }
          />
        </Pressable>
        <Pressable onPress={() => setChoosing('range')} accessibilityRole="button" accessibilityLabel={`Reps to aim for, ${rangeLabel}. Change`}>
          <SettingRow
            icon="target"
            title="Reps to aim for"
            caption={choiceDetail(REP_RANGE_CHOICES, repRange)}
            right={
              <Text numberOfLines={2} style={ROW_VALUE()}>
                {rangeLabel}
              </Text>
            }
            divider
          />
        </Pressable>
      </Card>
      {/* Easy weeks belong to a plan you follow: shown for that plan, else one line on how to get one. */}
      {plan === undefined ? null : plan ? (
        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow
            icon="heart"
            title="Easy weeks"
            caption={`In ${plan.name}: every 6 weeks, half the sets at the same weights. Kept out of your records.`}
            value={!!plan.settings.easy}
            onChange={flipEasy}
          />
        </Card>
      ) : (
        <Text style={SECTION_LINE()}>
          Easy weeks work only with a plan you follow. On the Workout tab, tap ⋯ on a folder, then &quot;Follow this plan&quot;.
        </Text>
      )}
      <PrefChoiceSheet
        visible={choosing === 'jump'}
        title="Weight step"
        subtitle={WEIGHT_JUMP_HELP}
        choices={WEIGHT_JUMP_CHOICES}
        value={weightJump}
        onChoose={(v) => {
          setWeightJump(v);
          setChoosing(null);
        }}
        onClose={() => setChoosing(null)}
      />
      <PrefChoiceSheet
        visible={choosing === 'range'}
        title="Reps to aim for"
        subtitle={REP_RANGE_HELP}
        footnote={REP_RANGE_KEEP}
        choices={REP_RANGE_CHOICES}
        value={repRange}
        onChoose={(v) => {
          setRepRange(v);
          setChoosing(null);
        }}
        onClose={() => setChoosing(null)}
      />
    </>
  );
}

/** Settings → Last time's numbers (13 Oct 2026, Hevy's "Previous Workout Values"): three full-width rows. */
export function LastTimeCard() {
  const previousFrom = useTrackerPrefs((s) => s.previousFrom);
  const setPreviousFrom = useTrackerPrefs((s) => s.setPreviousFrom);
  const previousChoice = PREVIOUS_FROM_CHOICES.find((c) => c.value === previousFrom) ?? PREVIOUS_FROM_CHOICES[0];
  const bodyWeightAll = useTrackerPrefs((s) => s.bodyWeightAnyWorkout);
  const setBodyWeightAll = useTrackerPrefs((s) => s.setBodyWeightAnyWorkout);
  return (
    <Card style={{ paddingVertical: space.md }}>
      <View accessibilityRole="radiogroup" style={{ gap: space.xs }}>
        {PREVIOUS_FROM_CHOICES.map((c) => (
          <SheetRow
            key={c.value}
            label={c.label}
            selected={previousFrom === c.value}
            onPress={() => {
              if (previousFrom === c.value) return;
              tap();
              setPreviousFrom(c.value);
            }}
          />
        ))}
      </View>
      <Text style={SECTION_LINE()}>{previousChoice.line}</Text>
      {/* R-136: only "Same routine" narrows the workouts, so only there is the switch shown. */}
      {previousFrom === 'routine' ? (
        <ToggleRow
          icon="list"
          title={BODY_WEIGHT_SWITCH.title}
          caption={BODY_WEIGHT_SWITCH.caption}
          value={bodyWeightAll}
          onChange={setBodyWeightAll}
          divider
        />
      ) : null}
    </Card>
  );
}

/** Settings → Rate how hard each set felt: the effort column (and AI coach notes, while the coach is on). */
export function EffortCard({ showCoachNotes = false }: { showCoachNotes?: boolean }) {
  const advancedSets = useTrackerPrefs((s) => s.advancedSets);
  const setAdvancedSets = useTrackerPrefs((s) => s.setAdvancedSets);
  const coachNotes = useTrackerPrefs((s) => s.coachNotes);
  const setCoachNotes = useTrackerPrefs((s) => s.setCoachNotes);
  return (
    <Card style={{ paddingVertical: space.xs }}>
      <ToggleRow
        icon="gauge"
        title="Rate how hard each set felt"
        caption="Adds a box to each set: 6 is easy, 10 is as hard as you can go"
        value={advancedSets}
        onChange={setAdvancedSets}
      />
      {showCoachNotes ? (
        <ToggleRow
          icon="sparkle"
          title="AI coach notes"
          caption="A short note from the AI coach after each workout. Without it, the built-in note shows."
          value={coachNotes}
          onChange={setCoachNotes}
          divider
        />
      ) : null}
    </Card>
  );
}

/** Settings → Muscle tips (R-58): one calm tip on Up next when 3 weeks left a muscle group close to zero. */
export function MuscleTipsCard() {
  const tipsOn = useMuscleTips((s) => s.on);
  const setTipsOn = useMuscleTips((s) => s.setOn);
  const tipMuted = useMuscleTips((s) => s.muted);
  const tipSnoozed = useMuscleTips((s) => s.snoozedUntil);
  const skipped = putAwayGroups({ muted: tipMuted, snoozedUntil: tipSnoozed }, todayISO());
  const names = skipped.map((g) => GROUP_WORDS[g].your).join(', ');
  return (
    <Card style={{ paddingVertical: space.xs }}>
      <ToggleRow
        icon="dumbbell"
        title="Muscle tips"
        caption="Now and then, Up next suggests a few sets for a muscle group your last 3 weeks left out"
        value={tipsOn}
        onChange={setTipsOn}
      />
      {tipsOn && skipped.length > 0 ? (
        <Pressable
          onPress={() => {
            tap();
            useMuscleTips.getState().unmuteAll();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Muscles you asked to skip: ${names}. Bring them back`}
        >
          <SettingRow icon="sparkle" title="Muscles you asked to skip" caption={names} right={<Text style={ROW_VALUE()}>Bring back</Text>} divider />
        </Pressable>
      ) : null}
    </Card>
  );
}
