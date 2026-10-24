/**
 * Visits -> "Member from another branch" (#41). A member whose plan covers every branch can train
 * here: the desk types their mobile number, sees their first name and branch, and checks them in.
 * The visit is kept in the member's own branch (so their attendance stays true) and listed here
 * under "From other branches today". Needs the internet (the other branch's records are not on
 * this device). Desk and owner alike.
 */

import { useCallback, useEffect, useState } from 'react';

import { normalizeMobile } from '../auth/signin';
import { useCrm } from '../store';
import { Button, Card, ErrorBanner, Pill, Row, SectionTitle, TextField, color, font, space } from '../ui/kit';
import * as branchApi from './api';
import { branchFailWords, useBranchActions } from './BranchProvider';
import { useBranches } from './context';
import { visitorWords, type Visitor, type VisitorToday } from './logic';

function timeOf(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

export function VisitorsCard({ onToast }: { onToast: (msg: string) => void }) {
  const { multi } = useBranches();
  const { currentKey, serverReady } = useBranchActions();
  const { today } = useCrm();
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<Visitor[] | null>(null);
  const [visitors, setVisitors] = useState<VisitorToday[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVisitors = useCallback(async () => {
    if (!currentKey) return;
    try {
      setVisitors(await branchApi.visitorsOn(currentKey, today));
    } catch (e) {
      console.warn('[ForgeErr] branch_visitors', e);
    }
  }, [currentKey, today]);

  useEffect(() => {
    if (multi && serverReady) void loadVisitors();
  }, [multi, serverReady, loadVisitors]);

  if (!multi || !serverReady || !currentKey) return null;

  const find = async () => {
    const ten = normalizeMobile(phone);
    if (!ten) return setError('Type their 10-digit mobile number, like 98290 12345.');
    setBusy(true);
    setError(null);
    try {
      setFound(await branchApi.findVisitor(currentKey, ten));
    } catch (e) {
      console.warn('[ForgeErr] branch_find_visitor', e);
      setError(branchFailWords(e));
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async (v: Visitor) => {
    setBusy(true);
    setError(null);
    try {
      const r = await branchApi.checkInVisitor(currentKey, v.gymId, v.memberId);
      onToast(r.alreadyIn ? `${r.firstName || 'They'} were already checked in today.` : `${r.firstName || 'Member'} (${r.branchName}) checked in.`);
      setFound(null);
      setPhone('');
      await loadVisitors();
    } catch (e) {
      console.warn('[ForgeErr] branch_check_in_visitor', e);
      setError(branchFailWords(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (v: VisitorToday) => {
    setBusy(true);
    setError(null);
    try {
      await branchApi.undoVisitor(currentKey, v.gymId, v.memberId, today);
      onToast(`Check-in removed for ${v.firstName || 'that member'}.`);
      await loadVisitors();
    } catch (e) {
      console.warn('[ForgeErr] branch_undo_visitor', e);
      setError(branchFailWords(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Member from another branch</SectionTitle>
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        Type their mobile number. If their plan covers every branch, you can check them in here.
      </p>
      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <TextField label="Their mobile number" prefix="+91" inputMode="tel" value={phone} onChange={(v) => { setPhone(v); setFound(null); }} placeholder="98290 12345" />
      <div style={{ marginTop: space.sm }}>
        <Button variant="ghost" disabled={busy} onClick={() => void find()}>
          {busy && !found ? 'Looking…' : 'Find'}
        </Button>
      </div>

      {found && found.length === 0 && (
        <p style={{ marginTop: space.md, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          No member of your other branches has this number.
        </p>
      )}
      {found?.map((v) => (
        <div key={`${v.gymId}:${v.memberId}`} style={{ marginTop: space.md, borderTop: `1px solid ${color.border}`, paddingTop: space.md }}>
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.ink }}>{visitorWords(v)}</p>
          {v.allowed && !v.alreadyIn && (
            <div style={{ marginTop: space.sm }}>
              <Button disabled={busy} onClick={() => void checkIn(v)} ariaLabel={`Check in ${v.firstName} from ${v.branchName}`}>
                Check in
              </Button>
            </div>
          )}
        </div>
      ))}

      {visitors.length > 0 && (
        <div style={{ marginTop: space.lg }}>
          <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.inkSecondary, marginBottom: space.sm }}>
            From other branches today
          </div>
          <div style={{ display: 'grid', gap: space.xs }}>
            {visitors.map((v) => (
              <Row key={`${v.gymId}:${v.memberId}`} gap={space.md} wrap={false}>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkMuted, minWidth: 62 }}>{timeOf(v.checkedInAt)}</span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: 14, color: color.ink }}>{v.firstName || 'Member'}</span>
                <Pill tone="muted">{v.branchName}</Pill>
                {v.source === 'app' && <Pill tone="muted">App</Pill>}
                <Button variant="quiet" disabled={busy} onClick={() => void undo(v)} ariaLabel={`Undo check-in for ${v.firstName} from ${v.branchName}`}>
                  Undo
                </Button>
              </Row>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
