import { Redirect, useLocalSearchParams } from 'expo-router';

import { bodyTarget } from '@/lib/oldRoutes';

/**
 * Release A, A13 (docs/ux/MEMBER-APP-MAP.md): the old "Log measurements" form is retired; Body's one
 * form (body weight, measurements and a picture) takes its place. An old link opens that form.
 */
export default function MeasurementsLogRedirect() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  return <Redirect href={bodyTarget('/measurements/log', params.kind)} />;
}