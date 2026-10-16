import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { CrmApp } from './crm/CrmApp';
import { listenForInstall } from './crm/install';
import { applyTheme, savedTheme } from './theme';
import './index.css';

/**
 * The CRM is the app. The legacy read-only Supabase dashboard (`App.tsx` and
 * `components/*`) is kept on disk and folds back in as an "app activity" screen
 * when the cloud adapter lands in P7 — it is the only code that knows how to read
 * `member_summary`, which is what the phone pushes.
 */
// Chrome's install offer can arrive before React draws anything: catch it first.
listenForInstall();
// The saved dark | light choice, before the first frame, so a light panel never flashes dark.
applyTheme(savedTheme());

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <CrmApp />
    </StrictMode>,
  );
}
