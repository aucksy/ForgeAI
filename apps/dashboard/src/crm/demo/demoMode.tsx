/**
 * The demo gym (R-119, 24 Oct 2026): app.mettleup.fit/demo.
 *
 * Owner: "'Open Demo GYM' is opening the latest GYM I created." The landing page's demo link went to
 * the app's front door, which opens whatever gym this device is signed in to. The demo has its own
 * address now, and it never looks at, changes or signs out a gym on this device:
 *   - the records are the sample gym (data/demo.ts) held in the page's MEMORY only, so a refresh
 *     starts it over and nothing is ever written to the browser's storage for it;
 *   - lib/demoLock.ts is switched on first thing (main.tsx): the signed-in gym is invisible to the
 *     demo, writes and sign-outs are refused, the gym server is never called (lib/supabase.ts) and the
 *     page's fetch only reads this site's own files (lockdown.ts);
 *   - screens that exist to talk to a server (messages, shop, branding ...) show a plain card saying
 *     what they do in a real gym, instead of a form that could not work.
 */

import { createContext, useContext, type ReactNode } from 'react';

import { Button, Card, EmptyState, PageHeader, color, font, space } from '../ui/kit';
import { navigate } from '../ui/router';

/** What the demo knows about this device: only whether to offer "Back to my gym". */
export interface DemoInfo {
  /** This device is signed in to a real gym (read before the lock went on). */
  hasOwnGym: boolean;
}

const DemoContext = createContext<DemoInfo | null>(null);

export const DemoProvider = DemoContext.Provider;

/** null when this is the real app; the info when this is the demo gym. */
export function useDemo(): DemoInfo | null {
  return useContext(DemoContext);
}

export const DEMO_BANNER_WORDS = 'Demo gym: made-up data. Nothing you do here is saved.';
/** Where "Leave the demo" goes for someone with no gym of their own. */
export const LANDING_URL = 'https://mettleup.fit/';
/** The fixed height of the banner; the sidebar and phone header sit under it (AppShell). */
export const DEMO_BAR_HEIGHT = 60;

/** The strip at the top of every demo screen, with the way out. */
export function DemoBar({ hasOwnGym }: DemoInfo) {
  return (
    <div
      role="region"
      aria-label="Demo gym"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        height: DEMO_BAR_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        padding: `0 ${space.md}px`,
        background: color.accent,
        color: '#1F0D05',
        fontFamily: font.body,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{DEMO_BANNER_WORDS}</span>
      <a
        href={hasOwnGym ? '/' : LANDING_URL}
        style={{
          flexShrink: 0,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 14px',
          borderRadius: 999,
          background: '#1F0D05',
          color: '#FFFFFF',
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {hasOwnGym ? 'Back to my gym' : 'Leave the demo'}
      </a>
    </div>
  );
}

/** What each page that needs a real gym does, in the words the demo shows in its place. */
const NEEDS_A_REAL_GYM: Record<string, { title: string; body: string }> = {
  messages: {
    title: 'Messages & offers',
    body: 'Write a message or an offer once. It reaches every member’s app inbox in seconds, and you see how many read it.',
  },
  shop: { title: 'The shop', body: 'Members order from your shop in the MettleUp app. Their orders land here for your front desk.' },
  workouts: { title: 'Workout plans', body: 'Send each member their routine. It shows up in their MettleUp app.' },
  feedback: { title: 'Send feedback', body: 'Tell MettleUp about a problem or an idea.' },
  branches: { title: 'All branches', body: 'If you run more than one gym, see every branch’s numbers together.' },
  'members/import': { title: 'Importing members', body: 'Bring your members in from an Excel or CSV file in one go.' },
  'members/app': { title: 'Members using the app', body: 'See who joined your gym in the MettleUp app.' },
  'settings': { title: 'Settings', body: 'Your gym’s details, the member app switch, staff sign-in and your data.' },
  'settings/people': { title: 'Staff & sign-in', body: 'Choose who can open this admin app, and their PINs.' },
  'settings/branding': { title: 'Branding', body: 'Add your gym’s logo and colours. Members see them in the MettleUp app.' },
  'settings/invite': { title: 'The invite link', body: 'A link and a QR poster for members to join your gym in the app.' },
};

/** The demo's page for a route that needs a real gym, or null when the demo can show it. PURE. */
export function demoNeedsRealGym(head: string | undefined, id: string | undefined): { title: string; body: string } | null {
  if (!head) return null;
  if (head === 'settings') return NEEDS_A_REAL_GYM[`settings/${id ?? ''}`] ?? NEEDS_A_REAL_GYM.settings!;
  if (head === 'members') return id === 'import' || id === 'app' ? NEEDS_A_REAL_GYM[`members/${id}`]! : null;
  return NEEDS_A_REAL_GYM[head] ?? null;
}

/** In the demo, in place of a page that works only in a real gym. */
export function DemoNeedsRealGym({ page }: { page: { title: string; body: string } }): ReactNode {
  return (
    <>
      <PageHeader title={page.title} />
      <Card>
        <EmptyState
          title="This works in your own gym"
          body={`${page.body} The demo gym is made-up data kept only on this page, so this part is switched off here.`}
          action={
            <Button variant="ghost" onClick={() => navigate('/')}>
              Back to Today
            </Button>
          }
        />
      </Card>
    </>
  );
}
