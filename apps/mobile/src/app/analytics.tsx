import { Redirect } from 'expo-router';

/**
 * Redesign R5: Progress is Profile → Statistics now (and Measures for the body). An old link to
 * "/analytics" lands on Statistics.
 */
export default function AnalyticsRedirect() {
  return <Redirect href="/stats" />;
}
