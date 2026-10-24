/**
 * Settings → Your data → MettleUp access (#51, MettleUp HQ step 3). The gym owner sees every time
 * MettleUp support opened this gym's records (the gym's own "Let MettleUp support look" button, or
 * MettleUp in an emergency), what was looked at, and every other MettleUp action on the gym. The
 * button opens read-only support access for one hour; "Close it now" ends it early.
 * Owners of an online gym only (the server refuses anyone else). Before migration 0028 is live the
 * card says so and shows nothing else.
 */
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import {
  actionLine,
  closeSupportAccess,
  grantLine,
  letSupportLook,
  loadHqAccess,
  notLiveYet,
  openGrant,
  type HqAccess,
} from '../auth/hqAccess';
import { authErrorWords, SUSPENDED_WORDS } from '../auth/signin';
import { Button, Card, ErrorBanner, SectionTitle, Sheet, color, font, space } from './kit';

export const FORGE_ACCESS_WORDS = {
  title: 'MettleUp access',
  intro:
    'MettleUp sees only your gym’s totals (how many members, check-ins and money in all), never a member’s name or number. MettleUp support can look at your records only when you let them, for one hour at most, and only to read. Every look is listed here.',
  ask: 'Let MettleUp support look (1 hour)',
  sheetTitle: 'Let MettleUp support look?',
  sheetBody:
    'MettleUp support can read your members, plans, receipts, check-ins, shop orders and staff list for the next hour, to help with what you asked. They cannot change anything. It closes by itself after an hour, and every look is listed here.',
  yes: 'Yes, for 1 hour',
  close: 'Close it now',
  none: 'MettleUp has never opened your records.',
  notLive: 'MettleUp access is not switched on for your gym yet.',
} as const;

const small = { margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkMuted } as const;
const body = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

export function ForgeAccessCard() {
  const { session } = useAuth();
  const key = session?.ownerKey ?? '';
  const [access, setAccess] = useState<HqAccess | null>(null);
  const [notLive, setNotLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const closeAsk = useCallback(() => setAsking(false), []);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      setAccess(await loadHqAccess(key));
      setNotLive(false);
      setError(null);
    } catch (e) {
      if (notLiveYet(e)) {
        console.warn('[ForgeErr] owner_hq_access not on the server yet (migration 0028)', e);
        setNotLive(true);
        return;
      }
      console.warn('[ForgeErr] owner_hq_access failed', e);
      setError(authErrorWords(e));
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      console.warn('[ForgeErr] support access change failed', e);
      setError(authErrorWords(e));
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  const open = access ? openGrant(access) : null;

  return (
    <Card style={{ marginTop: space.lg }}>
      <SectionTitle>{FORGE_ACCESS_WORDS.title}</SectionTitle>
      {access?.status === 'suspended' && <ErrorBanner>{SUSPENDED_WORDS}</ErrorBanner>}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={body}>{FORGE_ACCESS_WORDS.intro}</p>

      {notLive ? (
        <p style={small}>{FORGE_ACCESS_WORDS.notLive}</p>
      ) : (
        <>
          <div style={{ marginTop: space.lg }}>
            {open ? (
              <Button variant="ghost" tone="danger" disabled={busy || !key} onClick={() => run(() => closeSupportAccess(key))}>
                {FORGE_ACCESS_WORDS.close}
              </Button>
            ) : (
              <Button variant="ghost" wrap disabled={busy || !key || !access} onClick={() => setAsking(true)}>
                {FORGE_ACCESS_WORDS.ask}
              </Button>
            )}
          </div>
          {access && (
            <ul style={{ margin: `${space.lg}px 0 0`, padding: 0, listStyle: 'none' }} aria-label="MettleUp access list">
              {access.grants.length === 0 && access.actions.length === 0 && <li style={body}>{FORGE_ACCESS_WORDS.none}</li>}
              {access.grants.map((g) => (
                <li key={g.grantId} style={{ ...body, padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
                  {grantLine(g)}
                </li>
              ))}
              {access.actions.map((a) => (
                <li key={`${a.at}-${a.action}`} style={{ ...body, padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
                  {actionLine(a)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {asking && (
        <Sheet
          title={FORGE_ACCESS_WORDS.sheetTitle}
          onClose={closeAsk}
          footer={
            <>
              <Button variant="ghost" onClick={closeAsk}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => run(() => letSupportLook(key))}>
                {FORGE_ACCESS_WORDS.yes}
              </Button>
            </>
          }
        >
          <p style={body}>{FORGE_ACCESS_WORDS.sheetBody}</p>
        </Sheet>
      )}
    </Card>
  );
}
