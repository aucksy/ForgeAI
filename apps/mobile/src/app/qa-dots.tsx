/**
 * F198 device UAT link, mettleup://qa-dots?at=<ISO time>&reset=1: on a QA build (the 'newDots' stand-in written
 * into app.json by qa-device.yml) the new-feature dots use that clock, and reset=1 forgets what this phone has
 * seen, so the cloud emulator can walk a fresh trail and check the 30-day end on any day. Store and GitHub
 * release builds ignore it (setQaDots). Goes straight back to where the member was (a Redirect stacks a
 * second copy of the tabs, R-336).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { setQaDots } from '@/lib/newDotsStore';

export default function QaDots() {
  const router = useRouter();
  const { at, reset } = useLocalSearchParams<{ at?: string; reset?: string }>();
  useEffect(() => {
    const ms = at ? Date.parse(at) : NaN;
    setQaDots(Number.isFinite(ms) ? ms : null, reset === '1');
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router, at, reset]);
  return null;
}
