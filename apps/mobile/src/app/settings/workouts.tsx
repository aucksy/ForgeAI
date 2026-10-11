/**
 * Settings → Workouts (redesign R6): default rest, sounds, Do Not Disturb, RPE, weekly goal — and
 * the rest-alert check, which shows only when rest alerts would not ring on time.
 */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { FEATURES, profileParts } from '@/lib/features';
import { WorkoutPrefsCard } from '@/tracker/components/WorkoutPrefsCard';

const PARTS = new Set(profileParts(FEATURES));

export default function WorkoutsPage() {
  return (
    <SettingsPage title="Workouts">
      <WorkoutPrefsCard showCoachNotes={PARTS.has('coachNotes')} />
    </SettingsPage>
  );
}
