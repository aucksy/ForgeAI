/** Settings → Workouts → Muscle tips (Release A, A8): the Up next tips, and the muscles you asked to skip. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { MuscleTipsCard } from '@/tracker/components/WorkoutPrefsCard';

export default function MuscleTipsPage() {
  return (
    <SettingsPage title="Muscle tips">
      <MuscleTipsCard />
    </SettingsPage>
  );
}