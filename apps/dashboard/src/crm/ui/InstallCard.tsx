/**
 * "Phone par app lagao" — put the panel on the phone's home screen like any other app (Gym Panel
 * step 2). One button when Chrome can open its own install sheet; otherwise the two or three taps
 * to do it by hand, for Android Chrome and for iPhone Safari. Hidden once the panel is installed.
 *
 * `variant="banner"` is the slim card on the Today screen (phones only), which the owner can close
 * for good; Settings always shows the full card.
 */

import { useState } from 'react';

import { installSteps, runningAsApp, useInstall } from '../install';
import { Button, Card, SectionTitle, color, font, radius, space, useIsCompact } from './kit';

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
        <SectionTitle>{platform === 'computer' ? 'Admin app on this computer' : 'Admin app on your phone'}</SectionTitle>
        <p style={body}>
          {/* R-446 fresh-eyes: inside the home-screen app, "open it from the icon" told the owner to open what he was in. */}
          {platform === 'computer'
            ? 'The admin app is installed on this computer. It opens in its own window.'
            : runningAsApp()
              ? 'You are using the admin app from your home screen. It stays here, ready in one tap.'
              : 'The admin app is on your home screen. Open it from the MettleUp Admin icon.'}
        </p>
      </Card>
    );
  }
  if (variant === 'banner' && (closed || !compact)) return null;

  const steps = installSteps(platform, typeof navigator !== 'undefined' ? navigator.userAgent : '');
  // R-446: an iPhone has no install sheet a button could open, so the steps show at once (a button that only
  // reveals a hint read as "nothing happened" to the owner).
  // The slim Today banner keeps one button ("Show me how") so it stays small.
  const stepsOpen = showSteps || (platform === 'iphone' && variant === 'full');
  // R-446 fresh-eyes (10 Nov 2026): "Install the admin app" only when Chrome can really open its install sheet;
  // otherwise the button only shows the steps, so it says "Show me how" and goes once they are open (it stayed
  // and did nothing on a second tap). If Chrome offers its sheet later, the Install button comes back.
  const showButton = canPrompt || !stepsOpen;
  const computer = platform === 'computer';

  const install = async () => {
    if (canPrompt) {
      if (await prompt()) setDone(true);
      return;
    }
    setShowSteps(true);
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      {/* Fresh-eyes: the line under the title repeated it, and a computer was told "on your phone". */}
      <SectionTitle>{computer ? 'Install the admin app on this computer' : 'Put the admin app on your phone'}</SectionTitle>
      <p style={body}>
        {computer
          ? 'It opens in its own window, like any other program.'
          : 'It sits on your home screen and opens full screen, in one tap.'}
      </p>
      {stepsOpen && (
        <ol
          role="status"
          style={{
            margin: `${space.md}px 0 0`,
            padding: `${space.md}px ${space.md}px ${space.md}px 32px`,
            background: color.accentSoft,
            border: `2px solid ${color.accent}`,
            borderRadius: radius.md,
            fontFamily: font.body,
            fontSize: 16,
            lineHeight: 1.45,
            color: color.ink,
            fontWeight: 600,
          }}
        >
          {steps.map((s) => (
            <li key={s} style={{ marginBottom: 6 }}>
              {s}
            </li>
          ))}
        </ol>
      )}
      <div style={{ marginTop: space.lg, display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
        {showButton && <Button onClick={() => void install()}>{canPrompt ? 'Install the admin app' : 'Show me how'}</Button>}
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
            Not now
          </Button>
        )}
      </div>
    </Card>
  );
}
