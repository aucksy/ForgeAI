/**
 * Profile → Workout (Phase 1). Four lines, nothing else:
 *  - Default rest — the rest timer for exercises without their own setting;
 *  - Workout sounds — rest bell + new-record chime;
 *  - Track RPE — adds the effort column (set types are always available now);
 *  - AI coach notes — only while the coach is switched on (lib/features.ts, D4).
 *
 * Audit Phase 9: + "Weekly goal" (Off, 1–7 workouts a week) at the end.
 *
 * Phase 2, packet D: "Rest alerts: …" (are rest alerts on time? one tap fixes it), the optional
 * "Ring through Do Not Disturb" (Android only, off by default — RT-12), and a default rest that
 * could not be saved says so (RT-11).
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { ChipGroup, type ChipOption } from '@/components/settings/ChipGroup';
import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { refreshWidgets } from '../phone/widgets';
import { fmtRest } from '../services/restRules';
import { useRestAlertPrefs } from '../store/restAlertPrefsStore';
import { useRestTimer } from '../store/restTimerStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { RestAlertsStatusRow } from './RestAlertsStatusRow';
import { RestPickerSheet } from './RestPickerSheet';

type GoalId = 'off' | '1' | '2' | '3' | '4' | '5' | '6' | '7';
const GOAL_OPTIONS: readonly ChipOption<GoalId>[] = [
  { id: 'off', label: 'Off' },
  ...(['1', '2', '3', '4', '5', '6', '7'] as const).map((n) => ({ id: n, label: n })),
];

export function WorkoutPrefsCard({ showCoachNotes = true }: { showCoachNotes?: boolean }) {
  const weeklyGoal = useTrackerPrefs((s) => s.weeklyGoal);
  const setWeeklyGoal = useTrackerPrefs((s) => s.setWeeklyGoal);
  const advancedSets = useTrackerPrefs((s) => s.advancedSets);
  const setAdvancedSets = useTrackerPrefs((s) => s.setAdvancedSets);
  const coachNotes = useTrackerPrefs((s) => s.coachNotes);
  const setCoachNotes = useTrackerPrefs((s) => s.setCoachNotes);
  const sounds = useTrackerPrefs((s) => s.sounds);
  const setSounds = useTrackerPrefs((s) => s.setSounds);
  const defaultSec = useRestTimer((s) => s.defaultSec);
  const setDefaultSec = useRestTimer((s) => s.setDefaultSec);
  const loadDefault = useRestTimer((s) => s.loadDefault);
  const [picking, setPicking] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ringThroughDnd = useRestAlertPrefs((s) => s.ringThroughDnd);
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
          caption="After a workout, add an AI-written note via your Groq key (needs a key; otherwise the built-in coach note always shows)"
          value={coachNotes}
          onChange={setCoachNotes}
          divider
        />
      ) : null}
      {/* Audit Phase 9 (#4): the member's own workouts-a-week goal (Home, Progress, the widget). */}
      <View style={{ paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.border }}>
        <ChipGroup
          label="Weekly goal"
          options={GOAL_OPTIONS}
          selectedId={weeklyGoal ? String(weeklyGoal) : 'off'}
          onSelect={(id) => {
            setWeeklyGoal(id === 'off' ? null : Number(id));
            void refreshWidgets();
          }}
        />
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs, lineHeight: 17 }}>
          Workouts a week. Home and Progress count towards it.
        </Text>
      </View>
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
