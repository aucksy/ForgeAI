/**
 * Light mode device UAT link, mettleup://qa-look?accent=F7D411 (or accent=none): on a QA build (the
 * 'gymLook' stand-in written into app.json by qa-device.yml) the app shows a gym's colour for this run
 * only — nothing saved, no server — so the cloud emulator can photograph a gym-branded screen on the
 * light and dark looks. Store and GitHub release builds ignore it. Goes straight back to where the
 * member was (a Redirect stacks a second copy of the tabs, R-336).
 */
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { normalizeHex } from '@forgeai/theme';

import { applyBrandToTokens } from '@/theme/brandTokens';
import { redrawForLook } from '@/theme/gymTheme';

function hasLookStandIn(): boolean {
  const list = (Constants.expoConfig?.extra as { qaStandIns?: unknown } | undefined)?.qaStandIns;
  return Array.isArray(list) && list.includes('gymLook');
}

export default function QaLook() {
  const router = useRouter();
  const { accent } = useLocalSearchParams<{ accent?: string }>();
  useEffect(() => {
    if (hasLookStandIn()) {
      const hex = normalizeHex(accent ?? '');
      applyBrandToTokens(hex ? { accent: hex, bg: null, logoUrl: null, heading: 'normal', updatedAt: null } : null);
      console.log(`[QA] gym look: ${hex ?? 'none'}`);
      redrawForLook();
    }
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router, accent]);
  return null;
}
