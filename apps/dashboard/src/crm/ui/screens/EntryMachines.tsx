/**
 * F103 / T77 step 2 (owner request R-378): Settings -> Entry machines (/settings/entry), and the machine
 * number on a member's page.
 *
 * The owner adds the gym's eSSL / ZKTeco finger or face machine by its serial number, following the setup
 * steps shown here with our address; the list shows each machine Online / Offline, when it last called, and
 * the entries it refused today. The front desk reads the list and may change a member's machine number;
 * only the owner adds or removes a machine.
 *
 * NOT LIVE: needs supabase/migrations/0059 (NOT APPLIED) and the gate Worker (NOT DEPLOYED). Until then the
 * screen says plainly "Entry machines are not ready for your gym yet", and nothing is saved or pretended.
 * Words and states: machines/entryMachineAdmin.ts (entryScreenView).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  BRANDS,
  DEFAULT_MACHINE_NAME,
  ENTRY_WORDS,
  checkMachineNumber,
  checkNewMachine,
  defaultMachineNumber,
  enrolLine,
  entryErrorWords,
  entryScreenView,
  numberOwners,
  setupSteps,
  type MachineRowView,
} from '../../machines/entryMachineAdmin';
import { noteAccessChange } from '../../machines/accessChanges';
import type { MachineFamily } from '../../machines/entryMachine';
import * as entryApi from '../../shop/entryMachinesApi';
import { errorWords } from '../../shop/logic';
import { useCrm } from '../../store';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill, SectionTitle, Sheet, TextField, Toast, color, font, space } from '../kit';
import { navigate } from '../router';
import { refreshEntryMachines, useEntryMachines } from '../useEntryMachines';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;

function failWords(e: unknown): string {
  return entryErrorWords(e) ?? errorWords(e);
}

/** The screen's clock: Online / Offline is read again every 30 seconds while the screen is open. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
}

function useToast(): [string | null, (m: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);
  return [toast, setToast];
}

// ---------------------------------------------------------------- Settings card

/** Settings -> Gym: the card that opens the screen (shown to everyone; the screen says if it is not ready). */
export function EntryMachinesCard() {
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Entry machines</SectionTitle>
      <p style={quiet}>{ENTRY_WORDS.card}</p>
      <div style={{ marginTop: space.lg }}>
        <Button variant="ghost" needsInternet onClick={() => navigate('/settings/entry')}>
          Open entry machines
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the screen

export function EntryMachinesScreen() {
  const { snapshot, today } = useCrm();
  const { load, key } = useEntryMachines();
  const now = useNow(30_000);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MachineRowView | null>(null);
  const [toast, setToast] = useToast();

  // Read again with the clock while the screen is open, so Online / Offline is current.
  useEffect(() => {
    if (key && load.state === 'ready') void refreshEntryMachines(key);
  }, [now]);

  const owners = useMemo(() => numberOwners(load.state === 'ready' ? (load.numbers ?? {}) : {}), [load]);
  const nameOfNo = useCallback(
    (no: string) => {
      const id = owners.get(no);
      return id ? (snapshot.members.find((m) => m.id === id)?.fullName ?? null) : null;
    },
    [owners, snapshot.members],
  );
  const view = entryScreenView(load, now, today, nameOfNo);
  const serials = load.state === 'ready' ? load.machines.map((m) => m.serial) : [];

  return (
    <>
      <PageHeader
        title="Entry machines"
        subtitle="Finger or face machines at your gym’s door"
        actions={
          <Button variant="ghost" onClick={() => navigate('/settings')}>
            Back to Settings
          </Button>
        }
      />
      {view.kind === 'loading' && <p style={quiet}>Loading…</p>}
      {view.kind === 'message' && (
        <Card>
          <div data-testid={view.testId}>
            <EmptyState
              title={view.title}
              body={view.body}
              action={
                view.retry ? (
                  <Button variant="ghost" onClick={() => void refreshEntryMachines(key)}>
                    Try again
                  </Button>
                ) : undefined
              }
            />
          </div>
        </Card>
      )}
      {view.kind === 'empty' && (
        <Card>
          <div data-testid="entry-empty">
            <EmptyState
              title={view.title}
              body={view.body}
              action={
                view.canAdd ? (
                  <Button needsInternet onClick={() => setAdding(true)}>
                    Add a machine
                  </Button>
                ) : undefined
              }
            />
          </div>
        </Card>
      )}
      {view.kind === 'list' && (
        <>
          <div style={{ display: 'grid', gap: space.lg, marginBottom: space.lg }}>
            {view.rows.map((r) => (
              <MachineCard key={r.id} row={r} canRemove={view.canAdd} onRemove={() => setRemoving(r)} />
            ))}
          </div>
          {view.canAdd ? (
            <Button variant="ghost" needsInternet onClick={() => setAdding(true)}>
              Add a machine
            </Button>
          ) : (
            view.note && <p style={small}>{view.note}</p>
          )}
        </>
      )}
      {adding && key && (
        <AddMachineSheet
          ownerKey={key}
          serials={serials}
          onClose={() => setAdding(false)}
          onAdded={(name) => {
            setAdding(false);
            setToast(`Saved. ${name} shows Online within a minute of its first call.`);
          }}
        />
      )}
      {removing && key && (
        <RemoveMachineSheet
          ownerKey={key}
          row={removing}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            setToast(`${removing.name} removed.`);
            setRemoving(null);
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function MachineCard({ row, canRemove, onRemove }: { row: MachineRowView; canRemove: boolean; onRemove: () => void }) {
  return (
    <Card>
      <div data-testid="entry-machine" style={{ display: 'grid', gap: space.xs }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: font.display, fontSize: 17, fontWeight: 700, color: color.ink }}>{row.name}</span>
          <Pill tone={row.tone}>{row.statusWords}</Pill>
          {row.paused && <Pill tone="warn">Switched off</Pill>}
        </div>
        <p style={quiet}>{`${row.brand} · Serial ${row.serial}`}</p>
        <p style={small}>{row.statusLine}</p>
        {row.refusedLine && <p style={{ ...quiet, color: color.criticalText }}>{row.refusedLine}</p>}
        {row.lastRefusedLine && <p style={small}>{row.lastRefusedLine}</p>}
        {row.unknownLine && <p style={small}>{row.unknownLine}</p>}
        {canRemove && (
          <div style={{ marginTop: space.sm }}>
            <Button variant="ghost" tone="danger" needsInternet ariaLabel={`Remove ${row.name}`} onClick={onRemove}>
              Remove
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function AddMachineSheet({
  ownerKey,
  serials,
  onClose,
  onAdded,
}: {
  ownerKey: string;
  serials: readonly string[];
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const [family, setFamily] = useState<MachineFamily>('zk-adms');
  const [serial, setSerial] = useState('');
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<{ field: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const steps = setupSteps();

  const save = async () => {
    if (busy) return;
    const c = checkNewMachine({ family, serial, name }, serials);
    if (!c.ok) return setProblem({ field: c.field, message: c.message });
    setProblem(null);
    setBusy(true);
    try {
      await entryApi.addEntryMachine(ownerKey, { serial: c.serial, name: c.name, family: c.family });
      await refreshEntryMachines(ownerKey);
      onAdded(c.name);
    } catch (e) {
      console.warn('[ForgeErr] entry machines: adding', e);
      setProblem({ field: 'serial', message: failWords(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Add a machine"
      onClose={onClose}
      wide
      footer={
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
          <Button needsInternet disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save machine'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <SectionTitle>Your machine’s brand</SectionTitle>
      <div role="group" aria-label="Your machine’s brand" style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
        {BRANDS.map((b) => (
          <Button
            key={b.family}
            variant={b.ready && family === b.family ? 'primary' : 'ghost'}
            disabled={!b.ready}
            onClick={() => setFamily(b.family)}
          >
            {b.ready ? b.label : `${b.label}: coming soon`}
          </Button>
        ))}
      </div>
      {problem?.field === 'brand' && <ErrorBanner>{problem.message}</ErrorBanner>}

      <ol style={{ margin: `${space.lg}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: space.md }}>
        {steps.map((s) => (
          <li key={s.title}>
            <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 14, color: color.ink }}>{s.title}</div>
            <ol style={{ margin: '4px 0 0', paddingLeft: 20, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
              {s.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <TextField
        label="Serial number"
        value={serial}
        onChange={(v) => {
          setSerial(v);
          setProblem(null);
        }}
        placeholder="CJDE231560123"
        error={problem?.field === 'serial' ? problem.message : null}
        hint="On the machine: Menu > System Info > Serial Number."
      />
      <TextField
        label="Machine name"
        value={name}
        onChange={(v) => {
          setName(v);
          setProblem(null);
        }}
        placeholder="Front door"
        error={problem?.field === 'name' ? problem.message : null}
        hint={`Leave it empty to call it "${DEFAULT_MACHINE_NAME}".`}
      />
    </Sheet>
  );
}

function RemoveMachineSheet({
  ownerKey,
  row,
  onClose,
  onRemoved,
}: {
  ownerKey: string;
  row: MachineRowView;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await entryApi.removeEntryMachine(ownerKey, row.id);
      await refreshEntryMachines(ownerKey);
      onRemoved();
    } catch (e) {
      console.warn('[ForgeErr] entry machines: removing', e);
      setError(failWords(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={`Remove ${row.name}?`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
          <Button tone="danger" needsInternet disabled={busy} onClick={remove}>
            {busy ? 'Removing…' : 'Remove machine'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
        </div>
      }
    >
      <p style={quiet}>
        MettleUp stops reading entries from this machine. Entries already in the register stay. Members and their fingers stay on the
        machine itself.
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}
    </Sheet>
  );
}

// ---------------------------------------------------------------- the member page

/** The member's machine number. Shown only when the gym has an entry machine. */
export function MachineNumberCard({ memberId }: { memberId: string }) {
  const { snapshot } = useCrm();
  const { load, key } = useEntryMachines();
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useToast();
  const member = snapshot.members.find((m) => m.id === memberId);
  if (!key || load.state !== 'ready' || load.machines.length === 0 || !member || member.archived) return null;
  const numbers = load.numbers ?? {};
  const no = numbers[memberId] ?? null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <div data-testid="machine-number">
        <SectionTitle>Entry machine</SectionTitle>
        {no ? (
          <>
            <p style={{ ...quiet, color: color.ink, fontWeight: 700 }}>{`Machine number: ${no}`}</p>
            <p style={{ ...quiet, marginTop: space.xs }}>{enrolLine(no)}</p>
          </>
        ) : (
          <p style={quiet}>No machine number yet.</p>
        )}
        <div style={{ marginTop: space.md }}>
          <Button variant="ghost" needsInternet onClick={() => setEditing(true)}>
            {no ? 'Change number' : 'Give a number'}
          </Button>
        </div>
      </div>
      {editing && (
        <MachineNumberSheet
          ownerKey={key}
          memberId={memberId}
          memberName={member.fullName}
          start={no ?? defaultMachineNumber(member, new Set(Object.values(numbers)))}
          hadNumber={no !== null}
          numbers={numbers}
          onClose={() => setEditing(false)}
          onSaved={(n) => {
            setEditing(false);
            setToast(no ? `Saved. Enrol the finger or face again on the machine with number ${n}.` : `Saved. ${enrolLine(n)}`);
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </Card>
  );
}

function MachineNumberSheet({
  ownerKey,
  memberId,
  memberName,
  start,
  hadNumber,
  numbers,
  onClose,
  onSaved,
}: {
  ownerKey: string;
  memberId: string;
  memberName: string;
  start: string;
  hadNumber: boolean;
  numbers: Readonly<Record<string, string>>;
  onClose: () => void;
  onSaved: (memberNo: string) => void;
}) {
  const { snapshot } = useCrm();
  const [text, setText] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    const c = checkMachineNumber(text, memberId, numbers, (id) => snapshot.members.find((m) => m.id === id)?.fullName ?? null);
    if (!c.ok) return setError(c.message);
    if (c.same) return onClose();
    setBusy(true);
    setError(null);
    try {
      await entryApi.setMachineNumbers(ownerKey, [{ memberId, memberNo: c.memberNo }]);
      await refreshEntryMachines(ownerKey);
      // The machines get this member under the new number (the server took the old one off).
      noteAccessChange({ memberId });
      onSaved(c.memberNo);
    } catch (e) {
      console.warn('[ForgeErr] entry machines: saving a number', e);
      setError(failWords(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={`Machine number for ${memberName}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
          <Button needsInternet disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save number'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <TextField
        label="Machine number"
        value={text}
        onChange={(v) => {
          setText(v);
          setError(null);
        }}
        inputMode="numeric"
        error={error}
        hint={
          hadNumber
            ? 'After a change, enrol the finger or face again on the machine with the new number.'
            : 'The number you type on the machine when you add this member there.'
        }
      />
    </Sheet>
  );
}
