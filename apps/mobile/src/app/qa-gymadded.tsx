/**
 * F239 "A gym added you" device UAT link, QA builds only (the 'gymAddedYou' stand-in written into app.json by
 * qa-device.yml): mettleup://qa-gymadded?found=member|lapsed|trainer|two|other-gym|none&gym=QA%20UAT%20Gym&code=ABC123
 * answers every check of this run with a made-up result (shop/gymAddedYou.qaAddedFrom; the card says so), &days=N
 * judges "Not now" N days later, &reset=1 forgets every "Not now" first, found=off switches the stand-in off. Store
 * and GitHub release builds ignore it. Goes straight back to where the member was (a Redirect stacks a second copy
 * of the tabs, R-336).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { todayISO } from '@/lib/date';
import { qaAddedFrom } from '@/shop/gymAddedYou';
import { applyQaGymAdded } from '@/shop/gymAddedYouApi';

export default function QaGymAdded() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const key = JSON.stringify(params);
  useEffect(() => {
    const p: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(params)) p[k] = Array.isArray(v) ? v[0] : v;
    void applyQaGymAdded(qaAddedFrom(p, todayISO()));
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
    // `key` stands for params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, key]);
  return null;
}
