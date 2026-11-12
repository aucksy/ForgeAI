/**
 * R-452 device UAT link, mettleup://qa-help?reply=1: on a QA build (the 'helpReply' stand-in written into
 * app.json by qa-device.yml) the phone gets a made-up question with a quick automatic answer and two
 * replies from the team, unread (lib/helpHistory.ts qaStandInQuestion), so the cloud phone test can see the
 * red dot on the round button and the conversation without a real reply typed in HQ. Kept only on this
 * phone; its secret is unknown to the server. Store and GitHub release builds ignore it. Goes straight back
 * to where the member was (a Redirect stacks a second copy of the tabs, R-336).
 */
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useHelpHistory } from '@/lib/helpHistoryStore';

function hasHelpStandIn(): boolean {
  const list = (Constants.expoConfig?.extra as { qaStandIns?: unknown } | undefined)?.qaStandIns;
  return Array.isArray(list) && list.includes('helpReply');
}

export default function QaHelp() {
  const router = useRouter();
  const { reply } = useLocalSearchParams<{ reply?: string }>();
  useEffect(() => {
    if (hasHelpStandIn() && reply === '1') {
      void useHelpHistory
        .getState()
        .qaAddStandIn()
        .then(() => console.log('[QA] help reply stand-in added'))
        .catch((e: unknown) => console.warn('[QA] help reply stand-in failed', e));
    }
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router, reply]);
  return null;
}
