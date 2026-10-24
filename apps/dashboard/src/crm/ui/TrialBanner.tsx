/**
 * The free-trial line on the owner's Today screen (R-97, migration 0030). Calm while there is time;
 * stronger in the last 14 days, with "See prices"; after the end, says so and that the members' app
 * keeps working. Words only: nothing in the admin app is locked when a trial ends.
 *
 * Shown only to the OWNER of an ONLINE gym (not a demo gym, not a browser-only gym), and only when
 * the server sent the trial (owner_hq_access "trial"). Before 0030 is applied, or on any error,
 * nothing shows (the error is logged).
 */
import { useEffect, useState } from 'react';

import { useAuth, useRole } from '../auth/AuthProvider';
import { loadHqAccess, notLiveYet } from '../auth/hqAccess';
import { PLANS_URL, SEE_PLANS, trialBanner, type GymTrial } from '../logic/trial';
import { color, font, radius, space } from './kit';

function useGymTrial(): GymTrial | null {
  const { session } = useAuth();
  const role = useRole();
  const key = session && session.online && !session.demo && role === 'owner' ? session.ownerKey : '';
  const [trial, setTrial] = useState<GymTrial | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    loadHqAccess(key)
      .then((a) => {
        if (live) setTrial(a.trial);
      })
      .catch((e: unknown) => {
        if (notLiveYet(e)) console.warn('[ForgeErr] trial: owner_hq_access not on the server yet', e);
        else console.warn('[ForgeErr] trial: owner_hq_access failed', e);
      });
    return () => {
      live = false;
    };
  }, [key]);
  return key ? trial : null;
}

export function TrialBanner() {
  const trial = useGymTrial();
  const words = trialBanner(trial, Date.now());
  if (!words) return null;
  const strong = words.tone !== 'calm';
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: `${space.sm}px ${space.lg}px`,
        marginBottom: space.lg,
        padding: `${space.md}px ${space.lg}px`,
        borderRadius: radius.md,
        border: `1px solid ${strong ? color.accent : color.border}`,
        background: strong ? color.accentSoft : color.surface,
        fontFamily: font.body,
        fontSize: 14,
        color: strong ? color.ink : color.inkSecondary,
      }}
    >
      <span style={{ flex: '1 1 240px', minWidth: 0 }}>{words.text}</span>
      {words.showPlans && (
        <a
          href={PLANS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: color.accentBright, fontWeight: 600, textDecoration: 'underline', whiteSpace: 'nowrap' }}
        >
          {SEE_PLANS}
        </a>
      )}
    </div>
  );
}
