/** Settings → Workouts → Rate how hard each set felt (Release A, A8): the effort box on each set. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { FEATURES, profileParts } from '@/lib/features';
import { EffortCard } from '@/tracker/components/WorkoutPrefsCard';

const PARTS = new Set(profileParts(FEATURES));

export default function EffortPage() {
  return (
    <SettingsPage title="Rate how hard each set felt">
      <EffortCard showCoachNotes={PARTS.has('coachNotes')} />
    </SettingsPage>
  );
}