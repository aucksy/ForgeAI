/** Settings → Workouts → Last time's numbers (Release A, A8): where Previous, the Target and notes come from. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LastTimeCard } from '@/tracker/components/WorkoutPrefsCard';

export default function LastTimePage() {
  return (
    <SettingsPage title="Last time's numbers">
      <LastTimeCard />
    </SettingsPage>
  );
}