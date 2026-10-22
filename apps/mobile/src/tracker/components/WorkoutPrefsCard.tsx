/**
 * Profile → Workout (Phase 1). Four lines, nothing else:
 *  - Default rest — the rest timer for exercises without their own setting;
 *  - Workout sounds — rest bell + new-record chime;
 *  - Track RPE — adds the effort column (set types are always available now);
 *  - AI coach notes — only while the coach is switched on (lib/features.ts, D4).
 *
 * Audit Phase 9: + "Weekly goal" (Off, 1–7 workouts a week) at the end. Oct 2026: a − N +
 * stepper. Eight round chips (Off, 1–7) wrapped at large text, leaving "7" alone on a second
 * line; squeezed into one row they would be about 26 dp each on a large-display phone, under
 * the app's 48 dp touch rule. The stepper is one row with two 48 dp buttons at every size.
 *
 * Phase 2, packet D: "Rest alerts: …" (are rest alerts on time? one tap fixes it), the optional
 * "Ring through Do Not Disturb" (Android only, off by default — RT-12), and a default rest that
 * could not be saved says so (RT-11).
 *
 * 13 Oct 2026: + "Previous values" at the end (Hevy's "Previous Workout Values", plus the owner's
 * "Same folder"): three full-width rows, one line under them saying what the chosen one does. Three
 * choices with long words do not fit a segmented control at large text; rows wrap instead.
 *
 * Oct 2026: + "Plates and bars" (Hevy's Settings → Workouts → Plate Calculator): opens its own page,
 * the plates the gym has and the bar the plate calculator starts on.
 *
 * Oct 2026 (owner): + "Weight jumps" and "Rep range", just above Plates and bars. Each opens a
 * choice sheet like Default rest does (`PrefChoiceSheet`): every choice with one plain line, the
 * default tagged "Recommended". The Target and the grey set hints follow both.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card, Icon, SheetRow } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';

import { PREVIOUS_FROM_CHOICES } from '../db/historyScope';
import { GROUP_WORDS } from '../engine/muscleBalance';
import { putAwayGroups, useMuscleTips } from '../store/muscleTipsStore';
import { refreshWidgets } from '../phone/widgets';
import { plateSetupLine } from '../services/plateMath';
import { REST_SOUND_CHOICES, restSoundFootnote } from '../services/restSounds';
import { previewRestSound } from '../services/workoutSounds';
import { fmtRest } from '../services/restRules';
import {
  choiceDetail,
  choiceLabel,
  REP_RANGE_CHOICES,
  REP_RANGE_HELP,
  REP_RANGE_KEEP,
  WEIGHT_JUMP_CHOICES,
  WEIGHT_JUMP_HELP,
} from '../services/targetChoices';
import { usePlateSetupFor } from '../store/plateSetupStore';
import { useRestAlertPrefs } from '../store/restAlertPrefsStore';
import { useRestTimer } from '../store/restTimerStore';
import { stepWeeklyGoal, useTrackerPrefs } from '../store/trackerPrefsStore';
import { PrefChoiceSheet } from './PrefChoiceSheet';
import { RestAlertsStatusRow } from './RestAlertsStatusRow';
import { RestPickerSheet } from './RestPickerSheet';

/** A section's small heading (Weekly goal, Previous values). Read when drawn: gym branding repaints the tokens. */
const HEADING = () => ({
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
}) as const;

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
        // Not "Weekly goal": phone tests find the heading above by that exact text.
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

export function WorkoutPrefsCard({ showCoachNotes = true }: { showCoachNotes?: boolean }) {
  const weeklyGoal = useTrackerPrefs((s) => s.weeklyGoal);
  const setWeeklyGoal = useTrackerPrefs((s) => s.setWeeklyGoal);
  const previousFrom = useTrackerPrefs((s) => s.previousFrom);
  const setPreviousFrom = useTrackerPrefs((s) => s.setPreviousFrom);
  const previousChoice = PREVIOUS_FROM_CHOICES.find((c) => c.value === previousFrom) ?? PREVIOUS_FROM_CHOICES[0];
  const advancedSets = useTrackerPrefs((s) => s.advancedSets);
  const setAdvancedSets = useTrackerPrefs((s) => s.setAdvancedSets);
  const coachNotes = useTrackerPrefs((s) => s.coachNotes);
  const setCoachNotes = useTrackerPrefs((s) => s.setCoachNotes);
  const sounds = useTrackerPrefs((s) => s.sounds);
  const inUseAfterSet = useTrackerPrefs((s) => s.inUseAfterSet);
  const setInUseAfterSet = useTrackerPrefs((s) => s.setInUseAfterSet);
  // R-58: the Up next muscle tips, and the ones the member put away.
  const tipsOn = useMuscleTips((s) => s.on);
  const setTipsOn = useMuscleTips((s) => s.setOn);
  const tipMuted = useMuscleTips((s) => s.muted);
  const tipSnoozed = useMuscleTips((s) => s.snoozedUntil);
  const putAway = putAwayGroups({ muted: tipMuted, snoozedUntil: tipSnoozed }, todayISO());
  const setSounds = useTrackerPrefs((s) => s.setSounds);
  const restSound = useTrackerPrefs((s) => s.restSound);
  const setRestSound = useTrackerPrefs((s) => s.setRestSound);
  const restSoundLabel = choiceLabel(REST_SOUND_CHOICES, restSound);
  const defaultSec = useRestTimer((s) => s.defaultSec);
  const setDefaultSec = useRestTimer((s) => s.setDefaultSec);
  const loadDefault = useRestTimer((s) => s.loadDefault);
  const [picking, setPicking] = useState(false);
  const weightJump = useTrackerPrefs((s) => s.weightJump);
  const setWeightJump = useTrackerPrefs((s) => s.setWeightJump);
  const repRange = useTrackerPrefs((s) => s.repRange);
  const setRepRange = useTrackerPrefs((s) => s.setRepRange);
  const [choosing, setChoosing] = useState<'jump' | 'range' | 'sound' | null>(null);
  const jumpLabel = choiceLabel(WEIGHT_JUMP_CHOICES, weightJump);
  const rangeLabel = choiceLabel(REP_RANGE_CHOICES, repRange);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ringThroughDnd = useRestAlertPrefs((s) => s.ringThroughDnd);
  const router = useRouter();
  const units = useUnits();
  const plateSetup = usePlateSetupFor(units);
  const [openError, setOpenError] = useState<string | null>(null);
  const setRingThroughDnd = useRestAlertPrefs((s) => s.setRingThroughDnd);

  useEffect(() => {
    void loadDefault().catch(() => undefined);
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
          right={
            <Text
              style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.accent }}
            >
              {defaultSec > 0 ? fmtRest(defaultSec) : 'Off'}
            </Text>
          }
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
      <Pressable onPress={() => setChoosing('sound')} accessibilityRole="button" accessibilityLabel={`Rest-over sound, ${restSoundLabel}. Change`}>
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
      <RestAlertsStatusRow divider />
      {/* R-70 (owner, 22 Oct 2026): "In use" opens by itself when a set's rest starts. */}
      <ToggleRow
        icon="clock"
        title="Show In use after each set"
        caption="When rest starts, a big IN USE screen with the rest clock, so others know you are coming back"
        value={inUseAfterSet}
        onChange={setInUseAfterSet}
        divider
      />
      {/* R-58: one calm tip on Up next when 3 weeks left a muscle group close to zero. */}
      <ToggleRow
        icon="dumbbell"
        title="Muscle tips"
        caption="Now and then, Up next suggests a few sets for a muscle group your last 3 weeks left out"
        value={tipsOn}
        onChange={setTipsOn}
        divider
      />
      {tipsOn && putAway.length > 0 ? (
        <Pressable
          onPress={() => {
            tap();
            useMuscleTips.getState().unmuteAll();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Put-away tips: ${putAway.map((g) => GROUP_WORDS[g].your).join(', ')}. Bring them back`}
        >
          <SettingRow
            icon="sparkle"
            title="Put-away tips"
            caption={putAway.map((g) => GROUP_WORDS[g].your).join(', ')}
            right={<Text style={ROW_VALUE()}>Bring back</Text>}
            divider
          />
        </Pressable>
      ) : null}
      <ToggleRow
        icon="gauge"
        title="Track RPE"
        caption="Rate how hard each set felt (6–10)"
        value={advancedSets}
        onChange={setAdvancedSets}
        divider
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
      <Pressable onPress={() => setChoosing('jump')} accessibilityRole="button" accessibilityLabel={`Weight jumps, ${jumpLabel}. Change`}>
        <SettingRow
          icon="trend"
          title="Weight jumps"
          caption={choiceDetail(WEIGHT_JUMP_CHOICES, weightJump)}
          right={
            <Text numberOfLines={2} style={ROW_VALUE()}>
              {jumpLabel}
            </Text>
          }
          divider
        />
      </Pressable>
      <Pressable onPress={() => setChoosing('range')} accessibilityRole="button" accessibilityLabel={`Rep range, ${rangeLabel}. Change`}>
        <SettingRow
          icon="target"
          title="Rep range"
          caption={choiceDetail(REP_RANGE_CHOICES, repRange)}
          right={
            <Text numberOfLines={2} style={ROW_VALUE()}>
              {rangeLabel}
            </Text>
          }
          divider
        />
      </Pressable>
      <Pressable
        onPress={() => {
          setOpenError(null);
          try {
            router.push('/settings/plates' as Href);
          } catch (e) {
            console.warn('[ForgeErr] plates and bars page did not open', e);
            setOpenError("Couldn't open Plates and bars. Try again.");
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={`Plates and bars, ${plateSetupLine(plateSetup, units)}. Change`}
      >
        <SettingRow
          icon="dumbbell"
          title="Plates and bars"
          caption={`For the plate calculator: ${plateSetupLine(plateSetup, units)}`}
          right={<Icon name="chevron-right" size={18} color={color.inkMuted} />}
          divider
        />
      </Pressable>
      {openError ? (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.criticalText, paddingBottom: space.sm }}>{openError}</Text>
      ) : null}
      {/* Audit Phase 9 (#4): the member's own workouts-a-week goal (Up next on the Workout tab, the widget). */}
      <View style={{ paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.border }}>
        <Text accessibilityRole="header" style={HEADING()}>
          Weekly goal
        </Text>
        <WeeklyGoalStepper
          goal={weeklyGoal}
          onChange={(next) => {
            setWeeklyGoal(next);
            void refreshWidgets();
          }}
        />
        <Text style={SECTION_LINE()}>Workouts a week. The Workout tab shows how many are left.</Text>
      </View>
      {/* 13 Oct 2026: where PREVIOUS, the Target and carried notes come from (tracker/db/historyScope.ts). */}
      <View style={{ paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.border }}>
        <Text accessibilityRole="header" style={HEADING()}>
          Previous values
        </Text>
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
      </View>
      <PrefChoiceSheet
        visible={choosing === 'jump'}
        title="Weight jumps"
        subtitle={WEIGHT_JUMP_HELP}
        choices={WEIGHT_JUMP_CHOICES}
        value={weightJump}
        onChoose={(v) => {
          setWeightJump(v);
          setChoosing(null);
        }}
        onClose={() => setChoosing(null)}
      />
      {/* Stays open after a tap, so each sound can be heard in turn. */}
      <PrefChoiceSheet
        visible={choosing === 'sound'}
        title="Rest-over sound"
        subtitle="The sound when your rest is over. The ForgeAI chime is the default."
        footnote={restSoundFootnote(sounds)}
        choices={REST_SOUND_CHOICES}
        value={restSound}
        onChoose={(v) => {
          setRestSound(v);
          previewRestSound(v);
        }}
        onClose={() => setChoosing(null)}
      />
      <PrefChoiceSheet
        visible={choosing === 'range'}
        title="Rep range"
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
