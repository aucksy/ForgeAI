import { Redirect } from 'expo-router';

/**
 * Release A, A7/A8 (docs/ux/MEMBER-APP-MAP.md §3.3): the 14-row Workouts page is gone. Its rows are
 * the "Workouts" group on the Settings page itself, each opening a short page of its own (Weekly goal,
 * Rest timer and sounds, How the app picks your next weight, Plates and bars, Last time's numbers,
 * Rate how hard each set felt, Muscle tips). An old link lands on Settings.
 */
export default function WorkoutsRedirect() {
  return <Redirect href="/settings" />;
}