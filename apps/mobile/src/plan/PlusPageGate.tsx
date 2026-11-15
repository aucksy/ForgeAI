/**
 * F217 (0.78.0 review, R-560): the MettleUp Plus page and the "Find my gym" page open only while MettleUp Plus is
 * switched on. A link (mettleup://plus or mettleup://find-gym, from another app, a web page or a QR code) could
 * open them in a store build where Plus is off: the page then leaves at once, back to where the member was, or to
 * the Workout tab when the link opened the app on this page. Nothing is drawn meanwhile, so no price, Buy button
 * or "every feature free" line ever shows. QA builds with the 'memberPlan' stand-in keep both pages open
 * (plusPagesOpen). Shared code: Android and iPhone alike.
 */
import { Redirect, useRouter } from 'expo-router';
import { useEffect, type ReactNode } from 'react';

import { plusPagesOpen } from './memberPlan';
import { isQaPlanBuild } from './memberPlanStore';

export function PlusPageGate({ page, children }: { page: string; children: ReactNode }) {
  const router = useRouter();
  const open = plusPagesOpen(isQaPlanBuild());
  const behind = !open && router.canGoBack();
  useEffect(() => {
    if (open) return;
    console.warn(`[plan] ${page} was opened while MettleUp Plus is switched off; leaving it`);
    if (behind) router.back();
  }, [open, behind, page, router]);
  if (open) return <>{children}</>;
  // Opened alone (the link started the app here): nothing to go back to, so the Workout tab.
  return behind ? null : <Redirect href="/workout" />;
}
