/**
 * F199 (owner R-403, 8 Nov 2026): the Progress tab is gone; what it held (the overview chart, today's
 * goal, Charts, Exercises, Records, Body and Reports) is on the Profile tab now. This address stays so
 * an old link, notification, widget or What's new button to "/progress" lands on Profile, never on a
 * blank screen (lib/oldRoutes.ts, MOVED_ROUTES).
 */
import { Redirect } from 'expo-router';

export default function ProgressRoute() {
  return <Redirect href="/profile" />;
}
