/**
 * F56 MettleUp Plus device UAT link (R-461), QA builds only (the 'memberPlan' stand-in written into app.json by
 * qa-device.yml): mettleup://qa-plan?gate=1&day=26 turns the plan on for this phone and makes today day 26 of
 * the free month. Also: bought=monthly|yearly|lifetime|none, staff=<gym>, gym=<gym>&ends=YYYY-MM-DD&lock=1|0,
 * today=YYYY-MM-DD, reset=1 (memberPlan.qaPlanFrom); find=found|none|off (&findGym, &findCode) for "Find my gym". Store and GitHub release builds ignore it. Goes straight
 * back to where the member was (a Redirect stacks a second copy of the tabs, R-336).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { applyQaPlan } from '@/plan/memberPlanStore';
import { setQaFind } from '@/shop/findGymApi';

export default function QaPlan() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const key = JSON.stringify(params);
  useEffect(() => {
    const p: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(params)) p[k] = Array.isArray(v) ? v[0] : v;
    if (p.bought === 'none') p.bought = '';
    if (applyQaPlan(p)) {
      console.log(`[QA] member plan: ${key}`);
      // "Find my gym": a made-up answer for the next check (find=found|none|off).
      if (p.find) setQaFind(p);
    }
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
    // `key` stands for params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, key]);
  return null;
}
