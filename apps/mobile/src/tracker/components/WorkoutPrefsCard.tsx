/**
 * Profile → Workout (Phase 1). Four lines, nothing else:
 *  - Default rest — the rest timer for exercises without their own setting;
 *  - Workout sounds — rest bell + new-record chime;
 *  - Track RPE — adds the effort column (set types are always available now);
 *  - AI coach notes — only while the coach is switched on (lib/features.ts, D4).
 */
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { fmtRest } from '../services/restRules';
import { useRestTimer } from '../store/restTimerStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { RestPickerSheet } from './RestPickerSheet';

export function WorkoutPrefsCard({ showCoachNotes = true }: { showCoachNotes?: boolean }) {
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
      <ToggleRow
        icon="target"
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
      <RestPickerSheet
        visible={picking}
        title="Default rest"
        subtitle="Used for every exercise that has no rest time of its own."
        value={defaultSec}
        onChoose={(sec) => {
          setDefaultSec(sec ?? 0);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </Card>
  );
}
