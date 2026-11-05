/**
 * R-336 device UAT link, mettleup://qa-update?behind=N: only opens the Workout tab. On a QA build (the
 * 'updateOffer' stand-in) the full screen's own component (components/UpdatePrompt.tsx) reads the link
 * and shows a made-up update N versions ahead; store and GitHub release builds ignore it.
 */
import { Redirect } from 'expo-router';

export default function QaUpdate() {
  return <Redirect href="/workout" />;
}
