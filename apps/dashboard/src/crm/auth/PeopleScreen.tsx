/**
 * Settings -> Staff & sign-in (14 Oct 2026; Gym Panel step 1).
 *
 * Who may open this gym's panel, and the SIGN-IN CODES the owner makes for them. Until a real
 * SMS/WhatsApp OTP service is wired in, the owner is the OTP service: "Make sign-in code" shows a
 * 6-digit code (once, 30 minutes) to read out at the desk or send on WhatsApp. The same button on
 * the owner's own row is how the owner signs in on a new phone.
 *
 * Owners can add people, make codes, sign people out and remove them. Staff see only themselves.
 */

import { useCallback, useEffect, useState } from 'react';

import { tr } from '../i18n';
import { copyText } from '../shop/JoinCode';
import { useCrm } from '../store';
import {
  Button,
  Card,
  ErrorBanner,
  PageHeader,
  Pill,
  Row,
  SectionTitle,
  SelectField,
  Sheet,
  TextField,
  Toast,
  color,
  font,
  radius,
  space,
} from '../ui/kit';
import { navigate } from '../ui/router';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { staffRightsWords } from './permissions';
import {
  authErrorCode,
  authErrorWords,
  codeMessage,
  CODE_MINUTES,
  formatCode,
  formatMobile,
  normalizeMobile,
  whatsAppToMobile,
  type MadeCode,
  type PersonRow,
  type Role,
} from './signin';

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function seenWords(p: PersonRow): string {
  if (p.devices === 0) return p.lastSeenAt ? tr('Signed out', 'Sign out hai') : tr('Not signed in yet', 'Abhi sign in nahi kiya');
  return p.devices === 1 ? tr('Signed in on 1 device', '1 device par sign in') : tr(`Signed in on ${p.devices} devices`, `${p.devices} devices par sign in`);
}

const bodyText = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

export function PeopleScreen() {
  const { session, signOut, lost } = useAuth();
  const { snapshot } = useCrm();
  const key = session?.ownerKey ?? '';
  const me = session?.person ?? null;
  const isOwner = me?.role === 'owner';

  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    | { kind: 'add' }
    | { kind: 'code'; code: MadeCode }
    | { kind: 'remove'; person: PersonRow }
    | { kind: 'signout'; person: PersonRow }
    | { kind: 'me-signout' }
    | null
  >(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  const fail = useCallback(
    (e: unknown): string => {
      if (authErrorCode(e) === 'BAD_KEY') lost();
      return authErrorWords(e);
    },
    [lost],
  );

  const load = useCallback(async () => {
    if (!key || !isOwner) return;
    try {
      setPeople(await authApi.listPeople(key));
      setLoadError(null);
    } catch (e) {
      setLoadError(fail(e));
    }
  }, [key, isOwner, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const makeCode = async (p: PersonRow) => {
    setBusyId(p.staffId);
    setRowError(null);
    try {
      const code = await authApi.makeCode(key, p.staffId);
      setSheet({ kind: 'code', code });
      void load();
    } catch (e) {
      setRowError(fail(e));
      void load();
    } finally {
      setBusyId(null);
    }
  };

  // Not signed in with a mobile number (a browser-only gym, or an old demo key): nothing to show
  // but the way to get there.
  if (!session?.online || !me) {
    return (
      <>
        <PageHeader
          title={tr('Staff & sign-in', 'Staff ka login')}
          subtitle={tr('Who can open this gym, on which phone', 'Yeh gym kaun khol sakta hai, kis phone par')}
        />
        <Card>
          <p style={bodyText}>
            {tr(
              'Put your records online first (Settings → Put your records online). Then you and your staff sign in with a mobile number, on any phone or computer.',
              'Pehle records Online daalo (Settings → Records online daalo). Phir aap aur aapka Staff Mobile number se kisi bhi phone ya computer par Sign in karenge.',
            )}
          </p>
          <div style={{ marginTop: space.lg }}>
            <Button onClick={() => navigate('/settings')}>{tr('Go to Settings', 'Settings kholo')}</Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={tr('Staff & sign-in', 'Staff ka login')}
        subtitle={tr('Who can open this gym, on which phone', 'Yeh gym kaun khol sakta hai, kis phone par')}
        actions={isOwner ? <Button onClick={() => setSheet({ kind: 'add' })}>{tr('Add a person', 'Naya vyakti jodo')}</Button> : undefined}
      />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('You', 'Aap')}</SectionTitle>
        <Row gap={space.sm}>
          <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>{me.name}</strong>
          <Pill tone={isOwner ? 'accent' : 'muted'}>{isOwner ? tr('Owner', 'Owner') : tr('Staff', 'Staff')}</Pill>
        </Row>
        <p style={{ ...bodyText, marginTop: 4 }}>+91 {formatMobile(me.phone)}</p>
        <div style={{ marginTop: space.lg }}>
          <Button variant="ghost" onClick={() => setSheet({ kind: 'me-signout' })}>
            {tr('Sign out of this device', 'Is device se sign out karo')}
          </Button>
        </div>
      </Card>

      {!isOwner && (
        <Card>
          <p style={bodyText}>
            {tr(
              'Only an owner can add people or make sign-in codes. Ask your gym owner.',
              'Sirf Owner log jod sakta hai ya Sign-in code bana sakta hai. Gym Owner se poochho.',
            )}
          </p>
          <p style={{ ...bodyText, marginTop: space.md, fontSize: 13, color: color.inkMuted }}>{staffRightsWords()}</p>
        </Card>
      )}

      {isOwner && (
        <Card>
          <SectionTitle>{tr('People who can sign in', 'Kaun sign in kar sakta hai')}</SectionTitle>
          <p style={bodyText}>
            {tr(
              'To let someone in — or to use a new phone yourself — tap ',
              'Kisi ko andar aane dene ke liye — ya khud naya phone use karne ke liye — ',
            )}
            <b>{tr('Make sign-in code', 'Sign-in code banao')}</b>
            {tr(
              ` and give them the code. It works once, for ${CODE_MINUTES} minutes.`,
              ` dabao aur unhe Code do. Yeh ek baar, ${CODE_MINUTES} minute tak chalta hai.`,
            )}
          </p>
          {loadError && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>{loadError}</ErrorBanner>
            </div>
          )}
          {rowError && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>{rowError}</ErrorBanner>
            </div>
          )}
          {people === null && !loadError && <p style={{ ...bodyText, marginTop: space.lg }}>{tr('Loading…', 'Load ho raha hai…')}</p>}
          <div style={{ display: 'grid', gap: space.md, marginTop: space.lg }}>
            {(people ?? []).map((p) => (
              <div
                key={p.staffId}
                style={{
                  border: `1px solid ${color.borderStrong}`,
                  borderRadius: radius.md,
                  padding: space.lg,
                  minWidth: 0,
                }}
              >
                <Row gap={space.sm}>
                  <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>{p.name}</strong>
                  <Pill tone={p.role === 'owner' ? 'accent' : 'muted'}>{p.role === 'owner' ? tr('Owner', 'Owner') : tr('Staff', 'Staff')}</Pill>
                  {p.me && <Pill tone="good">{tr('You', 'Aap')}</Pill>}
                </Row>
                <p style={{ ...bodyText, marginTop: 4 }}>
                  +91 {formatMobile(p.phone)} · {seenWords(p)}
                  {p.codeUntil ? tr(` · Code waiting till ${clock(p.codeUntil)}`, ` · Code ${clock(p.codeUntil)} tak chalega`) : ''}
                </p>
                <div style={{ marginTop: space.md }}>
                  <Row gap={space.sm}>
                    <Button disabled={busyId !== null} onClick={() => void makeCode(p)}>
                      {busyId === p.staffId ? tr('Making…', 'Ban raha hai…') : tr('Make sign-in code', 'Sign-in code banao')}
                    </Button>
                    {p.devices > (p.me ? 1 : 0) && (
                      <Button variant="ghost" onClick={() => setSheet({ kind: 'signout', person: p })}>
                        {p.me ? tr('Sign out other devices', 'Baaki devices se sign out karo') : tr('Sign out everywhere', 'Har jagah se sign out karo')}
                      </Button>
                    )}
                    {!p.me && (
                      <Button variant="quiet" tone="danger" onClick={() => setSheet({ kind: 'remove', person: p })}>
                        {tr('Remove', 'Hatao')}
                      </Button>
                    )}
                  </Row>
                </div>
              </div>
            ))}
          </div>
          <p style={{ ...bodyText, marginTop: space.lg, fontSize: 13, color: color.inkMuted }}>
            {staffRightsWords()}
          </p>
        </Card>
      )}

      {sheet?.kind === 'add' && (
        <AddPersonSheet
          onClose={closeSheet}
          onAdded={async (name) => {
            setSheet(null);
            setToast(tr(`${name} added. Now make a sign-in code for them.`, `${name} jud gaye. Ab unke liye Sign-in code banao.`));
            await load();
          }}
          add={(name, phone, role) => authApi.addPerson(key, name, phone, role)}
          fail={fail}
        />
      )}

      {sheet?.kind === 'code' && (
        <CodeSheet code={sheet.code} gymName={snapshot.gym.name} forMe={sheet.code.staffId === me.staffId} onClose={closeSheet} />
      )}

      {(sheet?.kind === 'remove' || sheet?.kind === 'signout') && (
        <ConfirmSheet
          title={
            sheet.kind === 'remove'
              ? tr(`Remove ${sheet.person.name}?`, `${sheet.person.name} ko hatayein?`)
              : sheet.person.me
                ? tr('Sign out your other devices?', 'Apne baaki devices se sign out karein?')
                : tr(`Sign ${sheet.person.name} out everywhere?`, `${sheet.person.name} ko har jagah se sign out karein?`)
          }
          words={
            sheet.kind === 'remove'
              ? tr(
                  `${sheet.person.name} is signed out of every phone and computer and can’t sign in again. Your records stay as they are.`,
                  `${sheet.person.name} har phone aur computer se Sign out ho jayenge aur phir Sign in nahi kar payenge. Aapke records waise hi rahenge.`,
                )
              : sheet.person.me
                ? tr(
                    'Every other phone or computer signed in as you is signed out. This one stays signed in.',
                    'Aapke naam se Sign in baaki har phone ya computer Sign out ho jayega. Yeh wala Sign in rahega.',
                  )
                : tr(
                    `${sheet.person.name} is signed out of every phone and computer. They can sign in again with a new code.`,
                    `${sheet.person.name} har phone aur computer se Sign out ho jayenge. Naye Code se phir Sign in kar sakte hain.`,
                  )
          }
          action={sheet.kind === 'remove' ? tr('Remove', 'Hatao') : tr('Sign out', 'Sign out karo')}
          onClose={closeSheet}
          run={async () => {
            if (sheet.kind === 'remove') await authApi.removePerson(key, sheet.person.staffId);
            else await authApi.signOutPerson(key, sheet.person.staffId);
            setSheet(null);
            setToast(sheet.kind === 'remove' ? tr(`${sheet.person.name} removed.`, `${sheet.person.name} hata diye.`) : tr('Signed out.', 'Sign out ho gaya.'));
            await load();
          }}
          fail={fail}
        />
      )}

      {sheet?.kind === 'me-signout' && (
        <ConfirmSheet
          title={tr('Sign out of this device?', 'Is device se sign out karein?')}
          words={tr(
            'Your records stay online. To come back, sign in with your mobile number and a new code (an owner makes it in Staff & sign-in).',
            'Aapke records Online rahenge. Wapas aane ke liye Mobile number aur naye Code se Sign in karo (Owner ise Staff ka login mein banata hai).',
          )}
          action={tr('Sign out', 'Sign out karo')}
          onClose={closeSheet}
          run={async () => {
            navigate('/');
            await signOut();
          }}
          fail={fail}
        />
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}

function AddPersonSheet({
  onClose,
  onAdded,
  add,
  fail,
}: {
  onClose: () => void;
  onAdded: (name: string) => Promise<void>;
  add: (name: string, phone: string, role: Role) => Promise<unknown>;
  fail: (e: unknown) => string;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const ten = normalizeMobile(phone);
    if (!name.trim()) return setError(tr('Type their name.', 'Unka naam likho.'));
    if (!ten) return setError(tr('Type a 10-digit mobile number, like 98290 12345.', '10 digit ka mobile number likho, jaise 98290 12345.'));
    setBusy(true);
    setError(null);
    try {
      await add(name, ten, role);
      await onAdded(name.trim());
    } catch (e) {
      setError(fail(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={tr('Add a person', 'Naya vyakti jodo')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Rehne do')}
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? tr('Adding…', 'Jod rahe hain…') : tr('Add', 'Jodo')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <TextField label={tr('Name', 'Naam')} value={name} onChange={setName} placeholder="Suresh" autoFocus />
      <TextField label={tr('Mobile number', 'Mobile number')} prefix="+91" inputMode="tel" value={phone} onChange={setPhone} placeholder="98290 12345" />
      <SelectField
        label={tr('What can they do?', 'Yeh kya kar sakte hain?')}
        value={role}
        onChange={(v) => setRole(v === 'owner' ? 'owner' : 'staff')}
        options={[
          { value: 'staff', label: tr('Staff — front desk: add, collect, check in', 'Staff — front desk: jodo, Fees lo, Hazri') },
          { value: 'owner', label: tr('Owner — everything, including money totals', 'Owner — sab kuch, kul paisa bhi') },
        ]}
      />
    </Sheet>
  );
}

function CodeSheet({ code, gymName, forMe, onClose }: { code: MadeCode; gymName: string; forMe: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = codeMessage(code.name, gymName, code.phone, code.code);
  return (
    <Sheet
      title={forMe ? tr('Your sign-in code', 'Aapka Sign-in code') : tr(`Sign-in code for ${code.name}`, `${code.name} ka Sign-in code`)}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {tr('Done', 'Ho gaya')}
        </Button>
      }
    >
      <div
        aria-label={tr(`Code ${code.code.split('').join(' ')}`, `Code ${code.code.split('').join(' ')}`)}
        style={{
          textAlign: 'center',
          fontFamily: font.mono,
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: 4,
          color: color.ink,
          padding: `${space.lg}px 0`,
        }}
      >
        {formatCode(code.code)}
      </div>
      <p style={{ ...bodyText, textAlign: 'center' }}>
        {tr(
          `Works once, till ${clock(code.expiresAt)} (${CODE_MINUTES} minutes).`,
          `Ek baar chalega, ${clock(code.expiresAt)} tak (${CODE_MINUTES} minute).`,
        )}
      </p>
      <p style={{ ...bodyText, marginTop: space.md }}>
        {forMe
          ? tr(
              `On your new phone or computer, open forgeai.aakashpahuja.in, tap Sign in, and type +91 ${formatMobile(code.phone)} and this code.`,
              `Naye phone ya computer par forgeai.aakashpahuja.in kholo, Sign in dabao, aur +91 ${formatMobile(code.phone)} aur yeh Code likho.`,
            )
          : tr(
              `${code.name} opens forgeai.aakashpahuja.in, taps Sign in, and types +91 ${formatMobile(code.phone)} and this code. Read it out, or send it on WhatsApp.`,
              `${code.name} forgeai.aakashpahuja.in kholein, Sign in dabayein, aur +91 ${formatMobile(code.phone)} aur yeh Code likhein. Bol kar batao, ya WhatsApp par bhejo.`,
            )}
      </p>
      <div style={{ marginTop: space.lg, display: 'grid', gap: space.sm }}>
        {!forMe && (
          <a
            href={whatsAppToMobile(code.phone, message)}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              borderRadius: radius.pill,
              background: '#25D366',
              color: '#06280F',
              fontFamily: font.body,
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            {tr('Send on WhatsApp', 'WhatsApp par bhejo')}
          </a>
        )}
        <Button
          variant="ghost"
          full
          onClick={async () => {
            setCopied(await copyText(code.code));
          }}
        >
          {copied ? tr('Code copied', 'Code copy ho gaya') : tr('Copy the code', 'Code copy karo')}
        </Button>
      </div>
    </Sheet>
  );
}

function ConfirmSheet({
  title,
  words,
  action,
  onClose,
  run,
  fail,
}: {
  title: string;
  words: string;
  action: string;
  onClose: () => void;
  run: () => Promise<void>;
  fail: (e: unknown) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Rehne do')}
          </Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await run();
              } catch (e) {
                setError(fail(e));
                setBusy(false);
              }
            }}
          >
            {busy ? tr('Working…', 'Ho raha hai…') : action}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={bodyText}>{words}</p>
    </Sheet>
  );
}
