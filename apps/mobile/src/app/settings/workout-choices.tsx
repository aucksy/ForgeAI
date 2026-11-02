/**
 * Settings → Workouts → "More workout choices" (R-284, 2 Nov 2026 UAT): the workout settings few
 * members change (MORE_WORKOUT_ROWS). Each row opens the page it always had and says, in one grey
 * line, how it is set now, as the Settings rows do.
 */
import { useRouter, type Href } from 'expo-router';
import { useRef } from 'react';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { MORE_WORKOUT_ROWS, nextWeightLine, onOffLine, type SettingsRowKey } from '@/components/settings/settingsLines';
import { LinkRow } from '@/components/stats/parts';
import { navigateOnce } from '@/lib/guardedAction';
import { PREVIOUS_FROM_CHOICES } from '@/tracker/db/historyScope';
import { choiceLabel, REP_RANGE_CHOICES, WEIGHT_JUMP_CHOICES } from '@/tracker/services/targetChoices';
import { useMuscleTips } from '@/tracker/store/muscleTipsStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

export default function WorkoutChoicesPage() {
  const router = useRouter();
  const weightJump = useTrackerPrefs((s) => s.weightJump);
  const repRange = useTrackerPrefs((s) => s.repRange);
  const previousFrom = useTrackerPrefs((s) => s.previousFrom);
  const tipsOn = useMuscleTips((s) => s.on);
  const busy = useRef(false);
  const previous = PREVIOUS_FROM_CHOICES.find((c) => c.value === previousFrom) ?? PREVIOUS_FROM_CHOICES[0];
  const lines: Partial<Record<SettingsRowKey, string>> = {
    nextWeight: nextWeightLine(choiceLabel(WEIGHT_JUMP_CHOICES, weightJump), choiceLabel(REP_RANGE_CHOICES, repRange)),
    lastTime: previous.label,
    muscleTips: onOffLine(tipsOn),
  };
  return (
    <SettingsPage title="More workout choices">
      {MORE_WORKOUT_ROWS.map((r) => (
        <LinkRow
          key={r.key}
          title={r.title}
          sub={lines[r.key]}
          onPress={() => navigateOnce(busy, () => router.push(r.href as Href))}
        />
      ))}
    </SettingsPage>
  );
}
