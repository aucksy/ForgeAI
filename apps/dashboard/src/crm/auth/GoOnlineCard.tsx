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
import { isDemoGym } from '../data/demo';
import { normalizeSnapshot, STORAGE_KEY } from '../data/local';
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
  // A Staff person never puts a gym online (that is the owner's step): they only see who they are.
  if (session?.person && (session.online || session.person.role === 'staff')) return <SignedInCard />;
  return <GoOnlineCard />;
}

function SignedInCard() {
  const { session } = useAuth();
  const me = session?.person;
  if (!me) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Staff & sign-in</SectionTitle>
      <p style={bodyText}>
        {'Signed in as '}
        <b style={{ color: color.ink }}>{me.name}</b> (+91 {formatMobile(me.phone)},{' '}
        {me.role === 'owner' ? 'owner' : 'staff'}
        ). Your gym is online. Open it on any phone or computer.
      </p>
      <div style={{ marginTop: space.lg }}>
        <Button onClick={() => navigate('/settings/people')}>
          {me.role === 'owner' ? 'Staff & sign-in codes' : 'Your sign-in, or sign out'}
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
    // An older browser gym has no enquiries or expenses lists: fill them in before copying it up.
    const snap = (JSON.parse(raw) as { snapshot?: CrmSnapshot }).snapshot;
    return { raw, snap: snap ? normalizeSnapshot(snap) : null };
  } catch {
    return { raw: null, snap: null };
  }
}

function GoOnlineCard() {
  const { snapshot } = useCrm();
  const pending = readCloudGym();
  if (pending?.demo && !pending.person) return <DemoGymCard />;
  // UAT U-A12: the demo opened without the shop (no internet), or loaded over this browser's gym,
  // is made-up members too. Put online, they could never be erased from the online gym.
  if (isDemoGym(snapshot.gym) && !pending?.person) return <DemoGymCard browserOnly />;
  return <PutOnlineCard />;
}

/**
 * The demo's made-up members stay in this browser: a real gym starts from "Start over" (a demo with
 * a shop) or "Erase and start fresh" (a demo kept only in this browser, `browserOnly`).
 */
function DemoGymCard({ browserOnly = false }: { browserOnly?: boolean }) {
  const [signingIn, setSigningIn] = useState(false);
  const closeSignIn = useCallback(() => setSigningIn(false), []);
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>This is the demo gym</SectionTitle>
      <p style={bodyText}>
        {browserOnly
          ? 'Its members are made up, and they are kept only in this browser. They can’t be put online. To set up your real gym, tap “Erase and start fresh” at the bottom of this page. Then add your members and put your gym online.'
          : 'Its members are made up, and they are kept only in this browser. To set up your real gym, tap “Start over with a new demo gym” at the bottom of this page. Then tap “New here? Set up your gym”.'}
      </p>
      <div style={{ marginTop: space.md }}>
        <Button variant="quiet" onClick={() => setSigningIn(true)}>
          Your gym is already online? Sign in instead
        </Button>
      </div>
      {signingIn && (
        <Sheet title="Sign in to your online gym" onClose={closeSignIn}>
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
    if (!resuming && !name.trim()) return setError('Type your name.');
    if (!resuming && !ten) return setError('Type a 10-digit mobile number, like 98290 12345.');
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
        `${authErrorWords(e)} Nothing in this browser was lost.${carryOn ? ' Tap the button again to continue.' : ''}`,
      );
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Put your gym online</SectionTitle>
      <p style={bodyText}>
        Right now your members and payments are only in this browser. If the browser is cleared, or this computer breaks, you lose them. Online, they are safe. You and your staff can open them on any phone or computer with a mobile number.
      </p>
      {!resuming && (
        <>
          <TextField label="Your name" value={name} onChange={setName} placeholder="Ramesh Sharma" />
          <TextField
            label="Your mobile number"
            prefix="+91"
            inputMode="tel"
            value={phone}
            onChange={setPhone}
            placeholder="98290 12345"
            hint="You sign in with this number."
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
            ? 'Putting your gym online…'
            : resuming
              ? 'Finish going online'
              : 'Put gym online'}
        </Button>
      </div>
      <div style={{ marginTop: space.md }}>
        <Button variant="quiet" onClick={() => setSigningIn(true)}>
          Your gym is already online? Sign in instead
        </Button>
      </div>

      {signingIn && (
        <Sheet title="Sign in to your online gym" onClose={closeSignIn}>
          <ErrorBanner>
            This device then shows your online gym. The members in this browser are kept aside. They are not mixed in.
          </ErrorBanner>
          <SignInForm />
        </Sheet>
      )}
    </Card>
  );
}
