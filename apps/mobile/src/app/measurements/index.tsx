import { Redirect, useLocalSearchParams } from 'expo-router';

import { bodyTarget } from '@/lib/oldRoutes';

/**
 * Release A, A13 (docs/ux/MEMBER-APP-MAP.md): the old Measurements page is retired; Body (Progress →
 * Body, the `measures` page) holds every measurement. An old link lands there, on the measure it named.
 */
export default function MeasurementsRedirect() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  return <Redirect href={bodyTarget('/measurements', params.kind)} />;
}