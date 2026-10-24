/**
 * Member detail → Body measurements (R-120, 24 Oct 2026). The trainer or the owner measures a member
 * at the desk: body weight, body fat and the tape measurements, one entry per day. The history shows
 * the newest first with the change since last time; an entry can be fixed or deleted. Saved on the
 * gym's server (0035), so it needs the gym online and the internet; the member sees the numbers in
 * their MettleUp app (Progress → Body) marked "From <gym>". Words and rules: logic/bodyMeasures.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import {
  draftOfMeasure,
  emptyMeasureDraft,
  measureErrorWords,
  measureLines,
  measurePayload,
  signed,
  TAPE_KINDS,
  TAPE_LABEL,
  valueText,
  type BodyMeasure,
  type MeasureDraft,
} from '../../logic/bodyMeasures';
import { formatDay, formatDayShort } from '../../logic/dates';
import { isNoSuchFunction } from '../../logic/workoutOffer';
import * as bodyApi from '../../shop/bodyApi';
import { errorWords } from '../../shop/logic';
import { useCrm } from '../../store';
import { Button, Card, EmptyState, ErrorBanner, SectionTitle, Sheet, TextField, color, font, radius, space } from '../kit';

/** Where the member finds them (said under the section and in the form). */
export const MEMBER_SEES_MEASURES = 'Members see these in their MettleUp app (Progress → Body) after they check in at the gym once.';

const SHOW_FIRST = 4;

type Server = 'unknown' | 'yes' | 'no';

function failWords(e: unknown): string {
  return measureErrorWords(e) ?? errorWords(e);
}

export function MemberMeasurementsCard({ memberId, memberName, onSaved }: { memberId: string; memberName: string; onSaved?: (msg: string) => void }) {
  const { session } = useAuth();
  const online = Boolean(session?.online);
  const key = online ? (session?.ownerKey ?? null) : null;
  const [server, setServer] = useState<Server>('unknown');
  const [list, setList] = useState<BodyMeasure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MeasureDraft | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const rows = await bodyApi.listMeasures(key, memberId);
      setServer('yes');
      setList(rows);
      setError(null);
    } catch (e) {
      if (isNoSuchFunction(e)) {
        setServer('no');
        return;
      }
      console.warn('[ForgeErr] measurements: reading the list', e);
      setError(failWords(e));
    }
  }, [key, memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { today } = useCrm();
  const history = useMemo(() => measureLines(list ?? []), [list]);
  const shown = showAll ? history : history.slice(0, SHOW_FIRST);

  const addButton =
    online && server === 'yes' ? (
      <Button variant="ghost" needsInternet onClick={() => setEditing(emptyMeasureDraft(today))}>
        + Add
      </Button>
    ) : undefined;

  return (
    <Card style={{ marginBottom: space.lg }}>
      <section aria-label="Body measurements">
      <SectionTitle action={addButton}>Body measurements</SectionTitle>
      {!online ? (
        <p style={quiet}>Measurements are kept on your gym’s server. Put your gym online first (Settings → Put your gym online).</p>
      ) : server === 'no' ? (
        <p style={quiet}>Measurements are not switched on for your gym yet.</p>
      ) : error && list == null ? (
        <>
          <ErrorBanner>{error}</ErrorBanner>
          <Button variant="ghost" onClick={() => void load()}>
            Try again
          </Button>
        </>
      ) : list == null ? (
        <p style={quiet}>Loading…</p>
      ) : list.length === 0 ? (
        <EmptyState
          title="No measurements yet"
          body={`Measure ${memberName} at the desk: body weight, body fat and the tape measurements. ${MEMBER_SEES_MEASURES}`}
          action={
            <Button needsInternet onClick={() => setEditing(emptyMeasureDraft(today))}>
              Add measurements
            </Button>
          }
        />
      ) : (
        <>
          <p style={{ ...quiet, marginBottom: space.sm }}>{MEMBER_SEES_MEASURES}</p>
          <div style={{ display: 'grid', gap: space.sm }}>
            {shown.map(({ entry, lines }) => (
              <div key={entry.id} style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: `${space.sm}px ${space.md}px` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}>{formatDay(entry.date)}</div>
                    {entry.byName && <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>Measured by {entry.byName}</div>}
                  </div>
                  <Button variant="quiet" needsInternet ariaLabel={`Fix the measurements of ${formatDay(entry.date)}`} onClick={() => setEditing(draftOfMeasure(entry))}>
                    Fix
                  </Button>
                </div>
                <ul aria-label={`Measurements of ${formatDay(entry.date)}`} style={{ listStyle: 'none', margin: `${space.xs}px 0 0`, padding: 0, display: 'flex', flexWrap: 'wrap', gap: `4px ${space.md}px` }}>
                  {lines.map((l) => (
                    <li key={l.key} style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
                      {l.label} <strong style={{ color: color.ink }}>{valueText(l)}</strong>
                      {l.change != null && <span style={{ color: color.inkMuted }}> ({signed(l.change)})</span>}
                    </li>
                  ))}
                </ul>
                {entry.note && <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 4, overflowWrap: 'anywhere' }}>Desk note: {entry.note}</div>}
              </div>
            ))}
          </div>
          {history.length > SHOW_FIRST && (
            <div style={{ marginTop: space.sm }}>
              <Button variant="quiet" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${history.length}`}
              </Button>
            </div>
          )}
          {history.length > 1 && <p style={{ ...quiet, fontSize: 12, marginTop: space.sm }}>Numbers in brackets show the change since the previous measurement.</p>}
        </>
      )}

      {editing && key && (
        <MeasureSheet
          initial={editing}
          memberId={memberId}
          memberName={memberName}
          ownerKey={key}
          today={today}
          lastDate={list && list.length > 0 ? list[0].date : null}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null);
            onSaved?.(msg);
            void load();
          }}
        />
      )}
      </section>
    </Card>
  );
}

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

function MeasureSheet({
  initial,
  memberId,
  memberName,
  ownerKey,
  today,
  lastDate,
  onClose,
  onDone,
}: {
  initial: MeasureDraft;
  memberId: string;
  memberName: string;
  ownerKey: string;
  today: string;
  lastDate: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<MeasureDraft>(initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editingSaved = Boolean(initial.id);

  const save = async () => {
    if (busy) return;
    const { payload, problems: p } = measurePayload(draft, today);
    setProblems(p);
    setError(p.empty ?? null);
    if (!payload) return;
    setBusy(true);
    try {
      await bodyApi.saveMeasure(ownerKey, memberId, payload);
      onDone(editingSaved ? 'Measurements updated.' : `Measurements saved. ${memberName} sees them in the MettleUp app.`);
    } catch (e) {
      console.warn('[ForgeErr] measurements: saving', e);
      setError(failWords(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || !initial.id) return;
    setBusy(true);
    try {
      await bodyApi.deleteMeasure(ownerKey, initial.id);
      onDone('Measurements deleted.');
    } catch (e) {
      console.warn('[ForgeErr] measurements: deleting', e);
      setError(failWords(e));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<MeasureDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setTape = (k: (typeof TAPE_KINDS)[number], v: string) => setDraft((d) => ({ ...d, tape: { ...d.tape, [k]: v } }));

  if (confirmDelete) {
    return (
      <Sheet
        title="Delete these measurements?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep them
            </Button>
            <Button tone="danger" needsInternet disabled={busy} onClick={() => void remove()}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p style={quiet}>
          The measurements of <strong style={{ color: color.ink }}>{formatDay(draft.date)}</strong> go from your list and from {memberName}’s app the next time it
          checks the gym.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={editingSaved ? 'Fix measurements' : 'Add measurements'}
      onClose={onClose}
      footer={
        <>
          {editingSaved && (
            <Button variant="quiet" tone="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button needsInternet disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={{ ...quiet, fontSize: 13 }}>
        {memberName}. Fill in only what you measured{lastDate && !editingSaved ? `; last time was ${formatDayShort(lastDate)}` : ''}.
      </p>
      <TextField label="Day measured" type="date" value={draft.date} onChange={(v) => set({ date: v })} error={problems.date} />
      <div style={boxGrid}>
        <TextField label="Body weight (kg)" inputMode="decimal" value={draft.weightKg} onChange={(v) => set({ weightKg: v })} error={problems.weightKg} placeholder="72.5" />
        <TextField label="Body fat (%)" inputMode="decimal" value={draft.bodyFat} onChange={(v) => set({ bodyFat: v })} error={problems.bodyFat} placeholder="Optional" />
      </div>
      <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 600, color: color.ink, marginTop: space.lg }}>Tape measurements (cm)</div>
      <div style={boxGrid}>
        {TAPE_KINDS.map((k) => (
          <TextField key={k} label={TAPE_LABEL[k]} inputMode="decimal" value={draft.tape[k] ?? ''} onChange={(v) => setTape(k, v)} error={problems[k]} />
        ))}
      </div>
      <TextField label="Desk note (only your gym sees it)" value={draft.note} onChange={(v) => set({ note: v })} error={problems.note} placeholder="Optional, like “after Diwali break”" />
    </Sheet>
  );
}

const boxGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', columnGap: space.md } as const;
