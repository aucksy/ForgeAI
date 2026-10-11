import { Redirect, useLocalSearchParams } from 'expo-router';

import { historyTarget } from '@/lib/oldRoutes';

/**
 * Redesign R5: History is the Profile now — its Workouts feed, and Calendar behind the Calendar
 * tile. An old link to "/history" lands on the Profile; "/history?view=calendar" on Calendar.
 */
export default function HistoryRedirect() {
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  return <Redirect href={historyTarget(params.view)} />;
}
