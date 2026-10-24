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
import { useBranches } from '../branches/context';
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
  if (p.devices === 0) return p.lastSeenAt ? 'Signed out' : 'Not signed in yet';
  return p.devices === 1 ? 'Signed in on 1 device' : `Signed in on ${p.devices} devices`;
}

const bodyText = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

export function PeopleScreen() {
  const { session, signOut, lost } = useAuth();
  const { snapshot, desk } = useCrm();
  // Offline front desk, step 3: payments, members and check-ins made here that are not online yet.
  const unsent = desk ? desk.waiting - desk.held.length : 0;
  const refused = desk?.held.length ?? 0;
  const key = session?.ownerKey ?? '';
  const me = session?.person ?? null;
  const isOwner = me?.role === 'owner';
  // #41: with branches, this list is the OPEN branch's (owners are on every branch's list).
  const { multi: multiBranch } = useBranches();

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
          title="Staff & sign-in"
          subtitle="Who can open this gym, on which phone"
        />
        <Card>
          <p style={bodyText}>
            Put your gym online first (Settings → Put your gym online). Then you and your staff can sign in with a mobile number, on any phone or computer.
          </p>
          <div style={{ marginTop: space.lg }}>
            <Button onClick={() => navigate('/settings')}>Go to Settings</Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Staff & sign-in"
        subtitle="Who can open this gym, on which phone"
        actions={isOwner ? <Button onClick={() => setSheet({ kind: 'add' })}>Add a person</Button> : undefined}
      />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>You</SectionTitle>
        <Row gap={space.sm}>
          <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>{me.name}</strong>
          <Pill tone={isOwner ? 'accent' : 'muted'}>{isOwner ? 'Owner' : 'Staff'}</Pill>
        </Row>
        <p style={{ ...bodyText, marginTop: 4 }}>+91 {formatMobile(me.phone)}</p>
        <div style={{ marginTop: space.lg }}>
          <Button variant="ghost" onClick={() => setSheet({ kind: 'me-signout' })}>
            Sign out of this device
          </Button>
        </div>
      </Card>

      {!isOwner && (
        <Card>
          <p style={bodyText}>
            Only an owner can add people or make sign-in codes. Ask your gym owner.
          </p>
          <p style={{ ...bodyText, marginTop: space.md, fontSize: 13, color: color.inkMuted }}>{staffRightsWords(multiBranch)}</p>
        </Card>
      )}

      {isOwner && (
        <Card>
          <SectionTitle>People who can sign in</SectionTitle>
          <p style={bodyText}>
            {'To let someone in, or to use a new phone yourself, tap '}
            <b>Make sign-in code</b>
            {`. Then give them the code. It works once, for ${CODE_MINUTES} minutes.`}
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
          {people === null && !loadError && <p style={{ ...bodyText, marginTop: space.lg }}>Loading…</p>}
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
                  <Pill tone={p.role === 'owner' ? 'accent' : 'muted'}>{p.role === 'owner' ? 'Owner' : 'Staff'}</Pill>
                  {p.me && <Pill tone="good">You</Pill>}
                </Row>
                <p style={{ ...bodyText, marginTop: 4 }}>
                  +91 {formatMobile(p.phone)} · {seenWords(p)}
                  {p.codeUntil ? ` · Code works till ${clock(p.codeUntil)}` : ''}
                </p>
                <div style={{ marginTop: space.md }}>
                  <Row gap={space.sm}>
                    <Button disabled={busyId !== null} onClick={() => void makeCode(p)}>
                      {busyId === p.staffId ? 'Making…' : 'Make sign-in code'}
                    </Button>
                    {p.devices > (p.me ? 1 : 0) && (
                      <Button variant="ghost" onClick={() => setSheet({ kind: 'signout', person: p })}>
                        {p.me ? 'Sign out other devices' : 'Sign out everywhere'}
                      </Button>
                    )}
                    {!p.me && (
                      <Button variant="quiet" tone="danger" onClick={() => setSheet({ kind: 'remove', person: p })}>
                        Remove
                      </Button>
                    )}
                  </Row>
                </div>
              </div>
            ))}
          </div>
          <p style={{ ...bodyText, marginTop: space.lg, fontSize: 13, color: color.inkMuted }}>
            {staffRightsWords(multiBranch)}
          </p>
        </Card>
      )}

      {sheet?.kind === 'add' && (
        <AddPersonSheet
          onClose={closeSheet}
          onAdded={async (name) => {
            setSheet(null);
            setToast(`${name} added. Now make a sign-in code for them.`);
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
              ? `Remove ${sheet.person.name}?`
              : sheet.person.me
                ? 'Sign out your other devices?'
                : `Sign ${sheet.person.name} out everywhere?`
          }
          words={
            sheet.kind === 'remove'
              ? `${sheet.person.name} is signed out of every phone and computer. They can’t sign in again. Your members and payments stay as they are.`
              : sheet.person.me
                ? 'Every other phone or computer signed in as you is signed out. This one stays signed in.'
                : `${sheet.person.name} is signed out of every phone and computer. They can sign in again with a new code.`
          }
          action={sheet.kind === 'remove' ? 'Remove' : 'Sign out'}
          onClose={closeSheet}
          run={async () => {
            if (sheet.kind === 'remove') await authApi.removePerson(key, sheet.person.staffId);
            else await authApi.signOutPerson(key, sheet.person.staffId);
            setSheet(null);
            setToast(sheet.kind === 'remove' ? `${sheet.person.name} removed.` : 'Signed out.');
            await load();
          }}
          fail={fail}
        />
      )}

      {sheet?.kind === 'me-signout' && (
        <ConfirmSheet
          title="Sign out of this device?"
          words={
            unsent > 0
              ? `${unsent} saved on this device ${unsent === 1 ? 'is' : 'are'} still waiting to send. Wait for "All sent" at the top before you sign out.`
              : refused > 0
                ? `${refused} saved on this device could not be sent (see the top of the page). If you sign out, ${refused === 1 ? 'it stays' : 'they stay'} on this device until someone from this gym signs in here again.`
                : 'Your gym stays online. To come back, sign in with your mobile number and a new code. An owner makes the code in Staff & sign-in.'
          }
          action="Sign out"
          // Never sign out over unsent payments: they would wait on this device until someone signs in again.
          blocked={unsent > 0}
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
  const { multi } = useBranches();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const ten = normalizeMobile(phone);
    if (!name.trim()) return setError('Type their name.');
    if (!ten) return setError('Type a 10-digit mobile number, like 98290 12345.');
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
      title="Add a person"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <TextField label="Name" value={name} onChange={setName} placeholder="Suresh" autoFocus />
      <TextField label="Mobile number" prefix="+91" inputMode="tel" value={phone} onChange={setPhone} placeholder="98290 12345" />
      <SelectField
        label="What can they do?"
        value={role}
        onChange={(v) => setRole(v === 'owner' ? 'owner' : 'staff')}
        options={[
          { value: 'staff', label: multi ? 'Staff (front desk of this branch): add members, collect fees, check in' : 'Staff (front desk): add members, collect fees, check in' },
          { value: 'owner', label: multi ? 'Owner: everything, in every branch, including money totals' : 'Owner: everything, including money totals' },
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
      title={forMe ? 'Your sign-in code' : `Sign-in code for ${code.name}`}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div
        aria-label={`Code ${code.code.split('').join(' ')}`}
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
        {`Works once, till ${clock(code.expiresAt)} (${CODE_MINUTES} minutes).`}
      </p>
      <p style={{ ...bodyText, marginTop: space.md }}>
        {forMe
          ? `On your new phone or computer, open forgeai.aakashpahuja.in, tap Sign in, and type +91 ${formatMobile(code.phone)} and this code.`
          : `${code.name} opens forgeai.aakashpahuja.in, taps Sign in, and types +91 ${formatMobile(code.phone)} and this code. Read it out, or send it on WhatsApp.`}
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
            Send on WhatsApp
          </a>
        )}
        <Button
          variant="ghost"
          full
          onClick={async () => {
            setCopied(await copyText(code.code));
          }}
        >
          {copied ? 'Code copied' : 'Copy the code'}
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
  blocked = false,
}: {
  title: string;
  words: string;
  action: string;
  onClose: () => void;
  run: () => Promise<void>;
  fail: (e: unknown) => string;
  /** The action can't be done now (the words say why). */
  blocked?: boolean;
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
            Cancel
          </Button>
          <Button
            tone="danger"
            disabled={busy || blocked}
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
            {busy ? 'Working…' : action}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={bodyText}>{words}</p>
    </Sheet>
  );
}
