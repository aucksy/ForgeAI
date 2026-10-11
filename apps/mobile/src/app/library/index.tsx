import { Redirect } from 'expo-router';

/**
 * Redesign R5: the Exercise library is Profile → Exercises now. Every old link to "/library"
 * (an older shortcut, the Workout tab's button until it changes) lands there.
 */
export default function LibraryRedirect() {
  return <Redirect href="/exercises" />;
}
