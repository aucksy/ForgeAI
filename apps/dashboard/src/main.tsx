import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { CrmApp } from './crm/CrmApp';
import { startCrashReports } from './crm/crashReport';
import { DemoApp } from './crm/demo/DemoApp';
import { installDemoLockdown } from './crm/demo/lockdown';
import { listenForInstall } from './crm/install';
import { readCloudGym } from './crm/shop/cloudGym';
import { isDemoAddress, lockForDemo } from './lib/demoLock';
import { applyTheme, savedTheme } from './theme';
import './index.css';

/**
 * The CRM is the app. The legacy read-only Supabase dashboard (`App.tsx` and
 * `components/*`) is kept on disk and folds back in as an "app activity" screen
 * when the cloud adapter lands in P7 — it is the only code that knows how to read
 * `member_summary`, which is what the phone pushes.
 */
// #34 alerts: an error nothing caught is reported (no personal data; crm/crashReport.ts).
startCrashReports();
// R-119: app.mettleup.fit/demo is the made-up demo gym, never the gym this device is signed in to.
// Asked BEFORE anything else reads the device's sign-in; then the lock goes on for the whole page.
const demo = isDemoAddress(window.location.pathname, window.location.search);
const hasOwnGym = demo ? readCloudGym() !== null : false;
if (demo) {
  lockForDemo();
  installDemoLockdown();
} else {
  // Chrome's install offer can arrive before React draws anything: catch it first.
  listenForInstall();
}
// The saved dark | light choice, before the first frame, so a light panel never flashes dark.
applyTheme(savedTheme());

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      {demo ? <DemoApp hasOwnGym={hasOwnGym} /> : <CrmApp />}
    </StrictMode>,
  );
}
