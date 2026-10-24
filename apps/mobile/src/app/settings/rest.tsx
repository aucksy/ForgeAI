/**
 * Settings → Workouts → Rest timer and sounds (Release A, A8: one of the two pages split out of the old
 * 14-row Workouts page): default rest, workout sounds, the rest-over sound, ringing through Do Not
 * Disturb, the "In use" screen after each set, and the rest-alert check.
 */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { RestPrefsCard } from '@/tracker/components/WorkoutPrefsCard';

export default function RestPage() {
  return (
    <SettingsPage title="Rest timer and sounds">
      <RestPrefsCard />
    </SettingsPage>
  );
}