/**
 * Settings cards for sign-in (14 Oct 2026; Gym Panel step 1).
 *
 *  - Records still in this browser: "Put your records online" (your name + mobile). The gym gets
 *    its owner as a person, every record is copied up, and from then on this device works online.
 *    If the copy stops half-way (the internet drops), the sign-in is already kept on this device,
 *    so the next press carries on with the same online gym instead of making a second one.
 *    Also "Already online? Sign in" for a device that should join an online gym instead.
 *    Review fixes (0011): a DEMO gym is never put online (its made-up members could never be
 *    erased from an online gym); anything saved in this browser WHILE the copy ran is copied too
 *    (the browser's copy is read again until it stops changing); and the old owner key is retired
 *    once the records are online.
 *  - Records online: who is signed in, and the way to Staff & sign-in.
 */

import { useCallback, useState } from 'react';

import type { CrmSnapshot } from '../data/adapter';
import { uploadSnapshot } from '../data/cloud';
import { tr } from '../i18n';
import { STORAGE_KEY } from '../data/local';
import { readCloudGym, writeCloudGym } from '../shop/cloudGym';
import { useCrm } from '../store';
import { Button, Card, ErrorBanner, SectionTitle, Sheet, TextField, color, font, space } from '../ui/kit';
import { navigate } from '../ui/router';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { SignInForm } from './SignInForms';
import { authErrorWords, formatMobile, normalizeMobile, type SignedIn } from './signin';

const bodyText = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

export function SignInCard() {
  const { session } = useAuth();
  if (session?.online && session.person) return <SignedInCard />;
  return <GoOnlineCard />;
}

function SignedInCard() {
  const { session } = useAuth();
  const me = session?.person;
  if (!me) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{tr('Staff & sign-in', 'Staff ka login')}</SectionTitle>
      <p style={bodyText}>
        {tr('Signed in as ', 'Sign in hai: ')}
        <b style={{ color: color.ink }}>{me.name}</b> (+91 {formatMobile(me.phone)},{' '}
        {me.role === 'owner' ? tr('owner', 'Owner') : tr('staff', 'Staff')}
        {tr(
          '). Your records are online: open them on any phone or computer.',
          '). Aapke records Online hain: kisi bhi phone ya computer par kholo.',
        )}
      </p>
      <div style={{ marginTop: space.lg }}>
        <Button onClick={() => navigate('/settings/people')}>
          {me.role === 'owner' ? tr('Staff & sign-in codes', 'Staff aur Sign-in code') : tr('Open', 'Kholo')}
        </Button>
      </div>
    </Card>
  );
}

/** This browser's saved gym exactly as stored, and the gym in it. */
function readBrowserGym(): { raw: string | null; snap: CrmSnapshot | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { raw, snap: null };
    return { raw, snap: (JSON.parse(raw) as { snapshot: CrmSnapshot }).snapshot ?? null };
  } catch {
    return { raw: null, snap: null };
  }
}

function GoOnlineCard() {
  const pending = readCloudGym();
  if (pending?.demo && !pending.person) return <DemoGymCard />;
  return <PutOnlineCard />;
}

/** The demo's made-up members stay in this browser: a real gym starts from "Start over". */
function DemoGymCard() {
  const [signingIn, setSigningIn] = useState(false);
  const closeSignIn = useCallback(() => setSigningIn(false), []);
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{tr('This is the demo gym', 'Yeh demo gym hai')}</SectionTitle>
      <p style={bodyText}>
        {tr(
          'Its members are made up, and they stay in this browser only. To set up your real gym online, tap “Start over with a new demo gym” at the bottom of this page, then “New here? Set up your gym”.',
          'Iske members banawati hain, aur sirf is browser mein rehte hain. Apna asli gym Online banane ke liye, is page ke neeche “Start over with a new demo gym” dabao, phir “Naye hain? Apna gym banaiye”.',
        )}
      </p>
      <div style={{ marginTop: space.md }}>
        <Button variant="quiet" onClick={() => setSigningIn(true)}>
          {tr('Your gym is already online? Sign in instead', 'Gym pehle se online hai? Sign in karo')}
        </Button>
      </div>
      {signingIn && (
        <Sheet title={tr('Sign in to your online gym', 'Apne online gym mein sign in karo')} onClose={closeSignIn}>
          <SignInForm />
        </Sheet>
      )}
    </Card>
  );
}

function PutOnlineCard() {
  const { adopt } = useAuth();
  const { snapshot } = useCrm();
  const pending = readCloudGym();
  const resuming = Boolean(pending?.person && !pending.online);

  const [name, setName] = useState(pending?.person?.name ?? '');
  const [phone, setPhone] = useState(pending?.person?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const closeSignIn = useCallback(() => setSigningIn(false), []);

  const go = async () => {
    const ten = normalizeMobile(phone);
    if (!resuming && !name.trim()) return setError(tr('Type your name.', 'Apna naam likho.'));
    if (!resuming && !ten) return setError(tr('Type a 10-digit mobile number, like 98290 12345.', '10 digit ka mobile number likho, jaise 98290 12345.'));
    setBusy(true);
    setError(null);
    try {
      const cloud = readCloudGym();
      let signed: SignedIn;
      if (cloud?.person) {
        // A sign-in from an earlier try that stopped half-way: carry on with the same gym.
        signed = { gymId: cloud.gymId, name: cloud.name, joinCode: cloud.joinCode, sessionKey: cloud.ownerKey, person: cloud.person };
      } else if (cloud) {
        // The member app was already on (an owner key): that gym becomes the online gym.
        signed = await authApi.goOnline(cloud.ownerKey, name, ten ?? '');
      } else {
        signed = await authApi.createOnlineGym(snapshot.gym.name, name, ten ?? '');
      }
      // Kept now, before the copy: a copy that stops half-way must not make a second gym next time.
      writeCloudGym({
        gymId: signed.gymId,
        ownerKey: signed.sessionKey,
        joinCode: signed.joinCode,
        name: signed.name,
        demo: cloud?.demo === true,
        online: false,
        person: signed.person,
      });
      // Copy, then read the browser's copy again: a check-in saved meanwhile (here or in another
      // tab) goes up too. Rows are written by id, so copying again only overwrites the same rows.
      let { raw, snap } = readBrowserGym();
      for (let round = 0; round < 3; round += 1) {
        await uploadSnapshot(authApi.cloudApi, signed.sessionKey, snap ?? snapshot, signed.gymId);
        const again = readBrowserGym();
        if (again.raw === raw) break;
        ({ raw, snap } = again);
      }
      // The old owner key stops working: from now on the way in is the Staff & sign-in list.
      await authApi.retireOwnerKey(signed.sessionKey).catch(() => undefined);
      navigate('/settings/people');
      adopt(signed, { online: true, demo: false });
    } catch (e) {
      const carryOn = resuming || readCloudGym()?.person;
      setError(
        tr(
          `${authErrorWords(e)} Nothing in this browser was lost${carryOn ? ' — press the button again to carry on' : ''}.`,
          `${authErrorWords(e)} Is browser se kuch nahi gaya${carryOn ? ' — aage badhne ke liye button phir dabao' : ''}.`,
        ),
      );
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{tr('Put your records online', 'Records online daalo')}</SectionTitle>
      <p style={bodyText}>
        {tr(
          'Right now your members and payments live only in this browser. If it is cleared, or this computer breaks, they are gone. Online, they are safe, and you and your staff open them on any phone or computer with a mobile number.',
          'Abhi aapke Members aur payments sirf is browser mein hain. Browser saaf hua ya computer kharab hua, to sab chala jayega. Online woh safe rehte hain, aur aap aur aapka Staff Mobile number se kisi bhi phone ya computer par khol sakte hain.',
        )}
      </p>
      {!resuming && (
        <>
          <TextField label={tr('Your name', 'Aapka naam')} value={name} onChange={setName} placeholder="Ramesh Sharma" />
          <TextField
            label={tr('Your mobile number', 'Aapka mobile number')}
            prefix="+91"
            inputMode="tel"
            value={phone}
            onChange={setPhone}
            placeholder="98290 12345"
            hint={tr('You sign in with this number.', 'Is number se aap sign in karenge.')}
          />
        </>
      )}
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        <Button disabled={busy} onClick={() => void go()}>
          {busy
            ? tr('Copying your records…', 'Aapke records copy ho rahe hain…')
            : resuming
              ? tr('Finish putting records online', 'Records online daalna poora karo')
              : tr('Put my records online', 'Mere records online daalo')}
        </Button>
      </div>
      <div style={{ marginTop: space.md }}>
        <Button variant="quiet" onClick={() => setSigningIn(true)}>
          {tr('Your gym is already online? Sign in instead', 'Gym pehle se online hai? Sign in karo')}
        </Button>
      </div>

      {signingIn && (
        <Sheet title={tr('Sign in to your online gym', 'Apne online gym mein sign in karo')} onClose={closeSignIn}>
          <ErrorBanner>
            {tr(
              'This device then shows your online gym. The records in this browser are kept aside, not mixed in.',
              'Phir yeh device aapka Online gym dikhayega. Is browser ke records alag rakhe jayenge, mile-jule nahi.',
            )}
          </ErrorBanner>
          <SignInForm />
        </Sheet>
      )}
    </Card>
  );
}
