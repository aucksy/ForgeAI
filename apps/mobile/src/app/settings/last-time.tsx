/** Settings → Workouts → Previous numbers (Release A, A8): where Previous, the Target and notes come from. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LastTimeCard } from '@/tracker/components/WorkoutPrefsCard';

export default function LastTimePage() {
  return (
    <SettingsPage title="Previous numbers">
      <LastTimeCard />
    </SettingsPage>
  );
}