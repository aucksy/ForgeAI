import { Redirect } from 'expo-router';

/**
 * Redesign R4: the Routines screen is gone — folders and routines live on the Workout tab itself
 * (Hevy's layout). Every old link to "/routines" (an older shortcut, a notification, a screen
 * not yet updated) lands there.
 */
export default function RoutinesRedirect() {
  return <Redirect href="/workout" />;
}
