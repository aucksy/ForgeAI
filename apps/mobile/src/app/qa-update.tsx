/**
 * R-336 device UAT link, mettleup://qa-update?behind=N: only goes back to where the member was (the
 * Workout tab). On a QA build (the 'updateOffer' stand-in) the full screen's own component
 * (components/UpdatePrompt.tsx) reads the link and shows a made-up update N versions ahead; store and
 * GitHub release builds ignore it. UAT finding: a Redirect here stacked a second copy of the tabs, so
 * the next link reached two listeners; going back keeps one.
 */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function QaUpdate() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router]);
  return null;
}
