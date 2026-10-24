/**
 * The demo gym's whole tree (R-119). The real app's screens and navigation, on the sample gym held in
 * memory (never in the browser's storage), with nobody signed in, so no screen can reach a real gym or
 * the server. See demoMode.tsx for the picture. Mounted by main.tsx for app.mettleup.fit/demo only.
 */

import { useLayoutEffect, useMemo } from 'react';

import { AuthProvider } from '../auth/AuthProvider';
import { BranchProvider } from '../branches/BranchProvider';
import { Routes } from '../CrmApp';
import { LocalCrmData, memoryStore } from '../data/local';
import { demoSnapshot } from '../data/demo';
import { todayISO } from '../logic/dates';
import { ShopProvider } from '../shop/ShopProvider';
import { CrmProvider } from '../store';
import { DEMO_BAR_HEIGHT, DemoBar, DemoProvider, type DemoInfo } from './demoMode';

export function DemoApp({ hasOwnGym }: DemoInfo) {
  // A new copy of the sample gym every time the page opens. `memoryStore` is a Map, not localStorage.
  const data = useMemo(() => new LocalCrmData({ store: memoryStore(), seed: () => demoSnapshot(todayISO()) }), []);
  const info = useMemo<DemoInfo>(() => ({ hasOwnGym }), [hasOwnGym]);
  // The sidebar and the phone's top bar sit under the banner (ui/AppShell.tsx reads this).
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--demo-bar', `${DEMO_BAR_HEIGHT}px`);
  }, []);
  return (
    <DemoProvider value={info}>
      <DemoBar hasOwnGym={hasOwnGym} />
      <AuthProvider>
        <BranchProvider>
          <CrmProvider data={data}>
            <ShopProvider>
              <Routes online={false} />
            </ShopProvider>
          </CrmProvider>
        </BranchProvider>
      </AuthProvider>
    </DemoProvider>
  );
}
