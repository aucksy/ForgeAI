/**
 * Settings -> Staff & sign-in (14 Oct 2026; Gym Panel step 1).
 *
 * Who may open this gym's panel, and the SIGN-IN CODES the owner makes for them. Until a real
 * SMS/WhatsApp OTP service is wired in, the owner is the OTP service: "Make sign-in code" shows a
 * 6-digit code (once, 30 minutes) to read out at the desk or send on WhatsApp. The same button on
 * the owner's own row is how the owner signs in on a new phone.
 *
 * Owners can add people, make codes, sign people out and remove them. Staff see only themselves.
 *
 * R-117 (0034): everyone sets their OWN lasting PIN in the "You" card ("Set my PIN" / "Change my
 * PIN"). The owner's list says who has one; "Sign out everywhere" also clears that person's PIN.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
import { tickGetStarted } from '../ui/GetStartedCard';
import { TrainerTick, useTrainerSetup } from '../ui/TrainerParts';
import { t } from '../lang/lang';
import {
  JOB_CHOICES,
  JOB_MAX,
  JOB_WORDS,
  cleanJob,
  jobHint,
  jobOf,
  jobsToSend,
  keepLocalJob,
  personPill,
  readLocalJobs,
  roleFor,
  type JobChoice,
} from '../logic/staffJobs';
import * as trainerApi from '../shop/trainerApi';
import * as authApi from './api';
import { useAuth } from './AuthProvider';
import { staffRightsWords } from './permissions';
import { useBranches } from '../branches/context';
import { SetPinSheet } from './PinForms';
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
  type Person,
  type PersonRow,
  type PinStatus,
  type Role,
} from './signin';

/** This browser's storage, or null when it is blocked (a private window): jobs then live only in the page. */
function browserStore(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function seenWords(p: PersonRow): string {
  if (p.devices === 0) return p.lastSeenAt ? 'Signed out' : 'Not signed in yet';
  return p.devices === 1 ? 'Signed in on 1 device' : `Signed in on ${p.devices} devices`;
}

/** 0034: " · PIN set" / " · No PIN yet" / " · PIN locked till 5:40 pm"; nothing on an older server. */
function pinWords(p: PersonRow): string {
  if (p.pinLockedUntil) return ` · PIN locked till ${clock(p.pinLockedUntil)} (too many wrong tries)`;
  if (p.hasPin === true) return ' · PIN set';
  if (p.hasPin === false) return ' · No PIN yet';
  return '';
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const trainers = useTrainerSetup();

  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    | { kind: 'add' }
    | { kind: 'code'; code: MadeCode }
    | { kind: 'remove'; person: PersonRow }
    | { kind: 'signout'; person: PersonRow }
    | { kind: 'me-signout' }
    | { kind: 'pin' }
    | null
  >(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // R-117: this device's own PIN (null: not known yet, or a server without PINs: nothing is shown).
  const [pin, setPin] = useState<PinStatus | null>(null);
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

  // R-522: the jobs typed under "Other" that wait on this browser until the gym's server has 0079.
  const gymId = snapshot.gym.gymId;
  const [localJobs, setLocalJobs] = useState<Record<string, string>>(() => readLocalJobs(browserStore(), gymId));
  useEffect(() => setLocalJobs(readLocalJobs(browserStore(), gymId)), [gymId]);

  /** Save a typed job on the server; before 0079 (or when it cannot be sent now) keep it on this browser. */
  const saveJob = useCallback(
    async (staffId: string, job: string) => {
      let saved = false;
      try {
        saved = (await authApi.setPersonJob(key, staffId, job)) === 'saved';
      } catch (e) {
        console.warn('[ForgeErr] staff job: saving; kept on this browser to send later', e);
      }
      setLocalJobs(keepLocalJob(browserStore(), gymId, staffId, saved ? null : job));
    },
    [key, gymId],
  );

  // Once the server has 0079 (its list carries `job`), send what waited here, then forget it. One try per list
  // read: a failure waits for the next time the list is read (never a loop).
  const triedFor = useRef<PersonRow[] | null>(null);
  useEffect(() => {
    if (!people || triedFor.current === people) return;
    const { send, forget } = jobsToSend(people, localJobs);
    if (send.length === 0 && forget.length === 0) return;
    triedFor.current = people;
    void (async () => {
      let next = localJobs;
      for (const id of forget) next = keepLocalJob(browserStore(), gymId, id, null);
      for (const s of send) {
        try {
          if ((await authApi.setPersonJob(key, s.staffId, s.job)) === 'saved') next = keepLocalJob(browserStore(), gymId, s.staffId, null);
        } catch (e) {
          console.warn('[ForgeErr] staff job: sending a job kept on this browser', e);
        }
      }
      setLocalJobs(next);
      if (send.length > 0) await load();
    })();
  }, [people, localJobs, key, gymId, load]);

  const loadPin = useCallback(async () => {
    if (!key || !me) return;
    try {
      setPin(await authApi.pinStatus(key));
    } catch (e) {
      // The PIN card is extra: the rest of the screen works without it.
      console.warn('[ForgeErr] staff_pin_status', e);
      setPin(null);
    }
  }, [key, me]);

  useEffect(() => {
    void loadPin();
  }, [loadPin]);

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
            Put your gym online first (Settings → Sign-in & data). Then you and your staff can sign in with a mobile number, on any phone or computer.
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
        actions={isOwner ? <Button onClick={() => setSheet({ kind: 'add' })}>{t('Add a person')}</Button> : undefined}
      />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>You</SectionTitle>
        <Row gap={space.sm}>
          <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>{me.name}</strong>
          <Pill tone={isOwner ? 'accent' : 'muted'}>{isOwner ? 'Owner' : 'Staff'}</Pill>
        </Row>
        <p style={{ ...bodyText, marginTop: 4 }}>+91 {formatMobile(me.phone)}</p>
        {pin?.canSet && (
          <p style={{ ...bodyText, marginTop: space.md }}>
            {pin.lockedUntil
              ? `Your PIN is locked till ${clock(pin.lockedUntil)} after too many wrong tries. You can still sign in with a code from the owner.`
              : pin.hasPin
                ? `You sign in with your mobile number and your own PIN${pin.setAt ? ` (set on ${day(pin.setAt)})` : ''}.`
                : 'You have no PIN yet. Set one, and you can sign in any time with your mobile number and your PIN.'}
          </p>
        )}
        <div style={{ marginTop: space.lg }}>
          <Row gap={space.sm}>
            {pin?.canSet && (
              <Button onClick={() => setSheet({ kind: 'pin' })}>{pin.hasPin ? 'Change my PIN' : 'Set my PIN'}</Button>
            )}
            <Button variant="ghost" onClick={() => setSheet({ kind: 'me-signout' })}>
              Sign out of this device
            </Button>
          </Row>
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
            {(people ?? []).map((p) => {
              // R-522: Owner, the typed job, Trainer (ticked), or Staff. Access is only ever owner or staff.
              const pill = personPill(
                { role: p.role, job: jobOf(p, localJobs) },
                trainers.setup?.people.some((x) => x.id === p.staffId && x.trainer) === true,
              );
              return (
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
                  <Pill tone={pill.kind === 'owner' ? 'accent' : 'muted'}>{pill.kind === 'job' ? pill.text : t(pill.text)}</Pill>
                  {p.me && <Pill tone="good">{t('You')}</Pill>}
                </Row>
                <p style={{ ...bodyText, marginTop: 4 }}>
                  +91 {formatMobile(p.phone)} · {seenWords(p)}
                  {pinWords(p)}
                  {p.codeUntil ? ` · Code works till ${clock(p.codeUntil)}` : ''}
                </p>
                {/* F109: the Trainer tick (hidden until the gym's server has the trainer view, 0050). */}
                <TrainerTick staffId={p.staffId} setup={trainers.setup} save={trainers.save} />
                <div style={{ marginTop: space.md }}>
                  <Row gap={space.sm}>
                    <Button disabled={busyId !== null} onClick={() => void makeCode(p)}>
                      {busyId === p.staffId ? 'Making…' : 'Make sign-in code'}
                    </Button>
                    {/* R-117: also for someone signed in nowhere who has a PIN, so it can be cleared. */}
                    {(p.devices > (p.me ? 1 : 0) || (!p.me && p.hasPin === true)) && (
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
              );
            })}
          </div>
          <p style={{ ...bodyText, marginTop: space.lg, fontSize: 13, color: color.inkMuted }}>
            {staffRightsWords(multiBranch)}
          </p>
        </Card>
      )}

      {sheet?.kind === 'add' && (
        <AddPersonSheet
          onClose={closeSheet}
          onAdded={async (person, choice, job) => {
            setSheet(null);
            let note = t(JOB_WORDS.added, { name: person.name });
            // R-522: Trainer = the front desk's access + the Trainer tick, the same call as the tick on their row.
            if (choice === 'trainer') {
              const problem = await trainers.save((k) => trainerApi.setTrainer(k, person.staffId, true));
              if (problem) {
                console.warn('[ForgeErr] add person: not marked as a trainer', problem);
                note = t(JOB_WORDS.notTrainer, { name: person.name });
              }
            }
            // Other = the front desk's access + the typed job on their row.
            if (choice === 'other' && job) await saveJob(person.staffId, job);
            setToast(note);
            // UAT 1 Nov 2026: Today's "Get started" step "Add your staff and trainers" ticks itself.
            tickGetStarted(snapshot.gym.gymId, 'staff');
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
                ? `Every other phone or computer signed in as you is signed out. This one stays signed in.${
                    sheet.person.hasPin ? ' Your PIN is cleared too. Set a new one in “You” above.' : ''
                  }`
                : `${sheet.person.name} is signed out of every phone and computer. They can sign in again with a new code.${
                    sheet.person.hasPin ? ' Their PIN stops working too. To get back in, they need a new code; then they set a new PIN.' : ''
                  }`
          }
          action={sheet.kind === 'remove' ? 'Remove' : 'Sign out'}
          onClose={closeSheet}
          run={async () => {
            if (sheet.kind === 'remove') await authApi.removePerson(key, sheet.person.staffId);
            else await authApi.signOutPerson(key, sheet.person.staffId);
            setSheet(null);
            setToast(sheet.kind === 'remove' ? `${sheet.person.name} removed.` : 'Signed out.');
            await load();
            // Signing yourself out of other devices clears your PIN (0034): show it.
            if (sheet.person.me) await loadPin();
          }}
          fail={fail}
        />
      )}

      {sheet?.kind === 'pin' && pin && (
        <SetPinSheet
          sessionKey={key}
          phone={me.phone}
          needsCurrent={pin.hasPin && pin.needsCurrent}
          title={pin.hasPin ? 'Change my PIN' : 'Set my PIN'}
          forgot={
            isOwner
              ? 'Forgot it? Make yourself a sign-in code in the list below, sign out, and sign in with that code. Then, for 15 minutes, you can set a new PIN without the old one. Stuck? Email MettleUp at contact@mettleup.fit.'
              : 'Forgot it? Ask your gym owner for a sign-in code, sign out, and sign in with that code. Then, for 15 minutes, you can set a new PIN without the old one.'
          }
          onClose={closeSheet}
          onSaved={() => {
            setSheet(null);
            setToast('PIN saved. Sign in with your mobile number and this PIN.');
            void loadPin();
            void load();
          }}
          onLost={lost}
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
  onAdded: (person: Person, choice: JobChoice, job: string | null) => Promise<void>;
  add: (name: string, phone: string, role: Role) => Promise<Person>;
  fail: (e: unknown) => string;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // R-522: Owner, Staff (front desk), Trainer or Other (type the job). Only Owner gives owner powers.
  const [choice, setChoice] = useState<JobChoice>('staff');
  const [jobText, setJobText] = useState('');
  const { multi } = useBranches();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  const save = async () => {
    const ten = normalizeMobile(phone);
    if (!name.trim()) return setError(t('Type their name.'));
    if (!ten) return setError(t('Type a 10-digit mobile number, like 98290 12345.'));
    const job = choice === 'other' ? cleanJob(jobText) : null;
    if (choice === 'other' && !job) {
      setError(null);
      return setJobError(t(JOB_WORDS.otherMissing));
    }
    setBusy(true);
    setError(null);
    setJobError(null);
    try {
      const person = await add(name, ten, roleFor(choice));
      await onAdded({ ...person, name: person.name || name.trim() }, choice, job);
    } catch (e) {
      setError(fail(e));
      setBusy(false);
    }
  };

  const label = (c: JobChoice): string => t(JOB_WORDS[c]);
  return (
    <Sheet
      title={t('Add a person')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? t('Adding…') : t('Add')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <TextField label={t('Name')} value={name} onChange={setName} placeholder="Suresh" autoFocus />
      <TextField label={t('Mobile number')} prefix="+91" inputMode="tel" value={phone} onChange={setPhone} placeholder="98290 12345" />
      <SelectField
        label={t(JOB_WORDS.label)}
        value={choice}
        onChange={(v) => {
          setChoice(JOB_CHOICES.includes(v as JobChoice) ? (v as JobChoice) : 'staff');
          setJobError(null);
        }}
        options={JOB_CHOICES.map((c) => ({ value: c, label: label(c) }))}
      />
      <p data-testid="job-hint" style={{ ...bodyText, marginTop: space.xs, fontSize: 13, color: color.inkMuted }}>
        {t(jobHint(choice, multi))}
      </p>
      {choice === 'other' && (
        <TextField
          label={t(JOB_WORDS.otherLabel)}
          value={jobText}
          onChange={(v) => {
            setJobText(v.slice(0, JOB_MAX));
            setJobError(null);
          }}
          placeholder="Manager"
          error={jobError}
          autoFocus
        />
      )}
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
          ? `On the phone or computer where you want to sign in, open app.mettleup.fit, tap Sign in, and type +91 ${formatMobile(code.phone)} and this code.`
          : `${code.name} opens app.mettleup.fit, taps Sign in, and types +91 ${formatMobile(code.phone)} and this code. Read it out, or send it on WhatsApp.`}
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
