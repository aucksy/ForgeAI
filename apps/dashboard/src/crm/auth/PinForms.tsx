/**
 * R-117 (24 Oct 2026, migration 0034): each person's own lasting 6-digit PIN.
 *
 *  - PinFields: "PIN" and "PIN again", used at Create my gym and in the sheet below.
 *  - SetPinSheet: set or change your own PIN (Settings -> Staff & sign-in, "You").
 *  - PinPrompt: once, after someone signs in with a one-time code and has no PIN yet (skippable).
 *
 * The server keeps only a slow hash of the PIN and never sends it back. Changing an existing PIN
 * needs the current one, except for 15 minutes after this device signed in with a one-time code
 * (the "forgot my PIN" way): see the migration's header for why.
 */

import { useEffect, useState } from 'react';

import { Button, ErrorBanner, Sheet, TextField, Toast, color, font } from '../ui/kit';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { askPinFor, forgetAskPin } from './pinPrompt';
import { PIN_HINT, authErrorCode, authErrorWords, cleanCode, newPinError } from './signin';

export function PinFields({
  pin,
  again,
  onPin,
  onAgain,
  label = 'Choose a 6-digit PIN',
}: {
  pin: string;
  again: string;
  onPin: (v: string) => void;
  onAgain: (v: string) => void;
  label?: string;
}) {
  return (
    <>
      <TextField
        label={label}
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(v) => onPin(cleanCode(v))}
        placeholder="••••••"
        hint={PIN_HINT}
      />
      <TextField
        label="Type the PIN again"
        type="password"
        inputMode="numeric"
        value={again}
        onChange={(v) => onAgain(cleanCode(v))}
        placeholder="••••••"
      />
    </>
  );
}

const bodyText = { margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: color.inkSecondary } as const;

export function SetPinSheet({
  sessionKey,
  phone,
  needsCurrent,
  title,
  intro,
  forgot,
  cancelLabel = 'Cancel',
  onClose,
  onSaved,
  onLost,
}: {
  sessionKey: string;
  /** This person's mobile: a PIN may not be its last 6 digits. */
  phone: string;
  needsCurrent: boolean;
  title: string;
  intro?: string;
  /** What to do when the current PIN is forgotten (shown under the current-PIN box). */
  forgot?: string;
  cancelLabel?: string;
  onClose: () => void;
  onSaved: () => void;
  /** The key stopped working (BAD_KEY). */
  onLost?: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (needsCurrent && current.length !== 6) return setError('Type your current PIN first.');
    const bad = newPinError(pin, again, phone);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      await authApi.setMyPin(sessionKey, pin, needsCurrent ? current : undefined);
      onSaved();
    } catch (e) {
      console.warn('[ForgeErr] staff_set_pin', e);
      if (authErrorCode(e) === 'BAD_KEY') onLost?.();
      setError(authErrorWords(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save my PIN'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {intro && <p style={bodyText}>{intro}</p>}
      {needsCurrent && (
        <TextField
          label="Your current PIN"
          type="password"
          inputMode="numeric"
          value={current}
          onChange={(v) => setCurrent(cleanCode(v))}
          placeholder="••••••"
          hint={forgot}
        />
      )}
      <PinFields
        pin={pin}
        again={again}
        onPin={setPin}
        onAgain={setAgain}
        label={needsCurrent ? 'Your new PIN (6 digits)' : 'Choose a 6-digit PIN'}
      />
    </Sheet>
  );
}

/**
 * Once, after a sign-in with a one-time code by someone with no PIN (SignInForm remembers to ask).
 * "Not now" and "Save my PIN" both end it; Staff & sign-in still offers "Set my PIN" later.
 */
export function PinPrompt() {
  const { session, lost } = useAuth();
  const person = session?.online ? (session.person ?? null) : null;
  const [open, setOpen] = useState(() => askPinFor(person?.staffId));
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(t);
  }, [saved]);

  if (saved) return <Toast message="PIN saved. Next time, sign in with your mobile number and this PIN." />;
  if (!open || !session || !person) return null;
  const done = () => {
    forgetAskPin();
    setOpen(false);
  };
  return (
    <SetPinSheet
      sessionKey={session.ownerKey}
      phone={person.phone}
      needsCurrent={false}
      title="Set your own PIN"
      intro="Save your own PIN. Next time, sign in with your mobile number and this PIN. You won’t need a code from the owner."
      cancelLabel="Not now"
      onClose={done}
      onSaved={() => {
        done();
        setSaved(true);
      }}
      onLost={lost}
    />
  );
}
