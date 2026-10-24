import { Redirect, useLocalSearchParams } from 'expo-router';

import { bodyTarget } from '@/lib/oldRoutes';

/**
 * Release A, A13 (docs/ux/MEMBER-APP-MAP.md): the old Body weight page is retired. It was a second
 * copy of Body (Progress → Body, the `measures` page), which logs, charts and undoes body weight the
 * same way. A link an older launcher, widget or notification kept lands on Body, on Body weight.
 */
export default function BodyWeightRedirect() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  return <Redirect href={bodyTarget('/bodyweight', params.kind)} />;
}