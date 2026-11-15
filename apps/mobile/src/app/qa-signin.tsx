/**
 * F203 phone sign-in device UAT link, QA builds only (the 'phoneSignIn' stand-in written into app.json by
 * qa-device.yml): mettleup://qa-signin?on=1&role=trainer&gym=QA%20UAT%20Gym&code=ABC123 switches "Continue with your
 * phone number" on for this run and sets the made-up answer (onboarding/phoneSignIn.qaSignInFrom; none=1 = not
 * found, on=0 = off). On the welcome screen the root layout reads the link itself (the navigator is not drawn yet);
 * this route takes the same link once the app is set up. Store and GitHub release builds ignore it. Goes straight
 * back to where the member was (a Redirect stacks a second copy of the tabs, R-336).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { qaSignInFrom } from '@/onboarding/phoneSignIn';
import { applyQaSignIn } from '@/onboarding/phoneSignInApi';

export default function QaSignIn() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const key = JSON.stringify(params);
  useEffect(() => {
    const p: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(params)) p[k] = Array.isArray(v) ? v[0] : v;
    applyQaSignIn(qaSignInFrom(p));
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
    // `key` stands for params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, key]);
  return null;
}
