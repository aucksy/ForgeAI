/**
 * The demo gym's whole tree (R-119). The real app's screens and navigation, on the sample gym held in
 * memory (never in the browser's storage), so no screen can reach a real gym or the server. See
 * demoMode.tsx for the picture. Mounted by main.tsx for app.mettleup.fit/demo only.
 *
 * R-540 (14 Nov 2026): the sample gym is the sales showcase (showcase.ts), and a pretend gym server in this
 * page (demoServer.ts) answers the screens that need one, as the owner Vikram (or, at /demo?as=desk, the
 * front desk's Sunita), so a gym visit can show every part with believable numbers.
 */

import { useLayoutEffect, useMemo } from 'react';

import { AuthProvider } from '../auth/AuthProvider';
import { BranchProvider } from '../branches/BranchProvider';
import { Routes } from '../CrmApp';
import { LocalCrmData, memoryStore } from '../data/local';
import { todayISO } from '../logic/dates';
import { ShopProvider } from '../shop/ShopProvider';
import { CrmProvider } from '../store';
import { useLang } from '../lang/lang';
import { serveDemo } from '../../lib/demoLock';
import { makeDemoServer } from './demoServer';
import { buildShowcase } from './showcase';
import { DEMO_BAR_HEIGHT, DemoBar, DemoProvider, type DemoInfo } from './demoMode';

export function DemoApp({ hasOwnGym }: DemoInfo) {
  // English | Hinglish: a switch draws the demo gym again in the new words.
  useLang();
  // A new copy of the sample gym every time the page opens. `memoryStore` is a Map, not localStorage.
  // The pretend server goes in before anything below reads the session (AuthProvider, ShopProvider).
  const data = useMemo(() => {
    const today = todayISO();
    const showcase = buildShowcase(today);
    const server = makeDemoServer(showcase, today);
    if (/(^|[?&])as=desk(&|$)/.test(window.location.search)) server.setRole('staff');
    serveDemo(server);
    return new LocalCrmData({ store: memoryStore(), seed: () => showcase.snapshot });
  }, []);
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
