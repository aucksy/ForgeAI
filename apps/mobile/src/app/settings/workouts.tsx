import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Release A, A7/A8 (docs/ux/MEMBER-APP-MAP.md §3.3): the 14-row Workouts page is gone. Its rows are
 * the "Workouts" group on the Settings page itself, each opening a short page of its own (Weekly goal,
 * Rest timer and sounds, How the app picks your next weight, Plates and bars, Last time's numbers,
 * Rate how hard each set felt, Muscle tips). An old link lands on Settings.
 *
 * 0.56.0 review: opened from Settings (an old button), a plain replace put a SECOND Settings page on
 * top of the first, so Back showed Settings again. With a page below, `dismissTo` goes back to the
 * Settings already open (or replaces this page when there is none); opened cold, it replaces.
 */
export default function WorkoutsRedirect() {
  const router = useRouter();
  const back = router.canGoBack();
  useEffect(() => {
    if (back) router.dismissTo('/settings');
  }, [back, router]);
  if (back) return null;
  return <Redirect href="/settings" />;
}
