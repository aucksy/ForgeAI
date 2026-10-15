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
import { tr } from '../i18n';
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
        title={tr('Check-in QR', 'Check-in QR')}
        subtitle={tr(
          'Members scan it with the ForgeAI app and check themselves in',
          'Members ForgeAI app se scan karke khud hazri lagate hain',
        )}
        actions={
          <Button variant="ghost" onClick={() => navigate('/attendance')}>
            {tr('Back to the register', 'Register par wapas')}
          </Button>
        }
      />
      {online && session && joinCode ? (
        <PosterBody ownerKey={session.ownerKey} gymName={snapshot.gym.name} joinCode={joinCode} />
      ) : (
        <Card>
          <EmptyState
            title={tr('Put your records online first', 'Pehle apne records online karo')}
            body={tr(
              'A member’s phone writes the check-in into your gym’s online records, so self check-in needs them online. Settings → put your records online, then come back here for the poster.',
              'Member ka phone hazri aapke gym ke online records mein likhta hai, isliye khud hazri ke liye records online hone chahiye. Settings → records online karo, phir poster ke liye yahan wapas aao.',
            )}
            action={<Button onClick={() => navigate('/settings')}>{tr('Open Settings', 'Settings kholo')}</Button>}
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
        <SectionTitle>{tr('Scan to check in', 'Scan karke hazri')}</SectionTitle>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <Poster words={CHECKIN_POSTER} gymName={gymName} joinCode={joinCode} link={link} brand={brand} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg }}>
          <Button onClick={() => window.print()}>{tr('Print poster', 'Poster print karo')}</Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await downloadPoster(CHECKIN_POSTER, gymName, joinCode, link, brand);
              say(
                ok
                  ? tr('Poster saved as a picture.', 'Poster picture ki tarah save ho gaya.')
                  : tr('Could not make the picture. Try Print poster.', 'Picture nahi bani. Poster print karo try karo.'),
              );
            }}
          >
            {tr('Download picture', 'Picture download karo')}
          </Button>
        </div>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {tr(
            'Print it on A4 and stick it where members walk in. On a phone, Print → “Save as PDF” works too; the picture is for a print shop.',
            'A4 par print karke entry par lagao. Phone par Print → “Save as PDF” bhi chalta hai; picture print shop ke liye hai.',
          )}
        </p>
      </Card>

      <Card>
        <SectionTitle>{tr('How it works', 'Yeh kaise chalta hai')}</SectionTitle>
        <ol style={{ margin: 0, paddingLeft: 20, fontFamily: font.body, fontSize: 14, lineHeight: 1.6, color: color.inkSecondary }}>
          <li>
            {tr(
              'The member scans the poster with their phone camera. The ForgeAI app opens and checks them in.',
              'Member phone ke camera se poster scan karta hai. ForgeAI app khulta hai aur hazri lag jaati hai.',
            )}
          </li>
          <li>
            {tr(
              'The app finds them in your Members by their mobile number. The first time, it asks for the number once.',
              'App unhe aapke Members mein mobile number se dhoondhta hai. Pehli baar number ek baar poochta hai.',
            )}
          </li>
          <li>
            {tr(
              'The check-in shows in today’s register within a few seconds, with a small “App” tag. Scanning twice in a day counts once.',
              'Hazri kuch second mein aaj ke register mein dikhti hai, chhote “App” tag ke saath. Ek din mein do baar scan = ek hazri.',
            )}
          </li>
        </ol>
        <p style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {tr(
            'A member whose mobile number is not in your Members is told to ask the desk. Add or fix their number, and they scan again.',
            'Jis member ka mobile number aapke Members mein nahi hai, unhe desk se poochne ko kaha jata hai. Unka number jodo ya theek karo, phir woh dobara scan karein.',
          )}
        </p>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {tr(
            `Members need the ForgeAI app and to have joined your gym in it (code ${joinCode}). Settings → Invite members has the join poster.`,
            `Members ke paas ForgeAI app hona chahiye aur usme aapka gym join kiya ho (code ${joinCode}). Settings → Invite members mein join wala poster hai.`,
          )}
        </p>
        <div style={{ marginTop: space.md }}>
          <Button variant="ghost" onClick={() => navigate('/settings/invite')}>
            {tr('Open Invite members', 'Invite members kholo')}
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
