/**
 * "Phone par app lagao" — put the panel on the phone's home screen like any other app (Gym Panel
 * step 2). One button when Chrome can open its own install sheet; otherwise the two or three taps
 * to do it by hand, for Android Chrome and for iPhone Safari. Hidden once the panel is installed.
 *
 * `variant="banner"` is the slim card on the Today screen (phones only), which the owner can close
 * for good; Settings always shows the full card.
 */

import { useState } from 'react';

import { useInstall } from '../install';
import { Button, Card, SectionTitle, color, font, space, useIsCompact } from './kit';

const DISMISS_KEY = 'forgeai.installBanner.closed';

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

const body = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

export function InstallCard({ variant = 'full' }: { variant?: 'full' | 'banner' }) {
  const { installed, canPrompt, platform, prompt } = useInstall();
  const compact = useIsCompact();
  const [closed, setClosed] = useState(dismissed);
  const [showSteps, setShowSteps] = useState(false);
  const [done, setDone] = useState(false);

  if (installed || done) {
    if (variant === 'banner') return null;
    return (
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{'Admin app on your phone'}</SectionTitle>
        <p style={body}>
          {'The admin app is on your home screen. Open it from the ForgeAI Admin icon.'}
        </p>
      </Card>
    );
  }
  if (variant === 'banner' && (closed || !compact)) return null;

  const steps =
    platform === 'iphone'
      ? 'Tap the Share button (the square with an arrow), then “Add to Home Screen”.'
      : platform === 'android'
        ? 'In Chrome, tap ⋮ at the top right, then “Add to Home screen” or “Install app”.'
        : 'In Chrome or Edge, click the install icon at the right end of the address bar.';

  const install = async () => {
    if (canPrompt) {
      if (await prompt()) setDone(true);
      return;
    }
    setShowSteps(true);
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{'Put the admin app on your phone'}</SectionTitle>
      <p style={body}>
        {'Put the admin app on your home screen. It opens full screen, in one tap.'}
      </p>
      {showSteps && (
        <p style={{ ...body, marginTop: space.md, color: color.ink }} role="status">
          {steps}
        </p>
      )}
      <div style={{ marginTop: space.lg, display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
        <Button onClick={() => void install()}>{'Install the admin app'}</Button>
        {variant === 'banner' && (
          <Button
            variant="quiet"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, '1');
              } catch {
                // quiet: a private window cannot save it; it stays closed until the page reloads.
              }
              setClosed(true);
            }}
          >
            {'Not now'}
          </Button>
        )}
      </div>
    </Card>
  );
}
