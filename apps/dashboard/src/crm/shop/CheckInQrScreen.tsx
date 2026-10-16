/**
 * Attendance → Check-in QR (15 Oct 2026): the gym's "Scan to check in" poster. Printed on A4 (the
 * browser's print — "Save as PDF" works on a phone too) or downloaded as a picture for a print
 * shop. The same drawing as the invite poster (InviteScreen.tsx), with the check-in link
 * (checkin.ts) and words. A member scanning it with the ForgeAI app is checked in at once and
 * shows in the register with a small "App" tag.
 *
 * Only for a gym whose records are ONLINE: the member's phone writes the visit into those records
 * (member_check_in, 0015). A browser-only gym is told how to get there instead of being handed a
 * poster that would answer every member with "not online".
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { GymBrand } from '@forgeai/theme';

import { useAuth } from '../auth/AuthProvider';
import { useCrm } from '../store';
import { Button, Card, EmptyState, PageHeader, SectionTitle, Toast, color, font, space, useIsCompact } from '../ui/kit';
import { navigate } from '../ui/router';
import * as api from './api';
import { CHECKIN_POSTER, checkInLink } from './checkin';
import { Poster, PrintSheet, downloadPoster } from './InviteScreen';

export function CheckInQrScreen() {
  const { session } = useAuth();
  const { snapshot } = useCrm();
  const online = session?.online === true;
  const joinCode = (snapshot.gym.joinCode || session?.joinCode || '').trim().toUpperCase();

  return (
    <>
      <PageHeader
        title={'Check-in QR'}
        subtitle={'Members scan it with the ForgeAI app and check themselves in'}
        actions={
          <Button variant="ghost" onClick={() => navigate('/attendance')}>
            {'Back to the register'}
          </Button>
        }
      />
      {online && session && joinCode ? (
        <PosterBody ownerKey={session.ownerKey} gymName={snapshot.gym.name} joinCode={joinCode} />
      ) : (
        <Card>
          <EmptyState
            title={'Put your records online first'}
            body={'A member’s phone writes the check-in into your gym’s online records, so self check-in needs them online. Settings → put your records online, then come back here for the poster.'}
            action={<Button onClick={() => navigate('/settings')}>{'Open Settings'}</Button>}
          />
        </Card>
      )}
    </>
  );
}

function PosterBody({ ownerKey, gymName, joinCode }: { ownerKey: string; gymName: string; joinCode: string }) {
  const compact = useIsCompact();
  const link = checkInLink(joinCode);
  const [brand, setBrand] = useState<GymBrand | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // The logo for the poster. Without it the poster is still complete, so a failure only logs.
  useEffect(() => {
    let live = true;
    api
      .ownerGym(ownerKey)
      .then((g) => live && setBrand(g.brand ?? null))
      .catch((e: unknown) => console.warn('[ForgeErr] check-in poster: gym look not loaded', e));
    return () => {
      live = false;
    };
  }, [ownerKey]);

  const say = (words: string) => {
    setToast(words);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <div style={{ display: 'grid', gap: space.lg, gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <Card>
        <SectionTitle>{'Scan to check in'}</SectionTitle>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <Poster words={CHECKIN_POSTER} gymName={gymName} joinCode={joinCode} link={link} brand={brand} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg }}>
          <Button onClick={() => window.print()}>{'Print poster'}</Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await downloadPoster(CHECKIN_POSTER, gymName, joinCode, link, brand);
              say(
                ok
                  ? 'Poster saved as a picture.'
                  : 'Could not make the picture. Try Print poster.',
              );
            }}
          >
            {'Download picture'}
          </Button>
        </div>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {'Print it on A4 and stick it where members walk in. On a phone, Print → “Save as PDF” works too; the picture is for a print shop.'}
        </p>
      </Card>

      <Card>
        <SectionTitle>{'How it works'}</SectionTitle>
        <ol style={{ margin: 0, paddingLeft: 20, fontFamily: font.body, fontSize: 14, lineHeight: 1.6, color: color.inkSecondary }}>
          <li>
            {'The member scans the poster with their phone camera. The ForgeAI app opens and checks them in.'}
          </li>
          <li>
            {'The app finds them in your Members by their mobile number. The first time, it asks for the number once.'}
          </li>
          <li>
            {'The check-in shows in today’s register within a few seconds, with a small “App” tag. Scanning twice in a day counts once.'}
          </li>
        </ol>
        <p style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {'A member whose mobile number is not in your Members is told to ask the desk. Add or fix their number, and they scan again.'}
        </p>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {`Members need the ForgeAI app and to have joined your gym in it (gym code ${joinCode}). Settings → Invite members has the join poster.`}
        </p>
        <div style={{ marginTop: space.md }}>
          <Button variant="ghost" onClick={() => navigate('/settings/invite')}>
            {'Open Invite members'}
          </Button>
        </div>
      </Card>

      {/* Always on the page (hidden on screen), like the invite poster: phone Chrome draws its
          print preview after the button's tap has returned. */}
      {createPortal(
        <PrintSheet sheetId="checkin-print" words={CHECKIN_POSTER} gymName={gymName} joinCode={joinCode} link={link} brand={brand} />,
        document.body,
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
