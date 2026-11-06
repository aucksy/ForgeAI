/**
 * Billing step 1 (R-384/R-385): the line at the top of Today when a gym has stopped paying: 7 extra
 * days, then basic mode, then read-only (logic/gymState.ts has the words). The owner gets "Pay now"
 * (Settings -> Pay MettleUp); the desk is told to ask the owner.
 *
 * Shown ONLY while PLAN_GATE_ON (packages/theme/src/plans.ts) is on: with it off this asks the server
 * nothing and renders nothing. Online gyms only (not a demo gym, not a browser-only gym). Before 0062
 * is on the server, or on any error, nothing shows (the error is logged).
 */
import { useEffect, useState } from 'react';

import { PLAN_GATE_ON } from '@forgeai/theme';

import { useAuth, useRole } from '../auth/AuthProvider';
import { gymStateFromRow, lapseBanner, PAY_NOW, type GymStateInfo, type LapseWords } from '../logic/gymState';
import { PAY_PATH } from '../logic/trial';
import { call } from '../shop/api';
import { color, font, radius, space } from './kit';

/** The banner's words for this gym, or null (switch off, active, not known yet). */
export function useLapseWords(): LapseWords | null {
  const { session } = useAuth();
  const role = useRole();
  const key = PLAN_GATE_ON && session && session.online && !session.demo ? session.ownerKey : '';
  const [info, setInfo] = useState<GymStateInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!key) return;
    let live = true;
    call<unknown>('owner_gym_state', { p_key: key })
      .then((r) => {
        if (live) setInfo(gymStateFromRow(r));
      })
      .catch((e: unknown) => console.warn('[ForgeErr] gym state: owner_gym_state failed (0062 not on the server yet?)', e));
    return () => {
      live = false;
    };
  }, [key]);
  return key ? lapseBanner(info, role === 'owner', PLAN_GATE_ON) : null;
}

export function LapseBanner({ words }: { words: LapseWords }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: `${space.sm}px ${space.lg}px`,
        marginBottom: space.lg,
        padding: `${space.md}px ${space.lg}px`,
        borderRadius: radius.md,
        border: `1px solid ${color.accent}`,
        background: color.accentSoft,
        fontFamily: font.body,
        fontSize: 14,
        color: color.ink,
      }}
    >
      <span style={{ flex: '1 1 240px', minWidth: 0 }}>{words.text}</span>
      {words.payLink && (
        <a href={`#${PAY_PATH}`} style={{ color: color.accentBright, fontWeight: 700, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
          {PAY_NOW}
        </a>
      )}
    </div>
  );
}
