/** Settings → Workouts → Weekly goal (Release A, A8): Off or 1–7 workouts a week, for Up next and the widget. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { WeeklyGoalCard } from '@/tracker/components/WorkoutPrefsCard';

export default function WeeklyGoalPage() {
  return (
    <SettingsPage title="Weekly goal">
      <WeeklyGoalCard />
    </SettingsPage>
  );
}