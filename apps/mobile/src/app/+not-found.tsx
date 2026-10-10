import { Redirect } from 'expo-router';

import { leaveLinkNotice } from '@/lib/linkNotice';

/**
 * SH-29: a stale or mistyped forgeai:// link used to open expo-router's developer
 * "Unmatched Route" page. Now it goes straight Home, where one calm line says
 * "That link didn't work." (lib/linkNotice — Home shows it once, then it fades).
 */
export default function NotFound() {
  // Idempotent: leaving the same note twice on a re-render still shows it once.
  leaveLinkNotice();
  return <Redirect href="/" />;
}
