/**
 * Settings → Workouts → How the app picks your next weight (Release A, A8): the weight step, the reps
 * to aim for, and easy weeks for the plan you follow.
 */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { NextWeightCard } from '@/tracker/components/WorkoutPrefsCard';

export default function NextWeightPage() {
  return (
    <SettingsPage title="How the app picks your next weight">
      <NextWeightCard />
    </SettingsPage>
  );
}