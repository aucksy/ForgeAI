/**
 * R-501 device UAT link, mettleup://qa-push?ready=1: on a QA build (the 'gymPush' stand-in written into
 * app.json by qa-device.yml) the phone makes the gym message channels now, as a member's phone does when it
 * joins a gym and saves its push address (shop/pushToken.ts getReady), so the cloud phone test can deliver
 * a made-up push to a phone that is in no gym and read how Android showed it (qa/run-device-qa.sh part_u501).
 * Store and GitHub release builds ignore it. Goes straight back to where the member was.
 */
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { ensureNoticeChannel } from '@/shop/noticeAlertsRun';

function hasPushStandIn(): boolean {
  const list = (Constants.expoConfig?.extra as { qaStandIns?: unknown } | undefined)?.qaStandIns;
  return Array.isArray(list) && list.includes('gymPush');
}

export default function QaPush() {
  const router = useRouter();
  const { ready } = useLocalSearchParams<{ ready?: string }>();
  useEffect(() => {
    if (hasPushStandIn() && ready === '1') {
      void ensureNoticeChannel()
        .then(() => console.log('[QA] gym push channels ready'))
        .catch((e: unknown) => console.warn('[QA] gym push channels failed', e));
    }
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router, ready]);
  return null;
}
