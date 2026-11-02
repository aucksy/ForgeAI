/**
 * F137 "Busy machines" (OWNER-INBOX #68, owner 29 Oct 2026: "make it a feature the owner switches on in the
 * admin app; on switching it on, they enter how many of each machine they have, from a ready list; they can
 * add a missing machine with its count").
 *
 * Settings -> Member app -> Busy machines (/settings/machines). Off by default. The owner ticks the switch,
 * types how many of each machine the gym has (empty = none), and can add a machine that is missing, with its
 * count and the exercises done on it. Each machine then says what the app is doing with it ("Learning",
 * "Members see tips. Right 5 of the last 6 weeks"). The front desk reads it. Saved on the gym's server (0049):
 * needs the gym online. Until 0049 is on the server the Settings card is not shown at all. Rules and words:
 * logic/busyMachines.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { READY_EXERCISE_NAMES, READY_MACHINES } from '@forgeai/theme';

import { useAuth } from '../../auth/AuthProvider';
import { dateISOFromEpoch, formatDay } from '../../logic/dates';
import {
  MACHINES_HOW,
  MACHINES_MEMBER_SEES,
  MACHINES_SAVED,
  countedInDraft,
  draftFrom,
  machineErrorWords,
  machineStatusWords,
  machinesChanged,
  machinesPayload,
  newOwnId,
  type MachineDraft,
  type MachineSetup,
  type OwnMachineDraft,
} from '../../logic/busyMachines';
import * as machinesApi from '../../shop/machinesApi';
import { errorWords } from '../../shop/logic';
import { Button, Card, CheckField, EmptyState, ErrorBanner, Grid, PageHeader, SearchField, SectionTitle, TextField, Toast, color, font, space } from '../kit';
import { navigate } from '../router';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; saved: MachineSetup };

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;

function failWords(e: unknown): string {
  return machineErrorWords(e) ?? errorWords(e);
}

/** Settings -> Member app: the card that opens the screen. Hidden until the gym's server has busy machines. */
export function BusyMachinesCard() {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [shown, setShown] = useState(machinesApi.machineServer() === 'yes');
  useEffect(() => {
    if (!key || machinesApi.machineServer() !== 'unknown') return;
    let live = true;
    machinesApi
      .getMachineSetup(key)
      .then((r) => {
        if (live) setShown(r !== 'missing');
      })
      .catch((e: unknown) => console.warn('[busy machines] checking the server', e));
    return () => {
      live = false;
    };
  }, [key]);
  if (!key || !shown) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Busy machines</SectionTitle>
      <p style={quiet}>Tell members when a machine is usually busy, so they can pick a quieter day. Off until you switch it on.</p>
      <div style={{ marginTop: space.lg }}>
        <Button variant="ghost" needsInternet onClick={() => navigate('/settings/machines')}>
          Open busy machines
        </Button>
      </div>
    </Card>
  );
}

export function BusyMachinesScreen() {
  const { session } = useAuth();
  const online = Boolean(session?.online);
  const key = online ? (session?.ownerKey ?? null) : null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const fetchSetup = useCallback(async () => {
    if (!key) return;
    setLoad({ state: 'loading' });
    try {
      const r = await machinesApi.getMachineSetup(key);
      setLoad(r === 'missing' ? { state: 'missing' } : { state: 'ready', saved: r });
    } catch (e) {
      console.warn('[ForgeErr] busy machines: reading', e);
      setLoad({ state: 'error', message: failWords(e) });
    }
  }, [key]);

  useEffect(() => {
    void fetchSetup();
  }, [fetchSetup]);

  return (
    <>
      <PageHeader
        title="Busy machines"
        subtitle="Tell members when a machine is usually busy"
        actions={
          <Button variant="ghost" onClick={() => navigate('/settings/app')}>
            Back to Settings
          </Button>
        }
      />
      {!online || !key ? (
        <Card>
          <EmptyState title="Busy machines need your gym online" body="Put your gym online first (Settings → Sign-in & data)." />
        </Card>
      ) : load.state === 'missing' ? (
        <Card>
          <EmptyState title="Busy machines are not ready for your gym yet" body="They will appear here once your gym’s server has them." />
        </Card>
      ) : load.state === 'error' ? (
        <Card>
          <ErrorBanner>{load.message}</ErrorBanner>
          <Button variant="ghost" onClick={() => void fetchSetup()}>
            Try again
          </Button>
        </Card>
      ) : load.state === 'loading' ? (
        <p style={quiet}>Loading…</p>
      ) : load.saved.canEdit ? (
        <MachinesEditor ownerKey={key} saved={load.saved} onSaved={(saved) => setLoad({ state: 'ready', saved })} />
      ) : (
        <MachinesReadOnly saved={load.saved} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- the front desk: read-only

function MachinesReadOnly({ saved }: { saved: MachineSetup }) {
  return (
    <Card>
      <SectionTitle>{saved.enabled ? 'Switched on' : 'Switched off'}</SectionTitle>
      {saved.machines.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {saved.machines.map((m) => (
            <li key={m.id}>{`${m.name}: ${m.units}. ${machineStatusWords(m, saved.enabled)}`}</li>
          ))}
        </ul>
      ) : (
        <p style={quiet}>No machines yet.</p>
      )}
      <p style={{ ...small, marginTop: space.md }}>Only the owner can change this.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- the owner: the editor

function MachinesEditor({ ownerKey, saved, onSaved }: { ownerKey: string; saved: MachineSetup; onSaved: (s: MachineSetup) => void }) {
  const [draft, setDraft] = useState<MachineDraft>(() => draftFrom(saved));
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const changed = machinesChanged(draft, saved);
  const counted = countedInDraft(draft);
  const byId = useMemo(() => new Map(saved.machines.map((m) => [m.id, m])), [saved]);
  const q = search.trim().toLowerCase();
  const shownReady = READY_MACHINES.filter((m) => !q || m.name.toLowerCase().includes(q));

  const set = (next: MachineDraft) => {
    setError(null);
    setDraft(next);
  };
  const setOwn = (id: string, patch: Partial<OwnMachineDraft>) =>
    set({ ...draft, own: draft.own.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  const save = async () => {
    if (saving) return;
    const { payload, problem } = machinesPayload(draft);
    if (!payload) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const answer = await machinesApi.saveMachineSetup(ownerKey, draft.enabled, payload);
      onSaved(answer);
      setDraft(draftFrom(answer));
      setToast(MACHINES_SAVED);
    } catch (e) {
      console.warn('[ForgeErr] busy machines: saving', e);
      setError(failWords(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card style={{ marginBottom: space.lg }}>
        <CheckField checked={draft.enabled} onChange={(v) => set({ ...draft, enabled: v })} hint={MACHINES_MEMBER_SEES}>
          Show busy machines to members
        </CheckField>
        <p style={{ ...quiet, marginTop: space.md }}>{MACHINES_HOW}</p>
        {saved.enabled && saved.membersSending != null && (
          <p style={{ ...small, marginTop: space.sm }}>{`${saved.membersSending} members’ phones sent workouts in the last 5 weeks.`}</p>
        )}
        {saved.updatedAt && (
          <p style={{ ...small, marginTop: space.xs }}>
            {`Last saved ${formatDay(dateISOFromEpoch(saved.updatedAt))}${saved.updatedByName ? ` by ${saved.updatedByName}` : ''}.`}
          </p>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>How many of each do you have?</SectionTitle>
        <p style={{ ...quiet, marginBottom: space.md }}>
          {`Leave it empty if you don’t have it. ${counted === 1 ? '1 machine' : `${counted} machines`} on your list can get busy (you have 1 or 2).`}
        </p>
        <SearchField value={search} onChange={setSearch} placeholder="Find a machine" />
        <div style={{ marginTop: space.md }}>
          <Grid min={220}>
            {shownReady.map((m) => {
              const s = byId.get(m.id);
              return (
                <div key={m.id}>
                  <TextField
                    label={m.name}
                    value={draft.counts[m.id] ?? ''}
                    onChange={(v) => set({ ...draft, counts: { ...draft.counts, [m.id]: v } })}
                    inputMode="numeric"
                    placeholder="None"
                    hint={s && !s.own ? machineStatusWords(s, saved.enabled) : undefined}
                  />
                </div>
              );
            })}
          </Grid>
          {shownReady.length === 0 && <p style={quiet}>No machine on the list has that name. Add it below.</p>}
        </div>
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Machines you added</SectionTitle>
        {draft.own.length === 0 && <p style={{ ...quiet, marginBottom: space.md }}>A machine that is not on the list? Add it with how many you have.</p>}
        <div style={{ display: 'grid', gap: space.lg }}>
          {draft.own.map((o) => (
            <OwnMachineEditor
              key={o.id}
              machine={o}
              status={byId.get(o.id) ? machineStatusWords(byId.get(o.id)!, saved.enabled) : null}
              onChange={(patch) => setOwn(o.id, patch)}
              onRemove={() => set({ ...draft, own: draft.own.filter((x) => x.id !== o.id) })}
            />
          ))}
        </div>
        <div style={{ marginTop: space.md }}>
          <Button
            variant="ghost"
            onClick={() => set({ ...draft, own: [...draft.own, { id: newOwnId(draft.own), name: '', units: '1', ex: [] }] })}
            disabled={draft.own.length >= 30}
          >
            Add a machine
          </Button>
        </div>
      </Card>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div style={{ display: 'flex', gap: space.md, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={save} disabled={saving || !changed} needsInternet>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {!changed && <span style={small}>No changes to save.</span>}
      </div>
      {toast && <Toast message={toast} />}
    </>
  );
}

const ALL_EXERCISES = Object.entries(READY_EXERCISE_NAMES)
  .map(([key, name]) => ({ key, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

function OwnMachineEditor({
  machine,
  status,
  onChange,
  onRemove,
}: {
  machine: OwnMachineDraft;
  status: string | null;
  onChange: (patch: Partial<OwnMachineDraft>) => void;
  onRemove: () => void;
}) {
  const [find, setFind] = useState('');
  const f = find.trim().toLowerCase();
  const matches = f ? ALL_EXERCISES.filter((e) => !machine.ex.includes(e.key) && e.name.toLowerCase().includes(f)).slice(0, 8) : [];
  return (
    <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: space.md }}>
      <Grid min={200}>
        <TextField label="Machine name" value={machine.name} onChange={(v) => onChange({ name: v })} placeholder="For example: Belt squat" />
        <TextField label="How many?" value={machine.units} onChange={(v) => onChange({ units: v })} inputMode="numeric" />
      </Grid>
      <p style={{ ...quiet, marginTop: space.md }}>Which exercises are done on it?</p>
      {machine.ex.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
          {machine.ex.map((k) => (
            <Button key={k} variant="ghost" ariaLabel={`Remove ${READY_EXERCISE_NAMES[k] ?? k}`} onClick={() => onChange({ ex: machine.ex.filter((x) => x !== k) })}>
              {`${READY_EXERCISE_NAMES[k] ?? k} ✕`}
            </Button>
          ))}
        </div>
      )}
      <div style={{ marginTop: space.sm }}>
        <SearchField value={find} onChange={setFind} placeholder="Find an exercise" />
      </div>
      {matches.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
          {matches.map((e) => (
            <Button
              key={e.key}
              variant="ghost"
              ariaLabel={`Add ${e.name}`}
              onClick={() => {
                onChange({ ex: [...machine.ex, e.key] });
                setFind('');
              }}
            >
              {`+ ${e.name}`}
            </Button>
          ))}
        </div>
      )}
      {f && matches.length === 0 && <p style={{ ...small, marginTop: space.sm }}>No exercise with that name.</p>}
      {status && <p style={{ ...small, marginTop: space.sm }}>{status}</p>}
      <div style={{ marginTop: space.md }}>
        <Button variant="ghost" tone="danger" onClick={onRemove}>
          Remove this machine
        </Button>
      </div>
    </div>
  );
}
