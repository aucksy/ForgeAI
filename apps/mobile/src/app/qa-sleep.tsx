/**
 * R-344 device UAT link, mettleup://qa-sleep?min=N: on a QA build (the 'sleepSample' stand-in written
 * into app.json by qa-device.yml) "last night" becomes N minutes long (N < 0 = unknown), so the finish
 * screen's sleep line can be photographed on the cloud emulator, which has no sleep tracker. The line
 * then says "Test build: made-up sleep." Store and GitHub release builds ignore it (setQaSleep).
 * Goes straight back to where the member was (a Redirect stacks a second copy of the tabs, R-336).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { setQaSleep } from '@/tracker/phone/sleepLink';

export default function QaSleep() {
  const router = useRouter();
  const { min } = useLocalSearchParams<{ min?: string }>();
  useEffect(() => {
    const n = Number(min);
    setQaSleep(Number.isFinite(n) && min != null && min !== '' ? Math.round(n) : null);
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router, min]);
  return null;
}
