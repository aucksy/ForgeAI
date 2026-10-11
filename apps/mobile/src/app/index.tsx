import { Redirect } from 'expo-router';

/**
 * Redesign R1: Home is gone — the app opens on the Workout tab, and every old link to "/"
 * (a notification, an older shortcut, an error screen's way out) lands there too.
 */
export default function Index() {
  return <Redirect href="/workout" />;
}
