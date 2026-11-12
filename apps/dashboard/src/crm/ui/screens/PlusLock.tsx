/**
 * F56 MettleUp Plus, the gym owner's switch (owner R-461, 12 Nov 2026): Settings -> Member app.
 *
 * Members of the gym get every paid feature of the MettleUp app free. This card decides what happens when a
 * member's plan ends: ON (the default, owner's "A") = the paid extras lock 7 days later until the member renews;
 * OFF = they stay free. The member's own workouts and history are never locked. The owner changes it; the front
 * desk reads it. Hidden until the gym's server has 0070 (plusLockApi.ts), and for a gym that is not online.
 */

import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { dateISOFromEpoch, formatDay } from '../../logic/dates';
import { PLUS_LOCK_WORDS, plusLockCardShown, plusLockChangedLine, type PlusLock } from '../../logic/plusLock';
import * as plusLockApi from '../../shop/plusLockApi';
import { errorWords } from '../../shop/logic';
import { Button, Card, CheckField, ErrorBanner, SectionTitle, Toast, color, font, space } from '../kit';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;

const dayOf = (ms: number) => formatDay(dateISOFromEpoch(ms));

export function PlusLockCard() {
  const { session } = useAuth();
  // Hidden, with no server call, until MettleUp Plus is switched on for members (the shared switch).
  const switchedOn = plusLockCardShown();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [saved, setSaved] = useState<PlusLock | null>(null);
  const [on, setOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!switchedOn || !key || plusLockApi.plusLockServer() === 'no') return;
    let live = true;
    plusLockApi
      .getPlusLock(key)
      .then((r) => {
        if (!live || r === 'missing') return;
        setSaved(r);
        setOn(r.lockAfterEnd);
      })
      .catch((e: unknown) => console.warn('[plus lock] reading the switch', e));
    return () => {
      live = false;
    };
  }, [key, switchedOn]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!switchedOn || !key || !saved) return null;
  const W = PLUS_LOCK_WORDS;
  const changedLine = plusLockChangedLine(saved, dayOf);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await plusLockApi.savePlusLock(key, on);
      setSaved(r);
      setOn(r.lockAfterEnd);
      setToast(r.lockAfterEnd ? W.savedOn : W.savedOff);
    } catch (e) {
      console.warn('[ForgeErr] plus lock: saving', e);
      setError(errorWords(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{W.title}</SectionTitle>
      <p style={quiet}>{W.body}</p>
      {saved.canEdit ? (
        <>
          <CheckField checked={on} onChange={setOn} hint={W.switchHint} disabled={busy}>
            {W.switchLabel}
          </CheckField>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <div style={{ marginTop: space.md }}>
            <Button needsInternet disabled={busy || on === saved.lockAfterEnd} onClick={save}>
              {W.save}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...quiet, marginTop: space.md }} data-testid="plus-lock-desk">
            {saved.lockAfterEnd ? W.deskOn : W.deskOff}
          </p>
          <p style={{ ...small, marginTop: space.sm }}>{W.ownerOnly}</p>
        </>
      )}
      {changedLine && <p style={{ ...small, marginTop: space.md }}>{changedLine}</p>}
      {toast && <Toast message={toast} />}
    </Card>
  );
}
